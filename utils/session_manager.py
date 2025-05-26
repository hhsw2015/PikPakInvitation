import os
import random
import string
import logging
from typing import Optional
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

logger = logging.getLogger(__name__)

class SessionManager:
    """会话管理器"""
    
    def __init__(self):
        self.admin_session_id = os.getenv('ADMIN_SESSION_ID', 'admin123456')
        logger.info(f"管理员会话ID已加载: {self.admin_session_id}")
    
    def generate_session_id(self, length: int = 12) -> str:
        """
        生成随机会话ID
        
        Args:
            length: 会话ID长度，默认12位，范围6-20位
            
        Returns:
            生成的会话ID
        """
        if length < 6:
            length = 6
        elif length > 20:
            length = 20
        
        # 使用字母和数字生成随机字符串
        characters = string.ascii_letters + string.digits
        session_id = ''.join(random.choice(characters) for _ in range(length))
        
        logger.info(f"生成新会话ID: {session_id}")
        return session_id
    
    def is_valid_session_id(self, session_id: str) -> bool:
        """
        验证会话ID格式是否有效
        
        Args:
            session_id: 要验证的会话ID
            
        Returns:
            是否有效
        """
        if not session_id or not isinstance(session_id, str):
            return False
        
        # 检查长度
        if len(session_id) < 6 or len(session_id) > 20:
            return False
        
        # 检查字符是否为字母或数字
        if not session_id.isalnum():
            return False
        
        return True
    
    def is_admin(self, session_id: str) -> bool:
        """
        检查是否为管理员会话
        
        Args:
            session_id: 会话ID
            
        Returns:
            是否为管理员
        """
        return session_id == self.admin_session_id
    
    def get_admin_session_id(self) -> str:
        """获取管理员会话ID"""
        return self.admin_session_id

# 全局会话管理器实例
session_manager = SessionManager() 