import React, { useState } from 'react';
import { Card, Input, Button, List, Typography, Tag, message, Result } from 'antd';
import './index.css';
import { activateAccounts } from '../../services/api';

const { Title, Paragraph } = Typography;

interface AccountResult {
  status: 'success' | 'error';
  account: string;
  message?: string;
  result?: any;
  updated?: boolean;
}

const Activate: React.FC = () => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AccountResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) {
      message.error('请输入激活密钥');
      return;
    }

    setLoading(true);
    setShowResults(false);
    setResults([]);

    try {
      const response = await activateAccounts(key);

      const data = response.data;

      if (data.status === 'success') {
        message.success(data.message || '激活成功完成');
      } else if (data.status === 'error') {
        message.error(data.message || '激活操作返回错误');
      } else {
        message.warning('收到未知的响应状态');
      }

      setResults(data.results || []);
      setShowResults(true);

    } catch (error: any) {
      console.error('激活错误:', error);
      message.error(error.message || '激活过程中发生网络或未知错误');
      setResults([]);
      setShowResults(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="activate-container">
      <Card title="PikPak 账号一键激活" className="activate-card">
        <Paragraph>
          输入激活密钥，一键激活所有已注册的PikPak账号。
        </Paragraph>
        <Paragraph>
          激活密钥在 <a href="https://kiteyuan.info" target="_blank" rel="noopener noreferrer">纸鸢佬的导航</a>
        </Paragraph>
        <div className="key-input-container">
          <Input.Password 
            placeholder="请输入激活密钥" 
            value={key} 
            onChange={e => setKey(e.target.value)} 
            style={{ width: '60%' }}
          />
          <Button 
            type="primary" 
            onClick={handleActivate} 
            loading={loading}
          >
            激活所有账号
          </Button>
        </div>
        
        {showResults && (
          <div className="results-container">
            <Title level={4}>激活结果</Title>
            <List
              itemLayout="horizontal"
              dataSource={results}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    title={item.account}
                    description={
                      item.status === 'success' 
                        ? <Tag color="success">激活成功{item.updated && ' (数据已更新)'}</Tag>
                        : <Tag color="error">{item.message || '未知错误'}</Tag>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
        
        {!loading && !showResults && results.length === 0 && (
          <Result
            status="info"
            title="准备就绪"
            subTitle="输入激活密钥并点击激活按钮开始激活账号"
          />
        )}
      </Card>
    </div>
  );
};

export default Activate; 