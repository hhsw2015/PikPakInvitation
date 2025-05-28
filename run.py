import json
import os
import time
import uuid
import argparse  # 导入参数解析库
import random
import string
import logging

import requests
from flask import Flask, render_template, request, jsonify, send_from_directory, Response
from flask_cors import CORS


# 导入 pikpak.py 中的函数
from utils.pk_email import connect_imap
from utils.pikpak import (
    sign_encrypt,
    captcha_image_parse,
    ramdom_version,
    random_rtc_token,
    PikPak,
    save_account_info,
    test_proxy,
)

# 导入 email_client
from utils.email_client import EmailClient

# 导入数据库和会话管理器
from utils.database import db_manager
from utils.session_manager import session_manager

# 重试参数
max_retries = 3
retry_delay = 1.0

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 定义一个retry函数，用于重试指定的函数
def retry_function(func, *args, max_retries=3, delay=1, **kwargs):
    """
    对指定函数进行重试
    
    Args:
        func: 要重试的函数
        *args: 传递给函数的位置参数
        max_retries: 最大重试次数，默认为3
        delay: 每次重试之间的延迟（秒），默认为1
        **kwargs: 传递给函数的关键字参数
        
    Returns:
        函数的返回值，如果所有重试都失败则返回None
    """
    retries = 0
    result = None
    
    while retries < max_retries:
        if retries > 0:
            logger.info(f"第 {retries} 次重试函数 {func.__name__}...")
        
        result = func(*args, **kwargs)
        
        # 如果函数返回非None结果，视为成功
        if result is not None:
            if retries > 0:
                logger.info(f"在第 {retries} 次重试后成功")
            return result
        
        # 如果达到最大重试次数，返回最后一次结果
        if retries >= max_retries - 1:
            logger.warning(f"函数 {func.__name__} 在 {max_retries} 次尝试后失败")
            break
        
        # 等待指定的延迟时间
        time.sleep(delay)
        retries += 1
    
    return result

# 解析命令行参数
parser = argparse.ArgumentParser(description="PikPak 自动邀请注册系统")
args = parser.parse_args()

app = Flask(__name__, static_url_path='/assets')
# cors
CORS(app, resources={r"/*": {"origins": "*"}})
app.secret_key = os.urandom(24)

# 全局字典用于存储用户处理过程中的数据，以 email 为键
user_process_data = {}

@app.route("/api/health")
def health_check():
    
    in_huggingface = (
        os.environ.get("SPACE_ID") is not None or os.environ.get("SYSTEM") == "spaces"
    )

    return jsonify(
        {
            "status": "OK",
        }
    )

# 会话管理相关API
@app.route("/api/session/generate", methods=["POST"])
def generate_session():
    """生成新的会话ID或创建自定义会话ID"""
    try:
        data = request.get_json() or {}
        custom_id = data.get('custom_id')
        length = data.get('length', 12)
        
        if custom_id:
            # 使用自定义会话ID
            if not session_manager.is_valid_session_id(custom_id):
                return jsonify({
                    "status": "error",
                    "message": "自定义会话ID格式无效"
                })
            
            session_id = custom_id
        else:
            # 生成随机会话ID
            if length < 6 or length > 20:
                return jsonify({
                    "status": "error",
                    "message": "会话ID长度必须在6-20位之间"
                })
            
            session_id = session_manager.generate_session_id(length)
        
        # 在数据库中创建会话记录
        if db_manager.create_session(session_id):
            return jsonify({
                "status": "success",
                "session_id": session_id,
                "message": "会话ID创建成功"
            })
        else:
            return jsonify({
                "status": "error",
                "message": "会话创建失败"
            })
            
    except Exception as e:
        logger.error(f"生成会话ID失败: {e}")
        return jsonify({
            "status": "error",
            "message": "生成会话ID失败"
        })

@app.route("/api/session/validate", methods=["POST"])
def validate_session():
    """验证会话ID"""
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id', '')
        
        if not session_id:
            return jsonify({
                "status": "error",
                "message": "会话ID不能为空"
            })
        
        is_valid = session_manager.is_valid_session_id(session_id)
        is_admin = session_manager.is_admin(session_id)
        
        if is_valid:
            # 更新会话活跃时间
            db_manager.update_session_activity(session_id)
            
            return jsonify({
                "status": "success",
                "is_valid": True,
                "is_admin": is_admin,
                "message": "会话ID有效"
            })
        else:
            return jsonify({
                "status": "error",
                "is_valid": False,
                "is_admin": False,
                "message": "会话ID格式无效"
            })
            
    except Exception as e:
        logger.error(f"验证会话ID失败: {e}")
        return jsonify({
            "status": "error",
            "message": "验证会话ID失败"
        })

@app.route("/api/session/info", methods=["GET"])
def get_session_info():
    """获取会话信息"""
    try:
        session_id = request.headers.get('X-Session-ID', '')
        
        if not session_id:
            return jsonify({
                "status": "error",
                "message": "缺少会话ID"
            })
        
        is_valid = session_manager.is_valid_session_id(session_id)
        is_admin = session_manager.is_admin(session_id)
        
        return jsonify({
            "status": "success",
            "session_id": session_id,
            "is_valid": is_valid,
            "is_admin": is_admin
        })
        
    except Exception as e:
        logger.error(f"获取会话信息失败: {e}")
        return jsonify({
            "status": "error",
            "message": "获取会话信息失败"
        })

@app.route("/api/session/check_admin", methods=["POST"])
def check_admin():
    """专门用于检查会话是否为管理员权限"""
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id', '') or request.headers.get('X-Session-ID', '')
        
        if not session_id:
            return jsonify({
                "status": "error",
                "message": "缺少会话ID",
                "is_admin": False
            })
        
        # 验证会话ID格式
        if not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "会话ID格式无效",
                "is_admin": False
            })
        
        # 检查管理员权限
        is_admin = session_manager.is_admin(session_id)
        
        return jsonify({
            "status": "success",
            "session_id": session_id,
            "is_admin": is_admin,
            "message": f"会话权限检查完成，{'管理员' if is_admin else '普通用户'}权限"
        })
        
    except Exception as e:
        logger.error(f"检查管理员权限失败: {e}")
        return jsonify({
            "status": "error",
            "message": "检查管理员权限失败",
            "is_admin": False
        })


