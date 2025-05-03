import json
import os
import time
import uuid
import argparse  # 导入参数解析库
import random
import string
import logging

import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
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


@app.route("/api/initialize", methods=["POST"])
def initialize():
    # 获取用户表单输入
    use_proxy = request.form.get("use_proxy") == "true"
    proxy_url = request.form.get("proxy_url", "")
    invite_code = request.form.get("invite_code", "")
    email = request.form.get("email", "")

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

    # 将验证码令牌保存到会话中 - REMOVED
    # session["captcha_token"] = pikpak.captcha_token

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
    }

    # 保存账号信息
    account_file = save_account_info(name, account_info)

    return jsonify(
        {
            "status": "success",
            "message": "注册成功！账号已保存。",
            "account_info": account_info,
        }
    )


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
    # 获取account文件夹中的所有JSON文件
    account_files = []
    for file in os.listdir("account"):
        if file.endswith(".json"):
            file_path = os.path.join("account", file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    account_data = json.load(f)
                    if isinstance(account_data, dict):
                        # 添加文件名属性，用于后续操作
                        account_data["filename"] = file
                        account_files.append(account_data)
            except Exception as e:
                logger.error(f"Error reading {file}: {str(e)}")

    if not account_files:
        return jsonify(
            {"status": "info", "message": "没有找到保存的账号", "accounts": []}
        )
    account_files.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    return jsonify(
        {
            "status": "success",
            "message": f"找到 {len(account_files)} 个账号",
            "accounts": account_files,
        }
    )


@app.route("/api/update_account", methods=["POST"])
def update_account():
    data = request.json
    if not data or "filename" not in data or "account_data" not in data:
        return jsonify({"status": "error", "message": "请求数据不完整"})

    filename = data.get("filename")
    account_data = data.get("account_data")

    # 安全检查文件名
    if not filename or ".." in filename or not filename.endswith(".json"):
        return jsonify({"status": "error", "message": "无效的文件名"})

    file_path = os.path.join("account", filename)

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(account_data, f, indent=4, ensure_ascii=False)

        return jsonify({"status": "success", "message": "账号已成功更新"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"更新账号时出错: {str(e)}"})


@app.route("/api/delete_account", methods=["POST"])
def delete_account():
    filename = request.form.get("filename")

    if not filename:
        return jsonify({"status": "error", "message": "未提供文件名"})

    # 安全检查文件名
    if ".." in filename or not filename.endswith(".json"):
        return jsonify({"status": "error", "message": "无效的文件名"})

    file_path = os.path.join("account", filename)

    try:
        # 检查文件是否存在
        if not os.path.exists(file_path):
            return jsonify({"status": "error", "message": "账号文件不存在"})

        # 删除文件
        os.remove(file_path)

        return jsonify({"status": "success", "message": "账号已成功删除"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"删除账号时出错: {str(e)}"})

@app.route("/api/activate_account_with_names", methods=["POST"])
def activate_account_with_names():
    try:
        data = request.json
        key = data.get("key")
        names = data.get("names", [])  # 获取指定的账户名称列表
        all_accounts = data.get("all", False)  # 获取是否处理所有账户的标志

        if not key:
            return jsonify({"status": "error", "message": "密钥不能为空"})
            
        if not all_accounts and (not names or not isinstance(names, list)):
            return jsonify({"status": "error", "message": "请提供有效的账户名称列表或设置 all=true"})

        # 存储账号数据及其文件路径
        accounts_with_paths = []
        for file in os.listdir("account"):
            if file.endswith(".json"):
                # 如果 all=true 或者文件名在指定的names列表中，则处理该文件
                file_name_without_ext = os.path.splitext(file)[0]
                if all_accounts or file_name_without_ext in names or file in names:
                    file_path = os.path.join("account", file)
                    with open(file_path, "r", encoding="utf-8") as f:
                        account_data = json.load(f)
                        # 保存文件路径以便后续更新
                        accounts_with_paths.append(
                            {"path": file_path, "data": account_data}
                        )

        if not accounts_with_paths:
            return jsonify({"status": "error", "message": "未找到指定的账号数据"})

        # 使用多线程处理每个账号
        import threading
        import queue

        # 创建结果队列
        result_queue = queue.Queue()

        # 定义线程处理函数
        def process_account(account_with_path, account_key, result_q):
            try:
                file_path = account_with_path["path"]
                single_account = account_with_path["data"]

                response = requests.post(
                    headers={
                        "Content-Type": "application/json",
                        "referer": "https://inject.kiteyuan.info/",
                        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
                    },
                    url="https://inject.kiteyuan.info/infoInject",
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
                            updated_account = single_account.copy()

                            # 更新令牌信息 (从data子对象中提取)
                            for key in ["access_token", "refresh_token", "captcha_token", "timestamp", "device_id", "user_id"]:
                                if key in account_data:
                                    updated_account[key] = account_data[key]

                            # 保存更新后的账号数据
                            with open(file_path, "w", encoding="utf-8") as f:
                                json.dump(updated_account, f, indent=4, ensure_ascii=False)

                            # 将更新后的数据放入结果队列
                            result_q.put(
                                {
                                    "status": "success",
                                    "account": single_account.get("email", "未知邮箱"),
                                    "result": account_data,
                                    "updated": True,
                                }
                            )
                        else:
                            # 返回的data不是字典类型
                            result_q.put(
                                {
                                    "status": "error",
                                    "account": single_account.get("email", "未知邮箱"),
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
                                "account": single_account.get("email", "未知邮箱"),
                                "message": f"激活失败: {error_msg}",
                                "result": api_result,
                            }
                        )
                else:
                    result_q.put(
                        {
                            "status": "error",
                            "account": single_account.get("email", "未知邮箱"),
                            "message": f"激活失败: HTTP {response.status_code}-{response.json().get('detail', '未知错误')}",
                            "result": response.text,
                        }
                    )
            except Exception as e:
                result_q.put(
                    {
                        "status": "error",
                        "account": single_account.get("email", "未知邮箱"),
                        "message": f"处理失败: {str(e)}",
                    }
                )

        # 创建并启动线程
        threads = []
        for account_with_path in accounts_with_paths:
            thread = threading.Thread(
                target=process_account, args=(account_with_path, key, result_queue)
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
                "message": f"账号激活完成: {success_count}/{len(accounts_with_paths)}个成功, {updated_count}个已更新数据",
                "results": results,
            }
        )

    except Exception as e:
        return jsonify({"status": "error", "message": f"操作失败: {str(e)}"})


@app.route("/api/check_email_inventory", methods=["GET"])
def check_email_inventory():
    try:
        # 发送请求到库存API
        response = requests.get(
            url="https://zizhu.shanyouxiang.com/kucun",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
            },
            timeout=10,
        )

        if response.status_code == 200:
            return jsonify({"status": "success", "inventory": response.json()})
        else:
            return jsonify(
                {
                    "status": "error",
                    "message": f"获取库存失败: HTTP {response.status_code}",
                }
            )

    except Exception as e:
        return jsonify({"status": "error", "message": f"获取库存时出错: {str(e)}"})


