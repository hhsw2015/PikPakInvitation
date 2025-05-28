import requests
import re
import json
import logging
import os
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# 加载环境变量，强制覆盖已存在的环境变量
load_dotenv(override=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('email_client')

# 添加一条日志，显示加载的环境变量值（如果存在）
mail_api_url = os.getenv('MAIL_POINT_API_URL', '')
logger.info(f"加载的MAIL_POINT_API_URL环境变量值: {mail_api_url}")

class EmailClient:
    """邮件客户端类，封装邮件API操作"""
    
    def __init__(self, api_base_url: Optional[str] = None, use_proxy: bool = False, proxy_url: Optional[str] = None):
        """
        初始化邮件客户端
        
        Args:
            api_base_url: API基础URL，如不提供则从环境变量MAIL_POINT_API_URL读取
            use_proxy: 是否使用代理
            proxy_url: 代理服务器URL (例如 "http://127.0.0.1:7890")
        """
        if api_base_url is None:
            # 添加调试信息，查看API_URL是否正确加载
            api_base_url = os.getenv('MAIL_POINT_API_URL', '')
            logger.info(f"使用的MAIL_POINT_API_URL环境变量值: {api_base_url}")

        self.api_base_url = api_base_url.rstrip('/')
        self.session = requests.Session()
        
        # 初始化代理设置
        self.use_proxy = use_proxy
        self.proxy_url = proxy_url
        
        # 如果启用代理，设置代理
        if self.use_proxy and self.proxy_url:
            self.set_proxy(self.proxy_url)
    
    def set_proxy(self, proxy_url: str) -> None:
        """
        设置代理服务器
        
        Args:
            proxy_url: 代理服务器URL (例如 "http://127.0.0.1:7890")
        """
        if not proxy_url:
            logger.warning("代理URL为空，不设置代理")
            return
            
        # 为会话设置代理
        self.proxy_url = proxy_url
        self.use_proxy = True
        
        # 设置代理，支持HTTP和HTTPS
        proxies = {
            "http": proxy_url,
            "https": proxy_url
        }
        self.session.proxies.update(proxies)
        logger.info(f"已设置代理: {proxy_url}")
    
    def _make_request(self, endpoint: str, method: str = "POST", **params) -> Dict[str, Any]:
        """
        发送API请求
        
        Args:
            endpoint: API端点
            method: 请求方法，GET或POST
            **params: 请求参数
            
        Returns:
            API响应的JSON数据
        """
        url = f"{self.api_base_url}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, params=params)
            else:  # POST
                response = self.session.post(url, json=params)
            
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"API请求失败: {str(e)}")
            return {"error": str(e), "status": "failed"}
    
    def get_latest_email(self, refresh_token: str, client_id: str, email: str, 
                        mailbox: str = "INBOX", response_type: str = "json", 
                        password: Optional[str] = None) -> Dict[str, Any]:
        """
        获取最新一封邮件
        
        Args:
            refresh_token: 刷新令牌
            client_id: 客户端ID
            email: 邮箱地址
            mailbox: 邮箱文件夹，INBOX或Junk
            response_type: 返回格式，json或html
            password: 可选密码
            
        Returns:
            包含最新邮件信息的字典
        """
        params = {
            'refresh_token': refresh_token,
            'client_id': client_id,
            'email': email,
            'mailbox': mailbox,
            'response_type': response_type
        }

        if password:
            params['password'] = password
        
        return self._make_request('/api/mail-new', **params)
    
    def get_all_emails(self, refresh_token: str, client_id: str, email: str,
                     mailbox: str = "INBOX", password: Optional[str] = None) -> Dict[str, Any]:
        """
        获取全部邮件
        
        Args:
            refresh_token: 刷新令牌
            client_id: 客户端ID
            email: 邮箱地址
            mailbox: 邮箱文件夹，INBOX或Junk
            password: 可选密码
            
        Returns:
            包含所有邮件信息的字典
        """
        params = {
            'refresh_token': refresh_token,
            'client_id': client_id,
            'email': email,
            'mailbox': mailbox
        }
        
        if password:
            params['password'] = password
        
        return self._make_request('/api/mail-all', **params)
    
    def process_inbox(self, refresh_token: str, client_id: str, email: str,
                    password: Optional[str] = None) -> Dict[str, Any]:
        """
        清空收件箱
        
        Args:
            refresh_token: 刷新令牌
            client_id: 客户端ID
            email: 邮箱地址
            password: 可选密码
            
        Returns:
            操作结果字典
        """
        params = {
            'refresh_token': refresh_token,
            'client_id': client_id,
            'email': email
        }
        
        if password:
            params['password'] = password
        
        return self._make_request('/api/process-inbox', **params)
    
    def process_junk(self, refresh_token: str, client_id: str, email: str,
                   password: Optional[str] = None) -> Dict[str, Any]:
        """
        清空垃圾箱
        
        Args:
            refresh_token: 刷新令牌
            client_id: 客户端ID
            email: 邮箱地址
            password: 可选密码
            
        Returns:
            操作结果字典
        """
        params = {
            'refresh_token': refresh_token,
            'client_id': client_id,
            'email': email
        }
        
        if password:
            params['password'] = password
        
        return self._make_request('/api/process-junk', **params)
    
    def send_email(self, refresh_token: str, client_id: str, email: str, to: str,
                 subject: str, text: Optional[str] = None, html: Optional[str] = None,
                 send_password: Optional[str] = None) -> Dict[str, Any]:
        """
        发送邮件
        
        Args:
            refresh_token: 刷新令牌
            client_id: 客户端ID
            email: 发件人邮箱地址
            to: 收件人邮箱地址
            subject: 邮件主题
            text: 邮件的纯文本内容（与html二选一）
            html: 邮件的HTML内容（与text二选一）
            send_password: 可选发送密码
            
        Returns:
            操作结果字典
        """
        if not text and not html:
            raise ValueError("必须提供text或html参数")
        
        params = {
            'refresh_token': refresh_token,
            'client_id': client_id,
            'email': email,
            'to': to,
            'subject': subject
        }
        
        if text:
            params['text'] = text
        if html:
            params['html'] = html
        if send_password:
            params['send_password'] = send_password
        
        return self._make_request('/api/send-mail', **params)

    def get_verification_code(self, token: str, client_id: str, email: str, 
                              password: Optional[str] = None, mailbox: str = "INBOX", 
                              code_regex: str = r'\\b\\d{6}\\b') -> Optional[str]:
        """
        获取最新邮件中的验证码

        Args:
            token: 刷新令牌 (对应API的refresh_token)
            client_id: 客户端ID
            email: 邮箱地址
            password: 可选密码
            mailbox: 邮箱文件夹，INBOX或Junk (默认为INBOX)
            code_regex: 用于匹配验证码的正则表达式 (默认为匹配6位数字)

        Returns:
            找到的验证码字符串，如果未找到或出错则返回None
        """
        """
        logger.info(f"尝试从邮箱 {email} 的 {mailbox} 获取验证码")
        
        # 调用 get_latest_email 获取邮件内容, 先从INBOX获取
        latest_email_data = self.get_latest_email(
            refresh_token=token,
            client_id=client_id,
            email=email,
            mailbox="INBOX",
            response_type='json', # 需要JSON格式来解析内容
            password=password
        )

        if not latest_email_data or (latest_email_data.get('send') is not None and isinstance(latest_email_data.get('send'), str) and 'PikPak' not in latest_email_data.get('send')):
            logger.error(f"在 INBOX 获取邮箱 {email} 最新邮件失败，尝试从Junk获取")
            latest_email_data = self.get_latest_email(
                refresh_token=token,
                client_id=client_id,
                email=email,
                mailbox="Junk",
            )

            logger.info(f"Junk latest_email_data: {latest_email_data.get('send')}")
            if not latest_email_data or (latest_email_data.get('send') is not None and isinstance(latest_email_data.get('send'), str) and 'PikPak' not in latest_email_data.get('send')):
                logger.error(f"在 Junk 获取邮箱 {email} 最新邮件失败")
                return None

        # 假设邮件正文在 'text' 或 'body' 字段
        email_content = latest_email_data.get('text') or latest_email_data.get('body')

        if not email_content:
            logger.warning(f"邮箱 {email} 的最新邮件数据中未找到 'text' 或 'body' 字段")
            return None
        """

        #fix by hhsw2015 start                          
        # 等待 8 秒以确保邮件到达
        print("sleep 8s")
        time.sleep(8)
    
        print("client_id: " + client_id)
        print("refresh_token: " + token)
        print("email: " + email)
    
        # 调用 get_latest_email 获取 INBOX 邮件内容
        inbox_email_data = self.get_latest_email(
            refresh_token=token,
            client_id=client_id,
            email=email,
            mailbox="INBOX",
            response_type='json', # 需要JSON格式来解析内容
            password=password
        )
        print("INBOX email data:", inbox_email_data)
    
        # 检查 INBOX 是否有来自 mypikpak 的邮件
        inbox_has_mypikpak = (
            inbox_email_data
            and inbox_email_data.get("success")
            and inbox_email_data.get("data")
            and len(inbox_email_data["data"]) > 0
            and "mypikpak" in inbox_email_data["data"][0].get("send", "")
        )
    
        # 调用 get_latest_email 获取 Junk 邮件内容
        junk_email_data = self.get_latest_email(
            refresh_token=token,
            client_id=client_id,
            email=email,
            mailbox="Junk",
            response_type='json',
            password=password
        )
        print("Junk email data:", junk_email_data)
    
        # 检查 Junk 是否有来自 mypikpak 的邮件
        junk_has_mypikpak = (
            junk_email_data
            and junk_email_data.get("success")
            and junk_email_data.get("data")
            and len(junk_email_data["data"]) > 0
            and "mypikpak" in junk_email_data["data"][0].get("send", "")
        )
    
        # 选择更新的邮件
        selected_email_data = None
        if inbox_has_mypikpak and junk_has_mypikpak:
            # 比较日期
            inbox_date = datetime.fromisoformat(inbox_email_data["data"][0]["date"].replace("Z", "+00:00"))
            junk_date = datetime.fromisoformat(junk_email_data["data"][0]["date"].replace("Z", "+00:00"))
            logger.info(f"INBOX date: {inbox_date}, Junk date: {junk_date}")
            selected_email_data = inbox_email_data if inbox_date >= junk_date else junk_email_data
            logger.info(f"选择更新的邮件：{'INBOX' if inbox_date >= junk_date else 'Junk'}")
        elif inbox_has_mypikpak:
            selected_email_data = inbox_email_data
            logger.info("仅 INBOX 包含 mypikpak 邮件，选择 INBOX")
        elif junk_has_mypikpak:
            selected_email_data = junk_email_data
            logger.info("仅 Junk 包含 mypikpak 邮件，选择 Junk")
        else:
            logger.error(f"在 INBOX 和 Junk 中均未找到来自 mypikpak 的邮件")
            return None
    
        # 提取邮件内容
        email_content = (
            selected_email_data["data"][0]["text"] or selected_email_data["data"][0]["html"]
        )
    
        if not email_content:
            logger.warning(f"邮箱 {email} 的最新邮件数据中未找到 'text' 或 'html' 字段")
            return None

        #fix by hhsw2015 end

        # 使用正则表达式搜索验证码
        try:
            match = re.search(code_regex, email_content)
            if match:
                verification_code = match.group(0) # 通常验证码是整个匹配项
                logger.info(f"在邮箱 {email} 的邮件中成功找到验证码: {verification_code}")
                return verification_code
            else:
                logger.info(f"在邮箱 {email} 的最新邮件中未找到符合模式 {code_regex} 的验证码")
                return None
        except re.error as e:
            logger.error(f"提供的正则表达式 '{code_regex}' 无效: {e}")
            return None
        except Exception as e:
            logger.error(f"解析邮件内容或匹配验证码时发生未知错误: {e}")
            return None