@app.route("/api/initialize", methods=["POST"])
def initialize():
    # 获取用户表单输入
    use_proxy = request.form.get("use_proxy") == "true"
    use_proxy_pool = request.form.get("use_proxy_pool") == "true"
    use_email_proxy = request.form.get("use_email_proxy") == "true"
    proxy_url = request.form.get("proxy_url", "")
    invite_code = request.form.get("invite_code", "")
    email = request.form.get("email", "")
    
    # 如果选择使用代理池，并且用户已启用代理，获取随机代理
    if use_proxy and use_proxy_pool:
        random_proxy = db_manager.get_random_proxy()
        if random_proxy:
            proxy_url = random_proxy
            logger.info(f"使用代理池代理: {proxy_url}")
        else:
            logger.warning("代理池中没有可用代理，将使用用户指定的代理或不使用代理")
            if not proxy_url:
                use_proxy = False
                use_proxy_pool = False
    elif use_proxy_pool and not use_proxy:
        # 如果只启用了代理池但没有启用代理，给出提示
        logger.info("代理池功能已启用，但未启用代理，将不使用代理池")
        use_proxy_pool = False

    # 初始化参数
    current_version = ramdom_version()
    version = current_version["v"]
    algorithms = current_version["algorithms"]
    client_id = "YNxT9w7GMdWvEOKa"
    client_secret = "dbw2OtmVEeuUvIptb1Coyg"
    package_name = "com.pikcloud.pikpak"
    device_id = str(uuid.uuid4()).replace("-", "")
    rtc_token = random_rtc_token()

    # 将这些参数存储到会话中以便后续使用
    # session["use_proxy"] = use_proxy
    # session["proxy_url"] = proxy_url
    # session["invite_code"] = invite_code
    # session["email"] = email
    # session["version"] = version
    # session["algorithms"] = algorithms
    # session["client_id"] = client_id
    # session["client_secret"] = client_secret
    # session["package_name"] = package_name
    # session["device_id"] = device_id
    # session["rtc_token"] = rtc_token

    # 如果启用代理，则测试代理
    proxy_status = None
    if use_proxy:
        proxy_status = test_proxy(proxy_url)

    # 创建PikPak实例
    pikpak = PikPak(
        invite_code,
        client_id,
        device_id,
        version,
        algorithms,
        email,
        rtc_token,
        client_secret,
        package_name,
        use_proxy=use_proxy,
        proxy_http=proxy_url,
        proxy_https=proxy_url,
    )

    # 初始化验证码
    init_result = pikpak.init("POST:/v1/auth/verification")
    if (
        not init_result
        or not isinstance(init_result, dict)
        or "captcha_token" not in init_result
    ):
        return jsonify(
            {"status": "error", "message": "初始化失败，请检查网络连接或代理设置"}
        )

    # 将用户数据存储在全局字典中
    user_data = {
        "use_proxy": use_proxy,
        "use_proxy_pool": use_proxy_pool,
        "use_email_proxy": use_email_proxy,
        "proxy_url": proxy_url,
        "invite_code": invite_code,
        "email": email,
        "version": version,
        "algorithms": algorithms,
        "client_id": client_id,
        "client_secret": client_secret,
        "package_name": package_name,
        "device_id": device_id,
        "rtc_token": rtc_token,
        "captcha_token": pikpak.captcha_token, # Store captcha_token here
    }
    user_process_data[email] = user_data

    return jsonify(
        {
            "status": "success",
            "message": "初始化成功，请进行滑块验证",
            "email": email, # Return email to client
            "proxy_status": proxy_status,
            "version": version,
            "device_id": device_id,
            "rtc_token": rtc_token,
        }
    )


@app.route("/api/verify_captcha", methods=["POST"])
def verify_captcha():
    # 尝试从表单或JSON获取email
    email = request.form.get('email')
    if not email and request.is_json:
        data = request.get_json()
        email = data.get('email')

    if not email:
        return jsonify({"status": "error", "message": "请求中未提供Email"})

    # 从全局字典获取用户数据
    user_data = user_process_data.get(email)
    if not user_data:
        return jsonify({"status": "error", "message": "会话数据不存在或已过期，请重新初始化"})

    # 从 user_data 中获取存储的数据
    device_id = user_data.get("device_id")
    # email = user_data.get("email") # Email is now the key, already have it
    invite_code = user_data.get("invite_code")
    client_id = user_data.get("client_id")
    version = user_data.get("version")
    algorithms = user_data.get("algorithms")
    rtc_token = user_data.get("rtc_token")
    client_secret = user_data.get("client_secret")
    package_name = user_data.get("package_name")
    use_proxy = user_data.get("use_proxy")
    proxy_url = user_data.get("proxy_url")
    captcha_token = user_data.get("captcha_token", "") # Use get with default

    # Check if essential data is present (device_id is checked as example)
    if not device_id:
        return jsonify({"status": "error", "message": "必要的会话数据丢失，请重新初始化"})


    # 创建PikPak实例 (使用从 user_data 获取的数据)
    pikpak = PikPak(
        invite_code,
        client_id,
        device_id,
        version,
        algorithms,
        email,
        rtc_token,
        client_secret,
        package_name,
        use_proxy=use_proxy,
        proxy_http=proxy_url,
        proxy_https=proxy_url,
    )

    # 从 user_data 设置验证码令牌
    pikpak.captcha_token = captcha_token

    # 尝试验证码验证
    max_attempts = 5
    captcha_result = None

    for attempt in range(max_attempts):
        try:
            captcha_result = captcha_image_parse(pikpak, device_id)
            if (
                captcha_result
                and "response_data" in captcha_result
                and captcha_result["response_data"].get("result") == "accept"
            ):
                break
            time.sleep(2)
        except Exception as e:
            time.sleep(2)

    if (
        not captcha_result
        or "response_data" not in captcha_result
        or captcha_result["response_data"].get("result") != "accept"
    ):
        return jsonify({"status": "error", "message": "滑块验证失败，请重试"})

    # 滑块验证加密
    try:
        executor_info = pikpak.executor()
        if not executor_info:
            return jsonify({"status": "error", "message": "获取executor信息失败"})

        sign_encrypt_info = sign_encrypt(
            executor_info,
            pikpak.captcha_token,
            rtc_token,
            pikpak.use_proxy,
            pikpak.proxies,
        )
        if (
            not sign_encrypt_info
            or "request_id" not in sign_encrypt_info
            or "sign" not in sign_encrypt_info
        ):
            return jsonify({"status": "error", "message": "签名加密失败"})

        # 更新验证码令牌
        report_result = pikpak.report(
            sign_encrypt_info["request_id"],
            sign_encrypt_info["sign"],
            captcha_result["pid"],
            captcha_result["traceid"],
        )

        # 请求邮箱验证码
        verification_result = pikpak.verification()
        if (
            not verification_result
            or not isinstance(verification_result, dict)
            or "verification_id" not in verification_result
        ):
            return jsonify({"status": "error", "message": "请求验证码失败"})

        # 将更新的数据保存到 user_data 中
        user_data["captcha_token"] = pikpak.captcha_token
        user_data["verification_id"] = pikpak.verification_id

        return jsonify({"status": "success", "message": "验证码已发送到邮箱，请查收"})

    except Exception as e:
        import traceback

        error_trace = traceback.format_exc()
        return jsonify(
            {
                "status": "error",
                "message": f"验证过程出错: {str(e)}",
                "trace": error_trace,
            }
        )

