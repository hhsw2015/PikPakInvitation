import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Typography, Tag, message, Result, Checkbox, Spin, Row, Col, Table, Space } from 'antd';
import './index.css';
import { activateAccounts, fetchAccounts } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';

const { Title, Paragraph } = Typography;

interface AccountResult {
  status: 'success' | 'error';
  account: string;
  message?: string;
  result?: any;
  updated?: boolean;
}

interface Account {
  email: string;
  name: string;
  filename: string;
  user_id?: string;
  version?: string;
  device_id?: string;
  timestamp?: string;
  // 其他账户属性...
}

// 格式化时间戳
const formatTimestamp = (timestampStr?: string): string => {
  if (!timestampStr) return '-';
  try {
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return '无效时间戳';
    // 检查时间戳是否是毫秒级，如果不是（例如秒级），乘以1000
    const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    return date.toLocaleString('zh-CN'); // 使用本地化格式
  } catch (e) {
    console.error("Error formatting timestamp:", e);
    return '格式化错误';
  }
};

const Activate: React.FC = () => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AccountResult[]>([]);
  const [view, setView] = useState<'initial' | 'loading' | 'accounts' | 'success_summary'>('initial');
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // 状态
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // 组件加载时获取账户列表
  useEffect(() => {
    loadAccounts();
  }, []);

  // 加载账户列表函数
  const loadAccounts = async () => {
    setLoadingAccounts(true);
    setView('loading');
    try {
      const response = await fetchAccounts();
      if (response.data.status === 'success') {
        setAccounts(response.data.accounts || []);
        setView('accounts'); // 加载成功后显示账户列表
      } else {
        message.error(response.data.message || '获取账户列表失败');
        setView('initial'); // 失败返回初始状态
      }
    } catch (error: any) {
      console.error('获取账户错误:', error);
      message.error('获取账户列表时出错: ' + (error.message || '未知错误'));
      setView('initial'); // 异常返回初始状态
    } finally {
      setLoadingAccounts(false);
    }
  };

  // 处理所选行变化
  const onSelectChange = (selectedRowKeys: React.Key[]) => {
    setSelectedAccounts(selectedRowKeys as string[]);
  };

  // 激活所有账户
  const handleActivateAll = async () => {
    await handleActivate(true, []);
  };

  // 激活选定账户
  const handleActivateSelected = async () => {
    if (selectedAccounts.length === 0) {
      message.warning('请至少选择一个账户进行激活');
      return;
    }
    await handleActivate(false, selectedAccounts);
  };

  // 激活账户通用函数
  const handleActivate = async (activateAll: boolean, names: string[]) => {
    if (!key.trim()) {
      message.error('请输入激活密钥');
      return;
    }

    setLoading(true);
    setView('loading'); // 设置为加载中视图
    setResults([]);
    setSuccessMessage('');

    try {
      const response = await activateAccounts(key, names, activateAll);
      const data = response.data;

      if (data.status === 'success') {
        // message.success(data.message || '激活成功完成'); // 使用下方摘要信息
        setResults(data.results || []);
        setSuccessMessage(data.message || '激活成功完成');
        setView('success_summary'); // 显示成功摘要视图
        setSelectedAccounts([]); // 清空选择，为下次做准备
      } else if (data.status === 'error') {
        message.error(data.message || '激活操作返回错误');
        setView('accounts'); // 激活失败返回账户列表视图
      } else {
        message.warning('收到未知的响应状态');
        setView('accounts'); // 未知状态也返回账户列表
      }

    } catch (error: any) {
      console.error('激活错误:', error);
      message.error(error.message || '激活过程中发生网络或未知错误');
      setView('accounts'); // 异常返回账户列表
    } finally {
      setLoading(false);
    }
  };

  // 返回账户选择视图
  const handleContinueActivating = () => {
    // setView('accounts'); // 先不切换视图，等待加载完成
    setResults([]); // 可以选择性清空结果
    setSuccessMessage('');
    loadAccounts(); // 重新加载账户列表，加载函数内部会设置视图
  };

  // 表格列定义
  const columns: ColumnsType<Account> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: '15%',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (text) => <span style={{ fontWeight: 'bold' }}>{text}</span>,
      ellipsis: true,
    },
    {
      title: 'Device ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: '30%',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: '20%',
      render: (timestamp) => formatTimestamp(timestamp),
      sorter: (a, b) => parseInt(a.timestamp || '0') - parseInt(b.timestamp || '0'),
      defaultSortOrder: 'descend',
    }
  ];

  // 表格行选择配置
  const rowSelection = {
    selectedRowKeys: selectedAccounts,
    onChange: onSelectChange,
  };

  // 结果表格列定义（现在用于成功摘要）
  const successResultColumns: ColumnsType<AccountResult> = [
    {
      title: '邮箱',
      dataIndex: 'account',
      key: 'account',
      width: '60%',
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => (
        record.status === 'success' 
          ? <Tag color="success">已激活{record.updated && ' (数据已更新)'}</Tag>
          : <Tag color="error">{record.message || '激活失败'}</Tag> // 即使在成功摘要里，也处理可能的失败情况
      ),
    }
  ];

  return (
    <div className="activate-container">
      <Card title="PikPak 账号激活" className="activate-card" variant="borderless">
        <div style={{ marginBottom: '20px' }}>
          <Row gutter={16} align="middle">
            <Col span={16}>
              <Input.Password 
                placeholder="请输入激活密钥" 
                value={key} 
                onChange={e => setKey(e.target.value)} 
                style={{ width: '100%' }}
                size="large"
                disabled={view === 'loading'} // 加载时禁用
              />
            </Col>
            <Col span={8}>
              <Space>
                <Button 
                  type="primary" 
                  onClick={handleActivateSelected} 
                  loading={loading && view === 'loading'} // 仅在加载中且是当前操作时显示loading
                  disabled={selectedAccounts.length === 0 || view !== 'accounts'} // 仅在账户视图且有选择时可用
                  size="large"
                >
                  激活选定 ({selectedAccounts.length})
                </Button>
                <Button 
                  onClick={handleActivateAll} 
                  loading={loading && view === 'loading'} // 同上
                  disabled={view !== 'accounts'} // 仅在账户视图可用
                  size="large"
                >
                  激活全部
                </Button>
              </Space>
            </Col>
          </Row>
          <Paragraph style={{ marginTop: '8px', color: '#888' }}>
            激活密钥在 <a href="https://kiteyuan.info" target="_blank" rel="noopener noreferrer">纸鸢佬的导航</a>
          </Paragraph>
        </div>
        
        {/* 加载中提示 */} 
        {view === 'loading' && (
           <div style={{ textAlign: 'center', padding: '40px 0' }}>
             <Spin size="large" />
           </div>
        )}

        {/* 账户列表视图 */} 
        {view === 'accounts' && (
          <div className="accounts-container">
            <Table
              rowSelection={rowSelection}
              columns={columns}
              dataSource={accounts}
              rowKey="filename"
              loading={loadingAccounts} // 表格自身的加载状态
              pagination={{ pageSize: 10 }}
              size="middle"
              locale={{ emptyText: '未找到账户数据，请先注册账户' }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={columns.length + 1}>
                      <div style={{ textAlign: 'left', padding: '8px 0' }}>
                        已选择 {selectedAccounts.length} 个账户 (共 {accounts.length} 个)
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        )}
        
        {/* 成功摘要视图 */} 
        {view === 'success_summary' && (
          <div className="results-container" style={{ marginTop: '30px' }}>
            <Result
              status="success"
              title="激活操作完成"
              subTitle={successMessage}
              extra={[
                <Button type="primary" key="continue" onClick={handleContinueActivating}>
                  继续激活
                </Button>,
              ]}
            />
            {/* 可选：显示简化的成功列表 */} 
            {results.length > 0 && (
               <Table
                 columns={successResultColumns}
                 dataSource={results.filter(r => r.status === 'success')} // 只显示成功的
                 rowKey="account"
                 pagination={{ pageSize: 5 }} // 分页显示
                 size="small"
                 style={{ marginTop: '20px' }}
               />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Activate; 