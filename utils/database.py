import sqlite3
import json
import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import threading
import random
import requests

logger = logging.getLogger(__name__)

class DatabaseManager:
    """数据库管理器，处理账号数据的存储和会话隔离"""
    
    def __init__(self, db_path: str = "accounts.db"):
        self.db_path = db_path
        self.lock = threading.Lock()
        self.init_database()
    
    def init_database(self):
        """初始化数据库表"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                # 创建账号表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS accounts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        email TEXT NOT NULL,
                        password TEXT,
                        client_id TEXT,
                        token TEXT,
                        device_id TEXT,
                        invite_code TEXT,
                        account_data TEXT,  -- JSON格式存储完整账号信息
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(session_id, email)
                    )
                ''')
                
                # 创建会话表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                # 创建代理池表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS proxy_pool (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        proxy_url TEXT NOT NULL UNIQUE,
                        protocol TEXT NOT NULL,  -- http, https, socks5
                        host TEXT NOT NULL,
                        port INTEGER NOT NULL,
                        username TEXT,
                        password TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        last_checked TIMESTAMP,
                        response_time REAL,  -- 响应时间(秒)
                        success_count INTEGER DEFAULT 0,
                        fail_count INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                # 创建索引
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_session_id ON accounts(session_id)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_email ON accounts(email)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_proxy_active ON proxy_pool(is_active)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_proxy_response_time ON proxy_pool(response_time)')
                
                conn.commit()
                logger.info("数据库初始化完成")
                
            except Exception as e:
                logger.error(f"数据库初始化失败: {e}")
                conn.rollback()
            finally:
                conn.close()
    
    def create_session(self, session_id: str) -> bool:
        """创建新会话"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT OR REPLACE INTO sessions (session_id, last_active)
                    VALUES (?, CURRENT_TIMESTAMP)
                ''', (session_id,))
                conn.commit()
                logger.info(f"会话 {session_id} 创建成功")
                return True
            except Exception as e:
                logger.error(f"创建会话失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()
    
    def update_session_activity(self, session_id: str):
        """更新会话活跃时间"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE sessions SET last_active = CURRENT_TIMESTAMP
                    WHERE session_id = ?
                ''', (session_id,))
                conn.commit()
            except Exception as e:
                logger.error(f"更新会话活跃时间失败: {e}")
            finally:
                conn.close()
    
    def save_account(self, session_id: str, account_info: Dict[str, Any]) -> bool:
        """保存账号信息"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                # 直接在同一个连接中更新会话活跃时间，避免死锁
                cursor.execute('''
                    UPDATE sessions SET last_active = CURRENT_TIMESTAMP
                    WHERE session_id = ?
                ''', (session_id,))
                
                cursor.execute('''
                    INSERT OR REPLACE INTO accounts 
                    (session_id, email, password, client_id, token, device_id, invite_code, account_data, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (
                    session_id,
                    account_info.get('email', ''),
                    account_info.get('password', ''),
                    account_info.get('client_id', ''),
                    account_info.get('access_token', account_info.get('token', '')),  # 优先使用access_token
                    account_info.get('device_id', ''),
                    account_info.get('invite_code', ''),
                    json.dumps(account_info, ensure_ascii=False)
                ))
                
                conn.commit()
                logger.info(f"账号 {account_info.get('email')} 保存成功 (会话: {session_id})")
                return True
                
            except Exception as e:
                logger.error(f"保存账号失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()
    
    def get_accounts(self, session_id: str, is_admin: bool = False) -> List[Dict[str, Any]]:
        """获取账号列表"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                if is_admin:
                    # 管理员可以看到所有账号
                    cursor.execute('''
                        SELECT id, session_id, email, account_data, created_at, updated_at
                        FROM accounts
                        ORDER BY updated_at DESC
                    ''')
                else:
                    # 普通用户只能看到自己的账号
                    cursor.execute('''
                        SELECT id, session_id, email, account_data, created_at, updated_at
                        FROM accounts
                        WHERE session_id = ?
                        ORDER BY updated_at DESC
                    ''', (session_id,))
                
                rows = cursor.fetchall()
                
                # 在查询之后更新会话活跃时间，避免影响查询结果
                if not is_admin:
                    cursor.execute('''
                        UPDATE sessions SET last_active = CURRENT_TIMESTAMP
                        WHERE session_id = ?
                    ''', (session_id,))
                    conn.commit()  # 提交更新
                
                accounts = []
                for row in rows:
                    account_data = json.loads(row[3]) if row[3] else {}
                    account_data.update({
                        'id': row[0],
                        'session_id': row[1],
                        'email': row[2],
                        'created_at': row[4],
                        'updated_at': row[5]
                    })
                    accounts.append(account_data)
                
                return accounts
                
            except Exception as e:
                logger.error(f"获取账号列表失败: {e}")
                return []
            finally:
                conn.close()
    
    def update_account(self, session_id: str, account_id: int, account_data: Dict[str, Any], is_admin: bool = False) -> bool:
        """更新账号信息"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                # 检查权限
                if not is_admin:
                    cursor.execute('SELECT session_id FROM accounts WHERE id = ?', (account_id,))
                    result = cursor.fetchone()
                    if not result or result[0] != session_id:
                        logger.warning(f"用户 {session_id} 尝试更新不属于自己的账号 {account_id}")
                        return False
                
                cursor.execute('''
                    UPDATE accounts 
                    SET email = ?, password = ?, client_id = ?, token = ?, 
                        device_id = ?, invite_code = ?, account_data = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (
                    account_data.get('email', ''),
                    account_data.get('password', ''),
                    account_data.get('client_id', ''),
                    account_data.get('access_token', account_data.get('token', '')),  # 优先使用access_token
                    account_data.get('device_id', ''),
                    account_data.get('invite_code', ''),
                    json.dumps(account_data, ensure_ascii=False),
                    account_id
                ))
                
                if cursor.rowcount > 0:
                    conn.commit()
                    logger.info(f"账号 {account_id} 更新成功")
                    return True
                else:
                    logger.warning(f"账号 {account_id} 不存在")
                    return False
                
            except Exception as e:
                logger.error(f"更新账号失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()
    
    def delete_account(self, session_id: str, account_id: int, is_admin: bool = False) -> bool:
        """删除账号"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                # 检查权限
                if not is_admin:
                    cursor.execute('SELECT session_id FROM accounts WHERE id = ?', (account_id,))
                    result = cursor.fetchone()
                    if not result or result[0] != session_id:
                        logger.warning(f"用户 {session_id} 尝试删除不属于自己的账号 {account_id}")
                        return False
                
                cursor.execute('DELETE FROM accounts WHERE id = ?', (account_id,))
                
                if cursor.rowcount > 0:
                    conn.commit()
                    logger.info(f"账号 {account_id} 删除成功")
                    return True
                else:
                    logger.warning(f"账号 {account_id} 不存在")
                    return False
                
            except Exception as e:
                logger.error(f"删除账号失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()
    
    def get_account_by_id(self, session_id: str, account_id: int, is_admin: bool = False) -> Optional[Dict[str, Any]]:
        """根据ID获取账号信息"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                if is_admin:
                    cursor.execute('''
                        SELECT id, session_id, email, account_data, created_at, updated_at
                        FROM accounts WHERE id = ?
                    ''', (account_id,))
                else:
                    cursor.execute('''
                        SELECT id, session_id, email, account_data, created_at, updated_at
                        FROM accounts WHERE id = ? AND session_id = ?
                    ''', (account_id, session_id))
                
                row = cursor.fetchone()
                if row:
                    account_data = json.loads(row[3]) if row[3] else {}
                    account_data.update({
                        'id': row[0],
                        'session_id': row[1],
                        'email': row[2],
                        'created_at': row[4],
                        'updated_at': row[5]
                    })
                    return account_data
                
                return None
                
            except Exception as e:
                logger.error(f"获取账号信息失败: {e}")
                return None
            finally:
                conn.close()
    
    def migrate_from_files(self, account_dir: str = "account") -> int:
        """从文件迁移数据到数据库"""
        if not os.path.exists(account_dir):
            return 0
        
        migrated_count = 0
        default_session = "migrated_data"
        
        for filename in os.listdir(account_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(account_dir, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        account_data = json.load(f)
                    
                    if isinstance(account_data, dict) and 'email' in account_data:
                        if self.save_account(default_session, account_data):
                            migrated_count += 1
                            logger.info(f"迁移账号文件: {filename}")
                        
                except Exception as e:
                    logger.error(f"迁移文件 {filename} 失败: {e}")
        
        logger.info(f"数据迁移完成，共迁移 {migrated_count} 个账号")
        return migrated_count

    # 代理池管理方法
    def parse_proxy_url(self, proxy_url: str) -> Optional[Dict[str, Any]]:
        """解析代理URL"""
        try:
            import urllib.parse
            parsed = urllib.parse.urlparse(proxy_url)
            
            if not parsed.scheme or not parsed.hostname or not parsed.port:
                return None
            
            return {
                'protocol': parsed.scheme.lower(),
                'host': parsed.hostname,
                'port': parsed.port,
                'username': parsed.username,
                'password': parsed.password
            }
        except Exception as e:
            logger.error(f"解析代理URL失败: {e}")
            return None

    def add_proxy(self, proxy_url: str) -> bool:
        """添加代理到代理池"""
        proxy_info = self.parse_proxy_url(proxy_url)
        if not proxy_info:
            logger.error(f"无效的代理URL格式: {proxy_url}")
            return False
        
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT OR REPLACE INTO proxy_pool 
                    (proxy_url, protocol, host, port, username, password, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (
                    proxy_url,
                    proxy_info['protocol'],
                    proxy_info['host'],
                    proxy_info['port'],
                    proxy_info['username'],
                    proxy_info['password']
                ))
                
                conn.commit()
                logger.info(f"代理 {proxy_url} 添加成功")
                return True
                
            except Exception as e:
                logger.error(f"添加代理失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def remove_proxy(self, proxy_id: int) -> bool:
        """删除代理"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM proxy_pool WHERE id = ?', (proxy_id,))
                
                if cursor.rowcount > 0:
                    conn.commit()
                    logger.info(f"代理 {proxy_id} 删除成功")
                    return True
                else:
                    logger.warning(f"代理 {proxy_id} 不存在")
                    return False
                
            except Exception as e:
                logger.error(f"删除代理失败: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def get_proxy_list(self) -> List[Dict[str, Any]]:
        """获取代理列表"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT id, proxy_url, protocol, host, port, username, password,
                           is_active, last_checked, response_time, success_count, 
                           fail_count, created_at, updated_at
                    FROM proxy_pool
                    ORDER BY is_active DESC, response_time ASC, success_count DESC
                ''')
                
                proxies = []
                for row in cursor.fetchall():
                    proxies.append({
                        'id': row[0],
                        'proxy_url': row[1],
                        'protocol': row[2],
                        'host': row[3],
                        'port': row[4],
                        'username': row[5],
                        'password': row[6],
                        'is_active': bool(row[7]),
                        'last_checked': row[8],
                        'response_time': row[9],
                        'success_count': row[10],
                        'fail_count': row[11],
                        'created_at': row[12],
                        'updated_at': row[13]
                    })
                
                return proxies
                
            except Exception as e:
                logger.error(f"获取代理列表失败: {e}")
                return []
            finally:
                conn.close()

    def test_proxy(self, proxy_url: str, test_url: str = "https://httpbin.org/ip", timeout: int = 10) -> Dict[str, Any]:
        """测试代理连接"""
        try:
            proxies = {
                "http": proxy_url,
                "https": proxy_url
            }
            
            start_time = datetime.now()
            response = requests.get(test_url, proxies=proxies, timeout=timeout)
            end_time = datetime.now()
            
            response_time = (end_time - start_time).total_seconds()
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'response_time': response_time,
                    'status_code': response.status_code,
                    'response': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text[:200]
                }
            else:
                return {
                    'success': False,
                    'response_time': response_time,
                    'status_code': response.status_code,
                    'error': f"HTTP {response.status_code}"
                }
                
        except Exception as e:
            return {
                'success': False,
                'response_time': None,
                'error': str(e)
            }

    def update_proxy_status(self, proxy_id: int, success: bool, response_time: Optional[float] = None):
        """更新代理状态"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                
                if success:
                    cursor.execute('''
                        UPDATE proxy_pool 
                        SET success_count = success_count + 1, 
                            last_checked = CURRENT_TIMESTAMP,
                            response_time = ?,
                            is_active = 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (response_time, proxy_id))
                else:
                    cursor.execute('''
                        UPDATE proxy_pool 
                        SET fail_count = fail_count + 1, 
                            last_checked = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (proxy_id,))
                    
                    # 如果失败次数过多，标记为不活跃
                    cursor.execute('''
                        UPDATE proxy_pool 
                        SET is_active = 0
                        WHERE id = ? AND fail_count >= 5
                    ''', (proxy_id,))
                
                conn.commit()
                
            except Exception as e:
                logger.error(f"更新代理状态失败: {e}")
                conn.rollback()
            finally:
                conn.close()

    def get_random_proxy(self) -> Optional[str]:
        """从代理池中随机获取一个可用代理"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT id, proxy_url FROM proxy_pool 
                    WHERE is_active = 1 
                    ORDER BY response_time ASC, success_count DESC
                    LIMIT 10
                ''')
                
                proxies = cursor.fetchall()
                if not proxies:
                    return None
                
                # 随机选择一个代理
                selected_proxy = random.choice(proxies)
                proxy_id, proxy_url = selected_proxy
                
                logger.info(f"选择代理: {proxy_url}")
                return proxy_url
                
            except Exception as e:
                logger.error(f"获取随机代理失败: {e}")
                return None
            finally:
                conn.close()

    def batch_test_proxies(self) -> Dict[str, Any]:
        """批量测试所有代理"""
        proxies = self.get_proxy_list()
        results = {
            'total': len(proxies),
            'tested': 0,
            'success': 0,
            'failed': 0,
            'details': []
        }
        
        for proxy in proxies:
            proxy_id = proxy['id']
            proxy_url = proxy['proxy_url']
            
            logger.info(f"测试代理: {proxy_url}")
            test_result = self.test_proxy(proxy_url)
            
            self.update_proxy_status(
                proxy_id, 
                test_result['success'], 
                test_result.get('response_time')
            )
            
            results['tested'] += 1
            if test_result['success']:
                results['success'] += 1
            else:
                results['failed'] += 1
            
            results['details'].append({
                'id': proxy_id,
                'proxy_url': proxy_url,
                'success': test_result['success'],
                'response_time': test_result.get('response_time'),
                'error': test_result.get('error')
            })
        
        logger.info(f"代理测试完成: {results['success']}/{results['total']} 成功")
        return results

# 全局数据库实例
db_manager = DatabaseManager() 