def gen_password():
    # 生成12位密码
    return "".join(random.choices(string.ascii_letters + string.digits, k=12))

@app.route("/api/register", methods=["POST"])
def register():
    try:
        # 从表单获取验证码和email
        verification_code = request.form.get("verification_code")
        email = request.form.get('email') # Get email from form

        if not email:
            return jsonify({"status": "error", "message": "请求中未提供Email"})

        if not verification_code:
            return jsonify({"status": "error", "message": "验证码不能为空"})

        # 从全局字典获取用户数据
        user_data = user_process_data.get(email)
        if not user_data:
            return jsonify({"status": "error", "message": "会话数据不存在或已过期，请重新初始化"})


        # 从 user_data 中获取存储的数据
        device_id = user_data.get("device_id")
        # email = user_data.get("email") # Already have email
        invite_code = user_data.get("invite_code")
        client_id = user_data.get("client_id")
        version = user_data.get("version")
        algorithms = user_data.get("algorithms")
        rtc_token = user_data.get("rtc_token")
        client_secret = user_data.get("client_secret")
        package_name = user_data.get("package_name")
        use_proxy = user_data.get("use_proxy")
        proxy_url = user_data.get("proxy_url")
        verification_id = user_data.get("verification_id")
        captcha_token = user_data.get("captcha_token", "")

        # Check if essential data is present
        if not device_id or not verification_id:
            return jsonify({"status": "error", "message": "必要的会话数据丢失，请重新初始化"})

        # 创建PikPak实例
        pikpak = PikPak(
            invite_code,
            client_id,
            device_id,
            version,
            algorithms,
            email,
            rtc_token,
            client_secret,
            package_name,
            use_proxy=use_proxy,
            proxy_http=proxy_url,
            proxy_https=proxy_url,
        )

        # 从 user_data 中设置验证码令牌和验证ID
        pikpak.captcha_token = captcha_token
        pikpak.verification_id = verification_id

        # 验证验证码
        pikpak.verify_post(verification_code)

        # 刷新时间戳并加密签名值
        pikpak.init("POST:/v1/auth/signup")

        # 注册并登录
        name = email.split("@")[0]
        password = gen_password()  # 默认密码
        signup_result = pikpak.signup(name, password, verification_code)

        # 填写邀请码
        pikpak.activation_code()

        if (
            not signup_result
            or not isinstance(signup_result, dict)
            or "access_token" not in signup_result
        ):
            return jsonify({"status": "error", "message": "注册失败，请检查验证码或重试"})

        # 保存账号信息到JSON文件
        account_info = {
            "captcha_token": pikpak.captcha_token,
            "timestamp": pikpak.timestamp,
            "name": name,
            "email": email,
            "password": password,
            "device_id": device_id,
            "version": version,
            "user_id": signup_result.get("sub", ""),
            "access_token": signup_result.get("access_token", ""),
            "refresh_token": signup_result.get("refresh_token", ""),
            "invite_code": invite_code,
        }

        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        logger.info(f"session_id: {session_id}")
        
        if not session_id or not session_manager.is_valid_session_id(session_id):
            logger.error(f"无效的会话ID: {session_id}")
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        logger.info(f"开始保存账号信息到数据库，会话ID: {session_id}")
        
        # 保存账号信息到数据库
        if db_manager.save_account(session_id, account_info):
            logger.info(f"账号信息保存到数据库成功")
            # 同时保存到文件（向后兼容）
            account_file = save_account_info(name, account_info)
            logger.info(f"account_file: {account_file}")
            return jsonify(
                {
                    "status": "success",
                    "message": "注册成功！账号已保存。",
                    "account_info": account_info,
                }
            )
        else:
            logger.error(f"保存账号信息到数据库失败")
            return jsonify({
                "status": "error",
                "message": "保存账号信息失败"
            })
            
    except Exception as e:
        logger.error(f"注册过程中发生异常: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": f"注册过程中发生错误: {str(e)}"
        })


@app.route("/api/test_proxy", methods=["POST"])
def test_proxy_route():
    proxy_url = request.form.get("proxy_url", "http://127.0.0.1:7890")
    result = test_proxy(proxy_url)

    return jsonify(
        {
            "status": "success" if result else "error",
            "message": "代理连接测试成功" if result else "代理连接测试失败",
        }
    )


@app.route("/api/get_verification", methods=["POST"])
def get_verification():
    """
    处理获取验证码的请求
    """
    email_user = request.form["email"]
    email_password = request.form["password"]

    # 先尝试从收件箱获取验证码
    result = connect_imap(email_user, email_password, "INBOX")

    # 如果收件箱没有找到验证码，则尝试从垃圾邮件中查找
    if result["code"] == 0:
        result = connect_imap(email_user, email_password, "Junk")

    return jsonify(result)


@app.route("/api/fetch_accounts", methods=["GET"])
def fetch_accounts():
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 检查是否为管理员
        is_admin = session_manager.is_admin(session_id)
        
        # 从数据库获取账号列表
        accounts = db_manager.get_accounts(session_id, is_admin)
        
        if not accounts:
            return jsonify({
                "status": "info", 
                "message": "没有找到保存的账号", 
                "accounts": [],
                "is_admin": is_admin
            })

        return jsonify({
            "status": "success",
            "message": f"找到 {len(accounts)} 个账号",
            "accounts": accounts,
            "is_admin": is_admin
        })
        
    except Exception as e:
        logger.error(f"获取账号列表失败: {e}")
        return jsonify({
            "status": "error",
            "message": "获取账号列表失败"
        })


