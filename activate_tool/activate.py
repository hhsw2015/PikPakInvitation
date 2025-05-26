#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PikPak 自动激活脚本
功能：查询激活时间超过一天的账号，并调用激活接口进行激活
"""

import time
import json
import random
import logging
import requests
import sqlite3
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('activate.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class PikPakActivator:
    """PikPak自动激活器"""
    
    def __init__(self, config: Optional[Dict] = None):
        """初始化激活器"""
        if not config:
            config = self.load_config()
        
        self.db_path = config.get('db_path', 'accounts.db')
        self.api_base_url = config.get('api_base_url', 'http://localhost:5000')
        self.activation_key = config.get('activation_key')
        self.session_id = config.get('session_id', 'auto_activator')
        self.min_sleep_seconds = config.get('min_sleep_seconds', 10)
        self.max_sleep_seconds = config.get('max_sleep_seconds', 30)
        self.max_retries = config.get('max_retries', 3)
        self.retry_delay_seconds = config.get('retry_delay_seconds', 5)
        self.max_activation_count = config.get('max_activation_count', 3)
        
    def load_config(self) -> Dict:
        """加载配置文件, 会被args覆盖"""
        config_file = 'activate_config.json'
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                logger.info(f"已加载配置文件: {config_file}")
                return config
            except Exception as e:
                logger.warning(f"加载配置文件失败: {e}")
        
        logger.info("使用默认配置")
        return {}
    
    def is_admin_session(self) -> bool:
        """通过API检查当前会话是否为管理员会话"""
        try:
            url = f"{self.api_base_url}/api/session/check_admin"
            headers = {
                'Content-Type': 'application/json',
                'X-Session-ID': self.session_id
            }
            
            data = {
                "session_id": self.session_id
            }

            response = requests.post(url, json=data, headers=headers, timeout=10)

            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    is_admin = result.get('is_admin', False)
                    logger.info(f"API权限检查结果: {result.get('message', '')}")
                    return is_admin
                else:
                    logger.warning(f"API权限检查失败: {result.get('message', '未知错误')}")
                    return False
            else:
                logger.warning(f"API权限检查请求失败: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            logger.warning(f"调用API检查管理员权限时发生异常: {e}")
            # 检查失败直接按照非管理员处理
            return False
        
    def get_accounts_need_activation(self) -> List[Dict[str, Any]]:
        """获取需要激活的账号（上次激活时间为前一天12点后且激活次数小于3的）"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # 检查会话ID是否为管理员
            is_admin = self.is_admin_session()
            
            # 计算前一天12点的时间戳
            yesterday = datetime.now() - timedelta(days=1)
            yesterday_noon = yesterday.replace(hour=12, minute=0, second=0, microsecond=0)
            check_timestamp = yesterday_noon.strftime('%Y-%m-%d %H:%M:%S')
            
            logger.info(f"会话ID: {self.session_id} ({'管理员' if is_admin else '普通用户'})")
            logger.info(f"查询条件: 上次激活时间晚于 {check_timestamp} 且激活次数小于{self.max_activation_count}次")
            
            # 根据会话权限构建不同的查询
            if is_admin:
                # 管理员可以激活所有符合条件的账号
                logger.info("管理员权限: 查询所有符合条件的账号")
                cursor.execute('''
                    SELECT id, email, name, activation_status, last_activation_time, account_data, session_id
                    FROM accounts 
                    WHERE (
                        (activation_status IS NULL OR activation_status < ?) AND
                        (
                            last_activation_time IS NULL OR 
                            last_activation_time > ?
                        )
                    )
                    AND email IS NOT NULL 
                    AND email != ''
                    ORDER BY session_id ASC, activation_status ASC, last_activation_time ASC, created_at ASC
                ''', (self.max_activation_count, check_timestamp))
            else:
                # 普通用户只能激活自己会话的账号
                logger.info(f"普通用户权限: 只查询会话 {self.session_id} 的账号")
                cursor.execute('''
                    SELECT id, email, name, activation_status, last_activation_time, account_data, session_id
                    FROM accounts 
                    WHERE session_id = ? AND (
                        (activation_status IS NULL OR activation_status < ?) AND
                        (
                            last_activation_time IS NULL OR 
                            last_activation_time > ?
                        )
                    )
                    AND email IS NOT NULL 
                    AND email != ''
                    ORDER BY activation_status ASC, last_activation_time ASC, created_at ASC
                ''', (self.session_id, self.max_activation_count, check_timestamp))
            
            rows = cursor.fetchall()
            accounts = []
            
            for row in rows:
                account_data = json.loads(row[5]) if row[5] else {}
                account = {
                    'id': row[0],
                    'email': row[1],
                    'name': row[2],
                    'activation_status': row[3] if row[3] is not None else 0,
                    'last_activation_time': row[4],
                    'session_id': row[6] if len(row) > 6 else None,
                    **account_data
                }
                accounts.append(account)
            
            conn.close()
            logger.info(f"找到 {len(accounts)} 个符合条件的账号（激活次数<{self.max_activation_count}且上次激活时间>前一天12点）")
            
            # 输出详细信息便于调试
            for account in accounts[:5]:  # 只显示前5个账号的详细信息
                session_info = f", 会话: {account.get('session_id', '未知')}" if is_admin else ""
                logger.info(f"  账号: {account['name']}, 激活次数: {account['activation_status']}, 上次激活: {account['last_activation_time'] or '从未激活'}{session_info}")
            
            if len(accounts) > 5:
                logger.info(f"  ... 还有 {len(accounts) - 5} 个账号")
            
            return accounts
            
        except Exception as e:
            logger.error(f"查询需要激活的账号失败: {e}")
            return []
    
    def activate_account(self, account_name: str) -> bool:
        """激活单个账号（支持重试）"""
        for attempt in range(self.max_retries):
            try:
                if not self.activation_key:
                    logger.error("未设置激活密钥")
                    return False
                
                url = f"{self.api_base_url}/api/activate_account_with_names"
                headers = {
                    'Content-Type': 'application/json',
                    'X-Session-ID': self.session_id
                }
                
                data = {
                    "key": self.activation_key,
                    "names": [account_name],
                    "all": False
                }
                
                if attempt > 0:
                    logger.info(f"重试激活账号: {account_name} (第{attempt+1}次尝试)")
                else:
                    logger.info(f"正在激活账号: {account_name}")
                
                response = requests.post(url, json=data, headers=headers, timeout=60)
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('status') == 'success':
                        results = result.get('results', [])
                        if results:
                            first_result = results[0]
                            if first_result.get('status') == 'success':
                                logger.info(f"账号 {account_name} 激活成功")
                                return True
                            else:
                                error_msg = first_result.get('message', '未知错误')
                                if attempt < self.max_retries - 1:
                                    logger.warning(f"账号 {account_name} 激活失败: {error_msg}，将重试")
                                    time.sleep(self.retry_delay_seconds)
                                    continue
                                else:
                                    logger.warning(f"账号 {account_name} 激活失败: {error_msg}")
                                    return False
                        else:
                            if attempt < self.max_retries - 1:
                                logger.warning(f"账号 {account_name} 激活响应为空，将重试")
                                time.sleep(self.retry_delay_seconds)
                                continue
                            else:
                                logger.warning(f"账号 {account_name} 激活响应为空")
                                return False
                    else:
                        error_msg = result.get('message', '未知错误')
                        if attempt < self.max_retries - 1:
                            logger.warning(f"账号 {account_name} 激活失败: {error_msg}，将重试")
                            time.sleep(self.retry_delay_seconds)
                            continue
                        else:
                            logger.warning(f"账号 {account_name} 激活失败: {error_msg}")
                            return False
                else:
                    if attempt < self.max_retries - 1:
                        logger.warning(f"账号 {account_name} 激活请求失败: HTTP {response.status_code}，将重试")
                        time.sleep(self.retry_delay_seconds)
                        continue
                    else:
                        logger.error(f"账号 {account_name} 激活请求失败: HTTP {response.status_code}")
                        return False
                        
            except Exception as e:
                if attempt < self.max_retries - 1:
                    logger.warning(f"激活账号 {account_name} 时发生异常: {e}，将重试")
                    time.sleep(self.retry_delay_seconds)
                    continue
                else:
                    logger.error(f"激活账号 {account_name} 时发生异常: {e}")
                    return False
        
        return False
    
    def run_activation(self):
        """运行激活任务"""
        logger.info("=" * 50)
        logger.info("开始PikPak自动激活任务")
        logger.info("=" * 50)
        logger.info(f"激活条件: 上次激活时间为前一天12点后 且 激活次数<{self.max_activation_count}次")
        logger.info(f"配置信息: 暂停时间={self.min_sleep_seconds}-{self.max_sleep_seconds}秒, 最大重试={self.max_retries}次")
        
        if not self.activation_key:
            logger.error("请设置激活密钥")
            return
        
        # 获取需要激活的账号
        accounts = self.get_accounts_need_activation()
        
        if not accounts:
            logger.info("没有符合条件的账号需要激活")
            return
        
        success_count = 0
        failed_count = 0
        skipped_count = 0
        
        for i, account in enumerate(accounts):
            account_name = account.get('name') or account.get('email', '').split('@')[0]
            activation_status = account.get('activation_status', 0)
            
            logger.info("-" * 30)
            logger.info(f"处理第 {i+1}/{len(accounts)} 个账号: {account_name}")
            logger.info(f"邮箱: {account.get('email')}")
            logger.info(f"当前激活次数: {activation_status}")
            logger.info(f"上次激活时间: {account.get('last_activation_time', '从未激活')}")
            
            # 再次检查激活次数限制（双重保险）
            if activation_status >= self.max_activation_count:
                logger.warning(f"账号 {account_name} 激活次数已达限制({activation_status}>={self.max_activation_count})，跳过")
                skipped_count += 1
                continue
            
            # 激活账号
            if self.activate_account(account_name):
                success_count += 1
                new_status = activation_status + 1
                logger.info(f"✓ 账号 {account_name} 激活成功 (激活次数: {activation_status} -> {new_status})")
            else:
                failed_count += 1
                logger.warning(f"✗ 账号 {account_name} 激活失败")
            
            # 如果不是最后一个账号，暂停随机时间
            if i < len(accounts) - 1:
                sleep_time = random.randint(self.min_sleep_seconds, self.max_sleep_seconds)
                logger.info(f"暂停 {sleep_time} 秒后继续...")
                time.sleep(sleep_time)
        
        logger.info("=" * 50)
        logger.info(f"激活任务完成")
        logger.info(f"总处理账号: {len(accounts)} 个")
        logger.info(f"激活成功: {success_count} 个")
        logger.info(f"激活失败: {failed_count} 个")
        logger.info(f"跳过账号: {skipped_count} 个")
        logger.info("=" * 50)
        
        # 记录统计信息到日志
        if success_count > 0 or failed_count > 0 or skipped_count > 0:
            with open('activation_stats.log', 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - 处理:{len(accounts)}, 成功:{success_count}, 失败:{failed_count}, 跳过:{skipped_count}\n")

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='PikPak 自动激活脚本')
    parser.add_argument('--key', '-k', help='激活密钥')
    parser.add_argument('--db', '-d', help='数据库文件路径')
    parser.add_argument('--url', '-u', help='API服务地址')
    parser.add_argument('--session', '-s', help='会话ID')
    parser.add_argument('--config', '-c', help='配置文件路径')
    parser.add_argument('--max-activations', '-m', type=int, help='最大激活次数限制')
    
    args = parser.parse_args()
    
    # 加载配置
    config = {}
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r', encoding='utf-8') as f:
            config = json.load(f)
    
    # 命令行参数覆盖配置文件
    if args.key:
        config['activation_key'] = args.key
    if args.db:
        config['db_path'] = args.db
    if args.url:
        config['api_base_url'] = args.url
    if args.session:
        config['session_id'] = args.session
    if getattr(args, 'max_activations', None):
        config['max_activation_count'] = args.max_activations

    # 创建激活器
    activator = PikPakActivator(config)
    
    # 运行激活任务
    activator.run_activation()

if __name__ == "__main__":
    main() 