@app.route("/api/check_balance", methods=["GET"])
def check_balance():
    try:
        # 从请求参数中获取卡号
        card = request.args.get("card")

        if not card:
            return jsonify({"status": "error", "message": "未提供卡号参数"})

        # 发送请求到余额查询API
        response = requests.get(
            url="https://zizhu.shanyouxiang.com/yue",
            params={"card": card},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
            },
            timeout=10,
        )

        if response.status_code == 200:
            return jsonify({"status": "success", "balance": response.json()})
        else:
            return jsonify(
                {
                    "status": "error",
                    "message": f"查询余额失败: HTTP {response.status_code}",
                }
            )

    except Exception as e:
        return jsonify({"status": "error", "message": f"查询余额时出错: {str(e)}"})


@app.route("/api/extract_emails", methods=["GET"])
def extract_emails():
    try:
        # 从请求参数中获取必需的参数
        card = request.args.get("card")
        shuliang = request.args.get("shuliang")
        leixing = request.args.get("leixing")
        # 获取前端传递的重试次数计数器，如果没有则初始化为0
        frontend_retry_count = int(request.args.get("retry_count", "0"))

        # 验证必需的参数
        if not card:
            return jsonify({"status": "error", "message": "未提供卡号参数"})

        if not shuliang:
            return jsonify({"status": "error", "message": "未提供提取数量参数"})

        if not leixing or leixing not in ["outlook", "hotmail"]:
            return jsonify(
                {
                    "status": "error",
                    "message": "提取类型参数无效，必须为 outlook 或 hotmail",
                }
            )

        # 尝试将数量转换为整数
        try:
            shuliang_int = int(shuliang)
            if shuliang_int < 1 or shuliang_int > 2000:
                return jsonify(
                    {"status": "error", "message": "提取数量必须在1到2000之间"}
                )
        except ValueError:
            return jsonify({"status": "error", "message": "提取数量必须为整数"})

        # 后端重试计数器
        retry_count = 0
        max_retries = 20  # 单次后端请求的最大重试次数
        retry_delay = 0  # 每次重试间隔秒数

        # 记录总的前端+后端重试次数，用于展示给用户
        total_retry_count = frontend_retry_count

        while retry_count < max_retries:
            # 发送请求到邮箱提取API
            response = requests.get(
                url="https://zizhu.shanyouxiang.com/huoqu",
                params={"card": card, "shuliang": shuliang, "leixing": leixing},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
                },
                timeout=10,  # 降低单次请求的超时时间，以便更快地进行重试
            )

            if response.status_code == 200:
                # 检查响应是否为JSON格式，如果是，通常表示没有库存
                try:
                    json_response = response.json()
                    if isinstance(json_response, dict) and "msg" in json_response:
                        # 没有库存，需要重试
                        retry_count += 1
                        total_retry_count += 1

                        # 如果达到后端最大重试次数，返回特殊状态让前端继续重试
                        if retry_count >= max_retries:
                            return jsonify(
                                {
                                    "status": "retry",
                                    "message": f"暂无库存: {json_response['msg']}，已重试{total_retry_count}次，继续尝试中...",
                                    "retry_count": total_retry_count,
                                }
                            )

                        # 等待一段时间后重试
                        time.sleep(retry_delay)
                        continue
                except ValueError:
                    # 不是JSON格式，可能是成功的文本列表响应
                    pass

                # 处理文本响应
                response_text = response.text.strip()

                # 解析响应文本为邮箱列表
                emails = []
                if response_text:
                    for line in response_text.split("\n"):
                        if line.strip():
                            emails.append(line.strip())

                # 如果没有实际提取到邮箱（可能是空文本响应），继续重试
                if not emails:
                    retry_count += 1
                    total_retry_count += 1

                    if retry_count >= max_retries:
                        return jsonify(
                            {
                                "status": "retry",
                                "message": f"未能获取到邮箱，已重试{total_retry_count}次，继续尝试中...",
                                "retry_count": total_retry_count,
                            }
                        )

                    time.sleep(retry_delay)
                    continue

                # 成功获取到邮箱，返回结果
                return jsonify(
                    {
                        "status": "success",
                        "emails": emails,
                        "count": len(emails),
                        "retries": total_retry_count,
                        "message": f"成功获取{len(emails)}个邮箱，总共重试{total_retry_count}次",
                    }
                )
            else:
                # 请求失败，返回错误
                return jsonify(
                    {
                        "status": "error",
                        "message": f"提取邮箱失败: HTTP {response.status_code}",
                        "response": response.text,
                    }
                )

        # 如果执行到这里，说明超过了最大重试次数
        return jsonify(
            {
                "status": "retry",
                "message": f"暂无邮箱库存，已重试{total_retry_count}次，继续尝试中...",
                "retry_count": total_retry_count,
            }
        )

    except Exception as e:
        return jsonify({"status": "error", "message": f"提取邮箱时出错: {str(e)}"})


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
        use_proxy = user_data.get("use_proxy", False)
        proxy_url = user_data.get("proxy_url", "") if use_proxy else None
        logger.info(f"为邮箱 {email} 使用代理设置: {use_proxy}, {proxy_url}")

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
                return jsonify({"status": "error", "msg": "收件箱和垃圾邮件中均未找到验证码"}), 
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
                    return jsonify({"status": "error", "msg": "收件箱和垃圾邮件中均未找到验证码"}), 
                elif result["code"] == 200:
                    return jsonify({"status": "success", "verification_code": result["verification_code"], "msg": result["msg"]})
                else:
                    return jsonify({"status": "error", "msg": result["msg"]}), 200
            except Exception as backup_error:
                logger.error(f"备用方法connect_imap也失败: {str(backup_error)}")
                return jsonify({"status": "error", "message": f"主要和备用验证码获取方法均出现错误"}), 500
        
        return jsonify({"status": "error", "message": f"处理请求时发生内部错误"}), 500



# 处理所有前端路由
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    #favicon vite.svg
    if path == 'favicon.ico' or path == 'vite.svg':
        return send_from_directory("static", path)
    # 对于所有其他请求 - 返回index.html (SPA入口点)
    return render_template('index.html')

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