@app.route("/api/update_account", methods=["POST"])
def update_account():
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        data = request.json
        if not data or "id" not in data or "account_data" not in data:
            return jsonify({"status": "error", "message": "请求数据不完整"})

        account_id = data.get("id")
        account_data = data.get("account_data")
        is_admin = session_manager.is_admin(session_id)

        # 更新数据库中的账号信息
        if db_manager.update_account(session_id, account_id, account_data, is_admin):
            return jsonify({"status": "success", "message": "账号信息更新成功"})
        else:
            return jsonify({"status": "error", "message": "更新失败，账号不存在或无权限"})
            
    except Exception as e:
        logger.error(f"更新账号失败: {e}")
        return jsonify({"status": "error", "message": f"更新失败: {str(e)}"})


@app.route("/api/delete_account", methods=["POST"])
def delete_account():
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        data = request.get_json() or {}
        is_admin = session_manager.is_admin(session_id)
        
        # 检查是否是批量删除
        if 'ids' in data:
            # 批量删除模式
            account_ids = data.get('ids', [])
            if not account_ids:
                return jsonify({"status": "error", "message": "未提供账号ID"})
            
            results = {
                "success": [],
                "failed": []
            }
            
            for account_id in account_ids:
                try:
                    if db_manager.delete_account(session_id, account_id, is_admin):
                        results["success"].append(account_id)
                    else:
                        results["failed"].append({"id": account_id, "reason": "删除失败或无权限"})
                except Exception as e:
                    results["failed"].append({"id": account_id, "reason": str(e)})
            
            # 返回批量删除结果
            if len(results["success"]) > 0:
                if len(results["failed"]) > 0:
                    message = f"成功删除 {len(results['success'])} 个账号，{len(results['failed'])} 个账号删除失败"
                    status = "partial"
                else:
                    message = f"成功删除 {len(results['success'])} 个账号"
                    status = "success"
            else:
                message = "所有账号删除失败"
                status = "error"
                
            return jsonify({
                "status": status,
                "message": message,
                "results": results
            })
        else:
            # 单个删除模式
            account_id = data.get("id")
            if not account_id:
                return jsonify({"status": "error", "message": "未提供账号ID"})

            if db_manager.delete_account(session_id, account_id, is_admin):
                return jsonify({"status": "success", "message": "账号已成功删除"})
            else:
                return jsonify({"status": "error", "message": "删除失败，账号不存在或无权限"})
                
    except Exception as e:
        logger.error(f"删除账号失败: {e}")
        return jsonify({"status": "error", "message": f"删除账号时出错: {str(e)}"})

@app.route("/api/migrate_data", methods=["POST"])
def migrate_data():
    """从文件迁移数据到数据库"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以执行数据迁移
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以执行数据迁移"
            })

        # 执行数据迁移
        migrated_count = db_manager.migrate_from_files()
        
        return jsonify({
            "status": "success",
            "message": f"数据迁移完成，共迁移 {migrated_count} 个账号",
            "migrated_count": migrated_count
        })
        
    except Exception as e:
        logger.error(f"数据迁移失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"数据迁移失败: {str(e)}"
        })

# 代理池管理API
@app.route("/api/proxy/list", methods=["GET"])
def get_proxy_list():
    """获取代理列表"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以查看代理列表
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以查看代理列表"
            })

        proxies = db_manager.get_proxy_list()
        
        return jsonify({
            "status": "success",
            "proxies": proxies,
            "total": len(proxies)
        })
        
    except Exception as e:
        logger.error(f"获取代理列表失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"获取代理列表失败: {str(e)}"
        })

@app.route("/api/proxy/add", methods=["POST"])
def add_proxy():
    """添加代理"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以添加代理
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以添加代理"
            })

        data = request.get_json() or {}
        proxy_url = data.get('proxy_url', '').strip()
        
        if not proxy_url:
            return jsonify({
                "status": "error",
                "message": "代理URL不能为空"
            })

        # 验证代理URL格式
        proxy_info = db_manager.parse_proxy_url(proxy_url)
        if not proxy_info:
            return jsonify({
                "status": "error",
                "message": "无效的代理URL格式，请使用: 协议://用户名:密码@主机:端口"
            })

        # 添加代理
        if db_manager.add_proxy(proxy_url):
            return jsonify({
                "status": "success",
                "message": "代理添加成功"
            })
        else:
            return jsonify({
                "status": "error",
                "message": "代理添加失败"
            })
        
    except Exception as e:
        logger.error(f"添加代理失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"添加代理失败: {str(e)}"
        })

@app.route("/api/proxy/remove", methods=["POST"])
def remove_proxy():
    """删除代理"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以删除代理
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以删除代理"
            })

        data = request.get_json() or {}
        proxy_id = data.get('proxy_id')
        
        if not proxy_id:
            return jsonify({
                "status": "error",
                "message": "代理ID不能为空"
            })

        # 删除代理
        if db_manager.remove_proxy(proxy_id):
            return jsonify({
                "status": "success",
                "message": "代理删除成功"
            })
        else:
            return jsonify({
                "status": "error",
                "message": "代理删除失败或不存在"
            })
        
    except Exception as e:
        logger.error(f"删除代理失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"删除代理失败: {str(e)}"
        })

@app.route("/api/proxy/test", methods=["POST"])
def test_proxy_single():
    """测试单个代理"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以测试代理
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以测试代理"
            })

        data = request.get_json() or {}
        proxy_url = data.get('proxy_url', '').strip()
        
        if not proxy_url:
            return jsonify({
                "status": "error",
                "message": "代理URL不能为空"
            })

        # 测试代理
        test_result = db_manager.test_proxy(proxy_url)
        
        # 查找代理ID并更新统计
        proxies = db_manager.get_proxy_list()
        proxy_id = None
        for proxy in proxies:
            if proxy['proxy_url'] == proxy_url:
                proxy_id = proxy['id']
                break
        
        if proxy_id:
            # 更新代理状态
            db_manager.update_proxy_status(
                proxy_id, 
                test_result['success'], 
                test_result.get('response_time')
            )
        
        return jsonify({
            "status": "success",
            "test_result": test_result
        })
        
    except Exception as e:
        logger.error(f"测试代理失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"测试代理失败: {str(e)}"
        })

@app.route("/api/proxy/test-all", methods=["POST"])
def test_all_proxies():
    """批量测试所有代理"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 只有管理员可以批量测试代理
        if not session_manager.is_admin(session_id):
            return jsonify({
                "status": "error",
                "message": "只有管理员可以批量测试代理"
            })

        # 批量测试代理
        test_results = db_manager.batch_test_proxies()
        
        return jsonify({
            "status": "success",
            "message": f"测试完成: {test_results['success']}/{test_results['total']} 成功",
            "results": test_results
        })
        
    except Exception as e:
        logger.error(f"批量测试代理失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"批量测试代理失败: {str(e)}"
        })

