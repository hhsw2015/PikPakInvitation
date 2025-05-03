import imaplib
import re
import email
import socket
import socks  # 增加 socks 库支持

# IMAP 服务器信息
IMAP_SERVER = 'imap.shanyouxiang.com'
IMAP_PORT = 993  # IMAP SSL 端口

# 邮件发送者列表（用于查找验证码）
VERIFICATION_SENDERS = ['noreply@accounts.mypikpak.com']


# --------------------------- IMAP 获取验证码 ---------------------------

def connect_imap(email_user, email_password, folder='INBOX', use_proxy=False, proxy_url=None):
    """
    使用 IMAP 连接并检查指定文件夹中的验证码邮件
    支持通过代理连接
    
    参数:
        email_user: 邮箱用户名
        email_password: 邮箱密码
        folder: 要检查的文件夹
        use_proxy: 是否使用代理
        proxy_url: 代理服务器URL (例如 "http://127.0.0.1:7890")
    """
    original_socket = None
    
    try:
        # 如果启用代理，设置SOCKS代理
        if use_proxy and proxy_url:
            # 解析代理URL
            if proxy_url.startswith(('http://', 'https://')):
                # 从HTTP代理URL提取主机和端口
                from urllib.parse import urlparse
                parsed = urlparse(proxy_url)
                proxy_host = parsed.hostname
                proxy_port = parsed.port or 80
                
                # 保存原始socket
                original_socket = socket.socket
                
                # 设置socks代理
                socks.set_default_proxy(socks.PROXY_TYPE_HTTP, proxy_host, proxy_port)
                socket.socket = socks.socksocket
                
                print(f"使用代理连接IMAP服务器: {proxy_url}")
        
        # 连接 IMAP 服务器
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(email_user, email_password)  # 直接使用邮箱密码登录

        # 选择文件夹
        status, _ = mail.select(folder)
        if status != 'OK':
            return {"code": 0, "msg": f"无法访问 {folder} 文件夹"}

        # 搜索邮件
        status, messages = mail.search(None, 'ALL')
        if status != 'OK' or not messages[0]:
            return {"code": 0, "msg": f"{folder} 文件夹为空"}

        message_ids = messages[0].split()
        verification_code = None
        timestamp = None

        for msg_id in message_ids[::-1]:  # 从最新邮件开始查找
            status, msg_data = mail.fetch(msg_id, '(RFC822)')
            if status != 'OK':
                continue

            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    from_email = msg['From']

                    if any(sender in from_email for sender in VERIFICATION_SENDERS):
                        timestamp = msg['Date']

                        # 解析邮件正文
                        if msg.is_multipart():
                            for part in msg.walk():
                                if part.get_content_type() == 'text/html':
                                    body = part.get_payload(decode=True).decode('utf-8')
                                    break
                        else:
                            body = msg.get_payload(decode=True).decode('utf-8')

                        # 提取验证码
                        match = re.search(r'\b(\d{6})\b', body)
                        if match:
                            verification_code = match.group(1)
                            break

            if verification_code:
                break

        mail.logout()

        if verification_code:
            return {"code": 200, "verification_code": verification_code, "time": timestamp,
                    "msg": f"成功获取验证码 ({folder})"}
        else:
            return {"code": 0, "msg": f"{folder} 中未找到验证码"}

    except imaplib.IMAP4.error as e:
        return {"code": 401, "msg": "IMAP 认证失败，请检查邮箱和密码是否正确，或者邮箱是否支持IMAP登录"}
    except Exception as e:
        return {"code": 500, "msg": f"错误: {str(e)}"}
    finally:
        # 恢复原始socket
        if original_socket:
            socket.socket = original_socket