def parse_email_credentials(credentials_str: str) -> List[Dict[str, str]]:
    """
    解析邮箱凭证字符串，提取邮箱、密码、Client ID和Token
    
    Args:
        credentials_str: 包含凭证信息的字符串
        
    Returns:
        凭证列表，每个凭证为一个字典
    """
    credentials_list = []
    pattern = r'(.+?)----(.+?)----(.+?)----(.+?)(?:\n|$)'
    matches = re.finditer(pattern, credentials_str.strip())
    
    for match in matches:
        if len(match.groups()) == 4:
            email, password, client_id, token = match.groups()
            credentials_list.append({
                'email': email.strip(),
                'password': password.strip(),
                'client_id': client_id.strip(),
                'token': token.strip()
            })
    
    return credentials_list

def load_credentials_from_file(file_path: str) -> str:
    """
    从文件加载凭证信息
    
    Args:
        file_path: 文件路径
        
    Returns:
        包含凭证的字符串
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
            # 提取多行字符串v的内容
            match = re.search(r'v\s*=\s*"""(.*?)"""', content, re.DOTALL)
            if match:
                return match.group(1)
        return ""
    except Exception as e:
        logger.error(f"加载凭证文件失败: {str(e)}")
        return ""

def format_json_output(json_data: Dict) -> str:
    """
    格式化JSON输出
    
    Args:
        json_data: JSON数据
        
    Returns:
        格式化后的字符串
    """
    return json.dumps(json_data, ensure_ascii=False, indent=2) 