@app.route("/api/proxy/random", methods=["GET"])
def get_random_proxy():
    """获取随机代理（供内部使用）"""
    try:
        proxy_url = db_manager.get_random_proxy()
        
        if proxy_url:
            return jsonify({
                "status": "success",
                "proxy_url": proxy_url
            })
        else:
            return jsonify({
                "status": "error",
                "message": "没有可用的代理"
            })
        
    except Exception as e:
        logger.error(f"获取随机代理失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"获取随机代理失败: {str(e)}"
        })

# --- 新增API：通过EmailClient获取验证码 ---
@app.route('/api/get_email_verification_code', methods=['POST'])
def get_email_verification_code_api():
    """
    通过 EmailClient (通常是基于HTTP API的邮件服务) 获取验证码。
    接收 JSON 或 Form data。
    必需参数: email, token, client_id
    可选参数: password, api_base_url, mailbox, code_regex, max_retries, retry_delay
    
    如果EmailClient方法失败，将尝试使用connect_imap作为备用方法。
    如果用户之前已配置代理，也会使用相同的代理设置。
    """
    global max_retries, retry_delay
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form

    email = data.get('email')
    token = data.get('token') # 对应 EmailClient 的 refresh_token
    client_id = data.get('client_id')
    
    if not all([email, token, client_id]):
        return jsonify({"status": "error", "message": "缺少必需参数: email, token, client_id"}), 400

    # 获取可选参数
    password = data.get('password')
    api_base_url = data.get('api_base_url') # 如果提供，将覆盖 EmailClient 的默认设置
    mailbox = data.get('mailbox', "INBOX")
    code_regex = data.get('code_regex', r'\b\d{6}\b') # 默认匹配6位数字
    
    # 检查是否在用户处理数据中有该邮箱，并提取代理设置
    use_proxy = False
    proxy_url = None
    if email in user_process_data:
        user_data = user_process_data.get(email, {})
        use_proxy = user_data.get("use_proxy", False) and user_data.get("use_email_proxy", True)
        proxy_url = user_data.get("proxy_url", "") if use_proxy else None
        logger.info(f"为邮箱 {email} 使用代理设置: {use_proxy}, {proxy_url} (邮件代理: {user_data.get('use_email_proxy', True)})")

    try:
        # 实例化 EmailClient，传入代理设置
        email_client = EmailClient(api_base_url=api_base_url)
        
        # 设置代理（如果 EmailClient 类支持代理配置）
        if use_proxy and proxy_url and hasattr(email_client, 'set_proxy'):
            email_client.set_proxy(proxy_url)
        elif use_proxy and proxy_url:
            logger.warning("EmailClient 类不支持设置代理")

        # 使用重试机制调用获取验证码的方法
        verification_code = retry_function(
            email_client.get_verification_code,
            token=token,
            client_id=client_id,
            email=email,
            password=password,
            mailbox=mailbox,
            code_regex=code_regex,
            max_retries=max_retries,
            delay=retry_delay
        )

        if verification_code:
            return jsonify({"status": "success", "verification_code": verification_code})
        else:
            # EmailClient 失败，尝试使用connect_imap作为备用方法
            logger.info(f"EmailClient在{max_retries}次尝试后未能找到验证码，尝试使用connect_imap作为备用方法")
            
            # 检查是否有password参数
            if not password:
                return jsonify({"status": "error", "msg": "EmailClient失败，且未提供password参数，无法使用备用方法"}), 200
                
            # 先尝试从收件箱获取验证码，传入代理设置
            result = connect_imap(email, password, "INBOX", use_proxy=use_proxy, proxy_url=proxy_url)

            # 如果收件箱没有找到验证码，则尝试从垃圾邮件中查找
            if result["code"] == 0:
                result = connect_imap(email, password, "Junk", use_proxy=use_proxy, proxy_url=proxy_url)
            
            logger.info(f"catch 当前Oauth登录失败，IMAP结果如下：{result['msg']}")
            result["msg"] = f"当前Oauth登录失败，IMAP结果如下：{result['msg']}"
            if result["code"] == 0:
                return jsonify({"status": "error", "msg": "收件箱和垃圾邮件中均未找到验证码"}), 200
            elif result["code"] == 200:
                return jsonify({"status": "success", "verification_code": result["verification_code"], "msg": result["msg"]})
            else:
                return jsonify({"status": "error", "msg": result["msg"]}), 200

    except Exception as e:
        # 捕获实例化或调用过程中的其他潜在错误
        logger.error(f"处理 /api/get_email_verification_code 时出错: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # 如果有password参数，尝试使用connect_imap作为备用方法
        if password:
            logger.info(f"EmailClient出现异常，尝试使用connect_imap作为备用方法")
            try:
                # 先尝试从收件箱获取验证码，传入代理设置
                result = connect_imap(email, password, "INBOX", use_proxy=use_proxy, proxy_url=proxy_url)
                
                # 如果收件箱没有找到验证码，则尝试从垃圾邮件中查找
                if result["code"] == 0:
                    result = connect_imap(email, password, "Junk", use_proxy=use_proxy, proxy_url=proxy_url)
                    
                logger.info(f"catch 当前Oauth登录失败，IMAP结果如下：{result['msg']}")
                result["msg"] = f"当前Oauth登录失败，IMAP结果如下：{result['msg']}"
                if result["code"] == 0:
                    return jsonify({"status": "error", "msg": "收件箱和垃圾邮件中均未找到验证码"}), 200
                elif result["code"] == 200:
                    return jsonify({"status": "success", "verification_code": result["verification_code"], "msg": result["msg"]})
                else:
                    return jsonify({"status": "error", "msg": result["msg"]}), 200
            except Exception as backup_error:
                logger.error(f"备用方法connect_imap也失败: {str(backup_error)}")
                return jsonify({"status": "error", "message": f"主要和备用验证码获取方法均出现错误"}), 500
        
        return jsonify({"status": "error", "message": f"处理请求时发生内部错误"}), 500

@app.route("/api/account/vip_info", methods=["POST"])
def get_vip_info():
    """查询账号VIP信息"""
    try:
        data = request.get_json() or {}
        token = data.get('token')
        
        if not token:
            return jsonify({
                "status": "error",
                "message": "Token不能为空"
            })
        
        # 调用PikPak API查询VIP信息
        headers = {
            "accept": "*/*",
            "accept-language": "zh-CN",
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "x-client-id": data.get('client_id', 'YUMx5nI8ZU8Ap8pm'),
            "x-device-id": data.get('device_id', '')
        }
        
        # 添加可选的captcha token
        if data.get('captcha_token'):
            headers["x-captcha-token"] = data.get('captcha_token')
        
        response = requests.get(
            "https://api-drive.mypikpak.com/drive/v1/privilege/vip",
            headers=headers
        )
        
        return jsonify({
            "status": "success",
            "data": response.json()
        })
        
    except Exception as e:
        logger.error(f"获取VIP信息失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"获取VIP信息失败: {str(e)}"
        })

