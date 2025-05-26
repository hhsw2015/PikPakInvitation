import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Input, 
  Button, 
  Typography, 
  Tag, 
  message, 
  Result, 
  Spin, 
  Row, 
  Col, 
  Table, 
  Space, 
  Select,
  Statistic,
  Alert,
  Tooltip,
  Badge,
} from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  FilterOutlined,
  ClearOutlined,
  UserOutlined,
  MailOutlined,
  CalendarOutlined,
  GiftOutlined
} from '@ant-design/icons';
import './index.css';
import { activateAccounts, fetchAccounts } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

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
  invite_code?: string;
  // 其他账户属性...
}

// 格式化时间戳
const formatTimestamp = (timestampStr?: string): string => {
  if (!timestampStr) return '-';
  try {
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return '无效时间戳';
    const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    return date.toLocaleString('zh-CN');
  } catch (e) {
    console.error("Error formatting timestamp:", e);
    return '格式化错误';
  }
};

// 获取相对时间
const getRelativeTime = (timestampStr?: string): string => {
  if (!timestampStr) return '-';
  try {
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return '无效时间戳';
    const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffDays > 0) return `${diffDays}天前`;
    if (diffHours > 0) return `${diffHours}小时前`;
    if (diffMinutes > 0) return `${diffMinutes}分钟前`;
    return '刚刚';
  } catch (e) {
    return '时间错误';
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
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [activatingAccount, setActivatingAccount] = useState<string>('');

  // 筛选状态
  const [inviteCodeFilter, setInviteCodeFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [availableInviteCodes, setAvailableInviteCodes] = useState<string[]>([]);

  // 组件加载时获取账户列表
  useEffect(() => {
    loadAccounts();
  }, []);

  // 筛选账户
  useEffect(() => {
    let filtered = accounts;
    
    if (inviteCodeFilter) {
      filtered = filtered.filter(account => 
        account.invite_code === inviteCodeFilter
      );
    }
    
    if (emailFilter) {
      filtered = filtered.filter(account => 
        account.email.toLowerCase().includes(emailFilter.toLowerCase()) ||
        account.name.toLowerCase().includes(emailFilter.toLowerCase())
      );
    }
    
    setFilteredAccounts(filtered);
    
    // 清空选择的账户（如果它们不在筛选结果中）
    const filteredFilenames = filtered.map(acc => acc.filename);
    setSelectedAccounts(prev => prev.filter(filename => filteredFilenames.includes(filename)));
  }, [accounts, inviteCodeFilter, emailFilter]);

  // 提取可用的邀请码
  useEffect(() => {
    const codes = Array.from(new Set(
      accounts
        .map(acc => acc.invite_code)
        .filter((code): code is string => code !== undefined && code.trim() !== '')
    )).sort();
    setAvailableInviteCodes(codes);
  }, [accounts]);

  // 加载账户列表函数
  const loadAccounts = async () => {
    setLoadingAccounts(true);
    setView('loading');
    try {
      const response = await fetchAccounts();
      if (response.data.status === 'success') {
        setAccounts(response.data.accounts || []);
        setView('accounts');
      } else {
        message.error(response.data.message || '获取账户列表失败');
        setView('initial');
      }
    } catch (error: any) {
      console.error('获取账户错误:', error);
      message.error('获取账户列表时出错: ' + (error.message || '未知错误'));
      setView('initial');
    } finally {
      setLoadingAccounts(false);
    }
  };

  // 处理所选行变化
  const onSelectChange = (selectedRowKeys: React.Key[]) => {
    setSelectedAccounts(selectedRowKeys as string[]);
  };

  // 清空筛选
  const clearFilters = () => {
    setInviteCodeFilter('');
    setEmailFilter('');
  };

  // 激活单个账号
  const handleActivateSingle = async (account: string) => {
    if (!key.trim()) {
      message.error('请输入激活密钥');
      return;
    }

    const account_name = account.split('@')[0];
    setActivatingAccount(account_name);
    setLoading(true);
    
    try {
      const response = await activateAccounts(key, [account_name], false);
      const data = response.data;

      if (data.status === 'success') {
        const result = data.results.find((r: any) => r.account === account);
        message.success(`账号 ${account} 激活${result?.status === 'success' ? '成功' : '失败'}`);
        
        const updatedResults = [...results];
        const index = updatedResults.findIndex((r: AccountResult) => r.account === account);
        if (index !== -1) {
          const updatedAccount = data.results.find((r: any) => r.account === account);
          if (updatedAccount) {
            updatedResults[index] = updatedAccount;
            setResults(updatedResults);
          }
        }
      } else {
        message.error(data.message || '激活操作返回错误');
      }
    } catch (error: any) {
      console.error('激活错误:', error);
      message.error(error.message || '激活过程中发生网络或未知错误');
    } finally {
      setLoading(false);
      setActivatingAccount('');
    }
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

  // 激活筛选结果中的所有账户
  const handleActivateFiltered = async () => {
    if (filteredAccounts.length === 0) {
      message.warning('当前筛选结果为空');
      return;
    }
    const filteredFilenames = filteredAccounts.map(acc => acc.filename);
    await handleActivate(false, filteredFilenames);
  };

  // 激活账户通用函数
  const handleActivate = async (activateAll: boolean, names: string[]) => {
    if (!key.trim()) {
      message.error('请输入激活密钥');
      return;
    }

    setLoading(true);
    setView('loading');
    setResults([]);
    setSuccessMessage('');

    try {
      const response = await activateAccounts(key, names, activateAll);
      const data = response.data;

      if (data.status === 'success') {
        setResults(data.results || []);
        setSuccessMessage(data.message || '激活成功完成');
        setView('success_summary');
        setSelectedAccounts([]);
      } else if (data.status === 'error') {
        message.error(data.message || '激活操作返回错误');
        setView('accounts');
      } else {
        message.warning('收到未知的响应状态');
        setView('accounts');
      }
    } catch (error: any) {
      console.error('激活错误:', error);
      message.error(error.message || '激活过程中发生网络或未知错误');
      setView('accounts');
    } finally {
      setLoading(false);
    }
  };

  // 返回账户选择视图
  const handleContinueActivating = () => {
    setResults([]);
    setSuccessMessage('');
    loadAccounts();
  };

  // 表格列定义
  const columns: ColumnsType<Account> = [
    {
      title: (
        <Space>
          <GiftOutlined />
          邀请码
        </Space>
      ),
      dataIndex: 'invite_code',
      key: 'invite_code',
      width: '15%',
      render: (invite_code?: string) => (
        invite_code ? (
          <Tag color="blue" style={{ fontFamily: 'monospace' }}>
            {invite_code}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
      ellipsis: true,
    },
    {
      title: (
        <Space>
          <UserOutlined />
          名称
        </Space>
      ),
      dataIndex: 'name',
      key: 'name',
      width: '15%',
      render: (name: string) => (
        <Text strong style={{ color: '#1890ff' }}>
          {name}
        </Text>
      ),
    },
    {
      title: (
        <Space>
          <MailOutlined />
          邮箱
        </Space>
      ),
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => (
        <Tooltip title={text}>
          <Text code style={{ fontSize: '12px' }}>
            {text}
          </Text>
        </Tooltip>
      ),
      ellipsis: true,
    },
    {
      title: 'Device ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: '25%',
      render: (device_id: string) => (
        <Tooltip title={device_id}>
          <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
            {device_id ? `${device_id.substring(0, 8)}...${device_id.substring(device_id.length - 8)}` : '-'}
          </Text>
        </Tooltip>
      ),
      ellipsis: true,
    },
    {
      title: (
        <Space>
          <CalendarOutlined />
          创建时间
        </Space>
      ),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: '20%',
      render: (timestamp: string) => (
        <div>
          <div style={{ fontSize: '12px' }}>
            {formatTimestamp(timestamp)}
          </div>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {getRelativeTime(timestamp)}
          </Text>
        </div>
      ),
      sorter: (a, b) => parseInt(a.timestamp || '0') - parseInt(b.timestamp || '0'),
      defaultSortOrder: 'descend',
    }
  ];

  // 表格行选择配置
  const rowSelection = {
    selectedRowKeys: selectedAccounts,
    onChange: onSelectChange,
  };

  // 结果表格列定义
  const successResultColumns: ColumnsType<AccountResult> = [
    {
      title: '邮箱',
      dataIndex: 'account',
      key: 'account',
      width: '50%',
      render: (account: string) => (
        <Text strong>{account}</Text>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: '30%',
      render: (_, record) => (
        record.status === 'success' ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            已激活{record.updated && ' (数据已更新)'}
          </Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            {record.message || '激活失败'}
          </Tag>
        )
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '20%',
      render: (_, record) => (
        record.status === 'error' && (
          <Button 
            type="primary" 
            size="small" 
            icon={<ReloadOutlined />}
            onClick={() => handleActivateSingle(record.account)}
            loading={loading && activatingAccount === record.account}
          >
            重试
          </Button>
        )
      ),
    }
  ];

  // 统计信息
  const getStatistics = () => {
    const total = accounts.length;
    const filtered = filteredAccounts.length;
    const selected = selectedAccounts.length;
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    return { total, filtered, selected, successCount, errorCount };
  };

  const stats = getStatistics();

  return (
    <div className="activate-container">
      <Card className="activate-card">
        {/* 激活密钥输入区域 */}
        <div className="key-input-section">
          <Alert
            message="激活密钥获取"
            description={
              <span>
                激活密钥请在 <a href="https://kiteyuan.info" target="_blank" rel="noopener noreferrer">纸鸢佬的导航</a> 获取
              </span>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Row gutter={16} align="middle">
            <Col span={14}>
              <Input.Password 
                placeholder="请输入激活密钥" 
                value={key} 
                onChange={e => setKey(e.target.value)} 
                style={{ width: '100%' }}
                size="large"
                disabled={view === 'loading'}
              />
            </Col>
            <Col span={10}>
              <Row justify="end">
                <Space>
                  <Button 
                    type="primary" 
                    icon={<RocketOutlined />}
                    onClick={handleActivateSelected} 
                    loading={loading && view === 'loading'}
                    disabled={selectedAccounts.length === 0 || view !== 'accounts'}
                    size="large"
                  >
                    激活选定 ({selectedAccounts.length})
                  </Button>
                  <Button 
                    onClick={handleActivateAll} 
                    loading={loading && view === 'loading'}
                    disabled={view !== 'accounts'}
                    size="large"
                  >
                    激活全部
                  </Button>
                </Space>
              </Row>
            </Col>
          </Row>
        </div>



        {/* 筛选区域 */}
        {view === 'accounts' && (
          <div className="filter-section">
            <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
              <Col>
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                  <FilterOutlined style={{ marginRight: 8 }} />
                  筛选条件
                </Title>
              </Col>
              <Col>
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={loadAccounts}
                  loading={loadingAccounts}
                  type="text"
                >
                  刷新账户列表
                </Button>
              </Col>
            </Row>
            <Row gutter={16} align="middle">
              <Col span={6}>
                <Select
                  placeholder="选择邀请码"
                  value={inviteCodeFilter}
                  onChange={setInviteCodeFilter}
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                >
                  {availableInviteCodes.map(code => (
                    <Option key={code} value={code}>
                      <Badge color="blue" text={code} />
                    </Option>
                  ))}
                </Select>
              </Col>
              <Col span={6}>
                <Input
                  placeholder="搜索邮箱或名称"
                  value={emailFilter}
                  onChange={e => setEmailFilter(e.target.value)}
                  allowClear
                />
              </Col>
              <Col span={12}>
                <Row justify="end">
                  <Space>
                    <Button 
                      icon={<ClearOutlined />}
                      onClick={clearFilters}
                      disabled={!inviteCodeFilter && !emailFilter}
                    >
                      清空筛选
                    </Button>
                    <Button 
                      type="primary"
                      ghost
                      icon={<RocketOutlined />}
                      onClick={handleActivateFiltered}
                      disabled={filteredAccounts.length === 0}
                    >
                      激活筛选结果 ({filteredAccounts.length})
                    </Button>
                  </Space>
                </Row>
              </Col>
            </Row>
          </div>
        )}
        
        {/* 加载中提示 */} 
        {view === 'loading' && (
          <div className="loading-section">
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text>正在处理激活请求...</Text>
            </div>
          </div>
        )}

        {/* 账户列表视图 */} 
        {view === 'accounts' && (
          <div className="accounts-section">
            <Table
              rowSelection={rowSelection}
              columns={columns}
              dataSource={filteredAccounts}
              rowKey="filename"
              loading={loadingAccounts}
              pagination={{ 
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
              }}
              size="middle"
              locale={{ emptyText: '未找到符合条件的账户数据' }}
              scroll={{ x: 800 }}
            />
          </div>
        )}
        
        {/* 成功摘要视图 */} 
        {view === 'success_summary' && (
          <div className="results-section">
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
            
            {/* 激活结果统计 */}
            {results.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Row gutter={16} justify="center">
                  <Col span={8}>
                    <Statistic 
                      title="激活成功" 
                      value={stats.successCount} 
                      prefix={<CheckCircleOutlined />}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="激活失败" 
                      value={stats.errorCount} 
                      prefix={<CloseCircleOutlined />}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Col>
                </Row>
                
                <Table
                  columns={successResultColumns}
                  dataSource={results}
                  rowKey="account"
                  pagination={{ pageSize: 5 }}
                  size="small"
                  style={{ marginTop: 20 }}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Activate; 