@app.route("/api/account/invite_code", methods=["POST"])
def get_invite_code():
    """查询账号邀请码"""
    try:
        data = request.get_json() or {}
        token = data.get('token')
        
        if not token:
            return jsonify({
                "status": "error",
                "message": "Token不能为空"
            })
        
        # 调用PikPak API查询邀请码
        headers = {
            "accept": "*/*",
            "accept-language": "zh-CN",
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "x-device-id": data.get('device_id', '')
        }
        
        # 添加可选的captcha token
        if data.get('captcha_token'):
            headers["x-captcha-token"] = data.get('captcha_token')
        
        response = requests.get(
            "https://api-drive.mypikpak.com/vip/v1/activity/inviteCode",
            headers=headers
        )
        
        return jsonify({
            "status": "success",
            "data": response.json()
        })
        
    except Exception as e:
        logger.error(f"获取邀请码失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"获取邀请码失败: {str(e)}"
        })

@app.route("/api/account/invite_list", methods=["POST"])
def get_invite_list():
    """查询账号邀请记录"""
    try:
        # 验证会话
        session_id = request.headers.get('X-Session-ID')
        if not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })
            
        data = request.get_json() or {}
        token = data.get('token')
        limit = data.get('limit', 500)
        client_id = data.get('client_id', "YNxT9w7GMdWvEOKa")  # 使用默认的client_id
        
        if not token:
            return jsonify({
                "status": "error",
                "message": "Token不能为空"
            })
        
        # 调用PikPak API查询邀请记录
        headers = {
            "accept": "*/*",
            "accept-language": "zh-CN",
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "x-device-id": data.get('device_id', ''),
            "x-client-id": client_id  # 添加x-client-id头部
        }
        
        # 添加可选的captcha token
        if data.get('captcha_token'):
            headers["x-captcha-token"] = data.get('captcha_token')
            
        # 记录请求URL和头部，用于调试
        request_url = f"https://api-drive.mypikpak.com/vip/v1/activity/inviteList?limit={limit}"

        logger.info(f"发送邀请记录请求: {request_url}")
        
        response = requests.get(
            request_url,
            headers=headers
        )
        
        if response.status_code == 200:
            invite_data = response.json()
            
            # 在返回数据中添加每个账号的激活信息
            if 'data' in invite_data and isinstance(invite_data['data'], list):
                for user in invite_data['data']:
                    # 从数据库查询账号的激活次数和时间
                    email = user.get('invited_user', '')
                    if email:
                        account_info = db_manager.get_account_by_email(email)
                        if account_info:
                            user['activation_status'] = account_info.get('activation_status', 0)
                            user['last_activation_time'] = account_info.get('last_activation_time', '')
                            user['created_at'] = account_info.get('created_at', '')
                        else:
                            user['activation_status'] = 0
                            user['last_activation_time'] = ''
                            user['created_at'] = ''
            
            # 记录处理后的响应数据
            logger.info(f"处理后的邀请记录响应：{invite_data}")
            
            return jsonify({
                "status": "success",
                "data": invite_data
            })
        else:
            return jsonify({
                "status": "error",
                "message": f"查询邀请记录失败: HTTP {response.status_code}",
                "response": response.text
            })
    except Exception as e:
        logger.error(f"获取邀请记录失败: {e}")
        return jsonify({
            "status": "error",
            "message": f"获取邀请记录失败: {str(e)}"
        })

# 处理所有前端路由
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    #favicon vite.svg
    if path == 'favicon.ico' or path == 'vite.svg':
        return send_from_directory("static", path)
    # 对于所有其他请求 - 返回index.html (SPA入口点)
    return render_template('index.html')

@app.route("/api/activate_account_with_names", methods=["POST"])
def activate_account_with_names():
    """激活账户接口 - 基于数据库版本"""
    try:
        # 获取会话ID
        session_id = request.headers.get('X-Session-ID', '')
        if not session_id or not session_manager.is_valid_session_id(session_id):
            return jsonify({
                "status": "error",
                "message": "无效的会话ID"
            })

        # 获取请求参数
        data = request.get_json() or {}
        key = data.get("key")
        names = data.get("names", [])  # 获取指定的账户名称列表
        all_accounts = data.get("all", False)  # 获取是否处理所有账户的标志

        if not key:
            return jsonify({"status": "error", "message": "密钥不能为空"})
            
        if not all_accounts and (not names or not isinstance(names, list)):
            return jsonify({"status": "error", "message": "请提供有效的账户名称列表或设置 all=true"})

        # 检查是否为管理员
        is_admin = session_manager.is_admin(session_id)
        
        # 从数据库获取账号列表
        all_db_accounts = db_manager.get_accounts(session_id, is_admin)
        
        if not all_db_accounts:
            return jsonify({"status": "error", "message": "未找到任何账号数据"})

        # 筛选需要激活的账号
        accounts_to_activate = []
        if all_accounts:
            accounts_to_activate = all_db_accounts
        else:
            for account in all_db_accounts:
                # 使用name或email的用户名部分作为匹配标准
                account_identifier = account.get('name') or account.get('email', '').split('@')[0]
                if account_identifier in names:
                    accounts_to_activate.append(account)

        if not accounts_to_activate:
            return jsonify({"status": "error", "message": "未找到指定的账号数据"})

        # 使用多线程处理每个账号
        import threading
        import queue

        # 创建结果队列
        result_queue = queue.Queue()

        # 定义线程处理函数
        def process_account(account, account_key, result_q):
            try:
                account_email = account.get("email", "未知邮箱")
                
                # 准备发送给激活API的账号信息
                single_account = {
                    "captcha_token": account.get("captcha_token", ""),
                    "timestamp": account.get("timestamp", ""),
                    "name": account.get("name", ""),
                    "email": account.get("email", ""),
                    "password": account.get("password", ""),
                    "device_id": account.get("device_id", ""),
                    "version": account.get("version", ""),
                    "user_id": account.get("user_id", ""),
                    "access_token": account.get("access_token", ""),
                    "refresh_token": account.get("refresh_token", ""),
                }

                response = requests.post(
                    headers={
                        "Content-Type": "application/json",
                        "referer": "https://inject.kiteyuan.info/",
                        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
                    },
                    url="https://kiteyuan.playingapi.workers.dev/infoInject",
                    json={"info": single_account, "key": account_key},
                    timeout=30,
                )

                # 将结果放入队列
                if response.status_code == 200:
                    api_result = response.json()

                    # 检查API是否返回了正确的数据格式
                    if isinstance(api_result, dict) and api_result.get("code") == 200 and "data" in api_result:
                        # 获取返回的数据对象
                        account_data = api_result.get("data", {})
                        
                        if account_data and isinstance(account_data, dict):
                            # 更新账号信息
                            updated_account = account.copy()

                            # 更新令牌信息 (从data子对象中提取)
                            for key_field in ["access_token", "refresh_token", "captcha_token", "timestamp", "device_id", "user_id"]:
                                if key_field in account_data:
                                    updated_account[key_field] = account_data[key_field]

                            # 添加激活相关信息，保留原有的邀请码，不覆盖
                            # updated_account['invite_code'] = account_key  # 不覆盖原有邀请码
                            updated_account['last_activation'] = int(time.time())
                            # 记录激活时使用的密钥（可选）
                            updated_account['last_activation_key'] = account_key

                            # 保存更新后的账号数据到数据库
                            db_manager.update_account(session_id, account['id'], updated_account, is_admin)
                            
                            # 更新激活状态（激活次数+1）
                            db_manager.update_activation_status(session_id, account['id'], is_admin)

                            # 将更新后的数据放入结果队列
                            result_q.put(
                                {
                                    "status": "success",
                                    "account": account_email,
                                    "result": account_data,
                                    "updated": True,
                                    "activation_count": account.get('activation_status', 0) + 1,
                                }
                            )
                        else:
                            # 返回的data不是字典类型
                            result_q.put(
                                {
                                    "status": "error",
                                    "account": account_email,
                                    "message": "返回的数据格式不符合预期",
                                    "result": api_result,
                                }
                            )
                    else:
                        # API返回错误码或格式不符合预期
                        error_msg = api_result.get("msg", "未知错误")
                        result_q.put(
                            {
                                "status": "error",
                                "account": account_email,
                                "message": f"激活失败: {error_msg}",
                                "result": api_result,
                            }
                        )
                else:
                    try:
                        error_detail = response.json().get('detail', '未知错误')
                    except:
                        error_detail = '未知错误'
                    result_q.put(
                        {
                            "status": "error",
                            "account": account_email,
                            "message": f"激活失败: HTTP {response.status_code}-{error_detail}",
                            "result": response.text,
                        }
                    )
            except Exception as e:
                result_q.put(
                    {
                        "status": "error",
                        "account": account.get("email", "未知邮箱"),
                        "message": f"处理失败: {str(e)}",
                    }
                )

        # 创建并启动线程
        threads = []
        for account in accounts_to_activate:
            thread = threading.Thread(
                target=process_account, args=(account, key, result_queue)
            )
            threads.append(thread)
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 收集所有结果
        results = []
        while not result_queue.empty():
            results.append(result_queue.get())

        # 统计成功和失败的数量
        success_count = sum(1 for r in results if r["status"] == "success")
        updated_count = sum(
            1
            for r in results
            if r.get("status") == "success" and r.get("updated", False)
        )

        return jsonify(
            {
                "status": "success",
                "message": f"激活操作完成。成功: {success_count}, 更新: {updated_count}, 失败: {len(results) - success_count}",
                "results": results,
            }
        )

    except Exception as e:
        logger.error(f"激活接口出错: {e}")
        return jsonify({"status": "error", "message": f"操作失败: {str(e)}"})

@app.route("/api/activate_account_sequential", methods=["GET", "POST"])
def activate_account_sequential():
    """按顺序激活账户接口 - 使用SSE逐个激活并实时反馈"""
    # 为了解决跨域问题，添加CORS头
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Session-ID'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST'
        return response
        
    # 如果是POST请求，启动SSE流处理
    if request.method == "POST":
        try:
            # 获取会话ID
            session_id = request.headers.get('X-Session-ID', '')
            if not session_id or not session_manager.is_valid_session_id(session_id):
                return jsonify({
                    "status": "error",
                    "message": "无效的会话ID"
                })

            # 获取请求参数
            data = request.get_json() or {}
            key = data.get("key")
            names = data.get("names", [])
            all_accounts = data.get("all", False)
            delay_min = data.get("delay_min", 10)
            delay_max = data.get("delay_max", 30)

            if not key:
                return jsonify({"status": "error", "message": "密钥不能为空"})
                
            if not all_accounts and (not names or not isinstance(names, list)):
                return jsonify({"status": "error", "message": "请提供有效的账户名称列表或设置 all=true"})

            # 定义SSE生成器函数
            def generate_activation_events():
                try:
                    # 发送开始消息
                    yield f"data: {json.dumps({'status': 'init', 'message': '开始处理激活请求...'})}\n\n"
                    
                    # 检查是否为管理员
                    is_admin = session_manager.is_admin(session_id)
                    
                    # 从数据库获取账号列表
                    all_db_accounts = db_manager.get_accounts(session_id, is_admin)
                    
                    if not all_db_accounts:
                        yield f"data: {json.dumps({'status': 'error', 'message': '未找到任何账号数据'})}\n\n"
                        return

                    # 筛选需要激活的账号
                    accounts_to_activate = []
                    if all_accounts:
                        accounts_to_activate = all_db_accounts
                    else:
                        for account in all_db_accounts:
                            account_identifier = account.get('name') or account.get('email', '').split('@')[0]
                            if account_identifier in names:
                                accounts_to_activate.append(account)

                    if not accounts_to_activate:
                        yield f"data: {json.dumps({'status': 'error', 'message': '未找到指定的账号数据'})}\n\n"
                        return
                        
                    # 发送开始信息
                    total_accounts = len(accounts_to_activate)
                    yield f"data: {json.dumps({'status': 'start', 'message': f'开始顺序激活 {total_accounts} 个账号', 'total': total_accounts})}\n\n"
                    
                    # 逐个处理账号
                    results = []
                    success_count = 0
                    updated_count = 0
                    
                    for index, account in enumerate(accounts_to_activate):
                        account_email = account.get("email", "未知邮箱")
                        account_name = account.get("name") or account_email.split('@')[0]
                        
                        # 发送当前处理的账号信息
                        yield f"data: {json.dumps({'status': 'processing', 'message': f'正在激活第 {index+1}/{total_accounts} 个账号: {account_name}', 'current': index+1, 'total': total_accounts, 'account': account_name})}\n\n"
                        
                        try:
                            # 准备发送给激活API的账号信息
                            single_account = {
                                "captcha_token": account.get("captcha_token", ""),
                                "timestamp": account.get("timestamp", ""),
                                "name": account.get("name", ""),
                                "email": account.get("email", ""),
                                "password": account.get("password", ""),
                                "device_id": account.get("device_id", ""),
                                "version": account.get("version", ""),
                                "user_id": account.get("user_id", ""),
                                "access_token": account.get("access_token", ""),
                                "refresh_token": account.get("refresh_token", ""),
                            }

                            response = requests.post(
                                headers={
                                    "Content-Type": "application/json",
                                    "referer": "https://inject.kiteyuan.info/",
                                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
                                },
                                url="https://kiteyuan.playingapi.workers.dev/infoInject",
                                json={"info": single_account, "key": key},
                                timeout=30,
                            )

                            result = {}
                            
                            # 处理激活结果
                            if response.status_code == 200:
                                api_result = response.json()

                                if isinstance(api_result, dict) and api_result.get("code") == 200 and "data" in api_result:
                                    account_data = api_result.get("data", {})
                                    
                                    if account_data and isinstance(account_data, dict):
                                        # 更新账号信息
                                        updated_account = account.copy()

                                        # 更新令牌信息
                                        for key_field in ["access_token", "refresh_token", "captcha_token", "timestamp", "device_id", "user_id"]:
                                            if key_field in account_data:
                                                updated_account[key_field] = account_data[key_field]

                                        # 添加激活相关信息
                                        updated_account['last_activation'] = int(time.time())
                                        updated_account['last_activation_key'] = key

                                        # 保存更新后的账号数据到数据库
                                        db_manager.update_account(session_id, account['id'], updated_account, is_admin)
                                        
                                        # 更新激活状态（激活次数+1）
                                        db_manager.update_activation_status(session_id, account['id'], is_admin)

                                        result = {
                                            "status": "success",
                                            "account": account_email,
                                            "result": account_data,
                                            "updated": True,
                                            "activation_count": account.get('activation_status', 0) + 1,
                                        }
                                        success_count += 1
                                        updated_count += 1
                                    else:
                                        result = {
                                            "status": "error",
                                            "account": account_email,
                                            "message": "返回的数据格式不符合预期",
                                            "result": api_result,
                                        }
                                else:
                                    error_msg = api_result.get("msg", "未知错误")
                                    result = {
                                        "status": "error",
                                        "account": account_email,
                                        "message": f"激活失败: {error_msg}",
                                        "result": api_result,
                                    }
                            else:
                                try:
                                    error_detail = response.json().get('detail', '未知错误')
                                except:
                                    error_detail = '未知错误'
                                result = {
                                    "status": "error",
                                    "account": account_email,
                                    "message": f"激活失败: HTTP {response.status_code}-{error_detail}",
                                    "result": response.text,
                                }
                        except Exception as e:
                            result = {
                                "status": "error",
                                "account": account_email,
                                "message": f"处理失败: {str(e)}",
                            }
                        
                        # 记录结果
                        results.append(result)
                        
                        # 发送当前账号的结果
                        yield f"data: {json.dumps({'status': 'result', 'account_result': result, 'current': index+1, 'total': total_accounts})}\n\n"
                        
                        # 如果不是最后一个账号，添加延迟
                        if index < len(accounts_to_activate) - 1:
                            delay_time = random.randint(delay_min, delay_max)
                            yield f"data: {json.dumps({'status': 'delay', 'message': f'等待 {delay_time} 秒后继续下一个账号', 'delay': delay_time})}\n\n"
                            time.sleep(delay_time)
                    
                    # 发送完成消息
                    yield f"data: {json.dumps({'status': 'complete', 'message': f'激活操作完成。成功: {success_count}, 更新: {updated_count}, 失败: {len(results) - success_count}', 'results': results, 'success_count': success_count, 'updated_count': updated_count, 'failed_count': len(results) - success_count})}\n\n"
                    
                except Exception as e:
                    logger.error(f"激活过程中发生错误: {str(e)}", exc_info=True)
                    yield f"data: {json.dumps({'status': 'error', 'message': f'激活过程中发生错误: {str(e)}'})}\n\n"

            # 返回SSE响应
            response = Response(generate_activation_events(), mimetype="text/event-stream")
            response.headers['Cache-Control'] = 'no-cache'
            response.headers['X-Accel-Buffering'] = 'no'
            response.headers['Connection'] = 'keep-alive'
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Session-ID'
            return response
            
        except Exception as e:
            logger.error(f"处理激活请求时出错: {str(e)}", exc_info=True)
            return jsonify({"status": "error", "message": f"处理请求时出错: {str(e)}"})
    
    # GET请求返回错误
    return jsonify({"status": "error", "message": "请使用POST方法发送激活请求"})

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
