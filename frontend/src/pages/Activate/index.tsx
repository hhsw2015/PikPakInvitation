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
  Switch,
  Progress,
  Modal,
  InputNumber,
  Divider,
} from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  FilterOutlined,
  ClearOutlined,
  UserOutlined,
  MailOutlined,
  CalendarOutlined,
  GiftOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import './index.css';
import { activateAccounts, fetchAccounts, activateAccountsSequential } from '../../services/api';
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
  id: number;
  email: string;
  name: string;
  user_id?: string;
  version?: string;
  device_id?: string;
  timestamp?: string;
  invite_code?: string;
  session_id?: string;
  activation_status?: number;  // 激活状态：0=未激活，1+=激活次数
  last_activation_time?: string;  // 最后激活时间
  created_at?: string;
  updated_at?: string;
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
  const [view, setView] = useState<'initial' | 'loading' | 'accounts' | 'success_summary' | 'sequential_progress'>('initial');
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // 状态
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [activatingAccount, setActivatingAccount] = useState<string>('');

  // 顺序激活相关状态
  const [useSequential, setUseSequential] = useState<boolean>(false);
  const [sequentialProgress, setSequentialProgress] = useState<number>(0);
  const [sequentialTotal, setSequentialTotal] = useState<number>(0);
  const [sequentialCurrent, setSequentialCurrent] = useState<number>(0);
  const [sequentialCurrentAccount, setSequentialCurrentAccount] = useState<string>('');
  const [sequentialStatus, setSequentialStatus] = useState<string>('');
  const [sequentialMessage, setSequentialMessage] = useState<string>('');
  const [sequentialDelay, setSequentialDelay] = useState<number>(0);
  const [minDelay, setMinDelay] = useState<number>(10);
  const [maxDelay, setMaxDelay] = useState<number>(30);
  const [sequentialEventSource, setSequentialEventSource] = useState<EventSource | any | null>(null);
  const [showSequentialSettings, setShowSequentialSettings] = useState<boolean>(false);

  // 筛选状态
  const [inviteCodeFilter, setInviteCodeFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [activationStatusFilter, setActivationStatusFilter] = useState<string>('');
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
    
    if (activationStatusFilter) {
      filtered = filtered.filter(account => {
        const status = account.activation_status || 0;
        switch (activationStatusFilter) {
          case 'unactivated':
            return status === 0;
          case 'activated':
            return status > 0;
          case 'once':
            return status === 1;
          case 'multiple':
            return status > 1;
          default:
            return true;
        }
      });
    }
    
    setFilteredAccounts(filtered);
    
    // 清空选择的账户（如果它们不在筛选结果中）
    const filteredIds = filtered.map(acc => acc.id);
    setSelectedAccounts(prev => prev.filter(id => filteredIds.includes(id)));
  }, [accounts, inviteCodeFilter, emailFilter, activationStatusFilter]);

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
    setSelectedAccounts(selectedRowKeys as number[]);
  };

  // 清空筛选
  const clearFilters = () => {
    setInviteCodeFilter('');
    setEmailFilter('');
    setActivationStatusFilter('');
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
    
    // 获取选中账户的名称
    const selectedAccountNames = accounts
      .filter(acc => selectedAccounts.includes(acc.id))
      .map(acc => acc.name || acc.email.split('@')[0]);
    
    await handleActivate(false, selectedAccountNames);
  };

  // 激活筛选结果中的所有账户
  const handleActivateFiltered = async () => {
    if (filteredAccounts.length === 0) {
      message.warning('当前筛选结果为空');
      return;
    }
    const filteredAccountNames = filteredAccounts.map(acc => acc.name || acc.email.split('@')[0]);
    await handleActivate(false, filteredAccountNames);
  };

  // 激活账户通用函数
  const handleActivate = async (activateAll: boolean, names: string[]) => {
    if (!key.trim()) {
      message.error('请输入激活密钥');
      return;
    }

    setLoading(true);
    setView(useSequential ? 'sequential_progress' : 'loading');
    setResults([]);
    setSuccessMessage('');
    
    // 重置顺序激活状态
    if (useSequential) {
      setSequentialProgress(0);
      setSequentialTotal(activateAll ? accounts.length : names.length);
      setSequentialCurrent(0);
      setSequentialCurrentAccount('');
      setSequentialStatus('start');
      setSequentialMessage('正在准备激活...');
      
      // 清理之前的EventSource
      if (sequentialEventSource) {
        sequentialEventSource.close();
      }
      
      // 调用新的SSE API
      try {
        const eventSource = await activateAccountsSequential(key, names, activateAll, minDelay, maxDelay);
        setSequentialEventSource(eventSource);
        
        // 设置事件监听器
        eventSource.onopen = () => {
          console.log('SSE连接已打开');
        };
        
        // 监听消息事件
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // 设置状态
            setSequentialStatus(data.status);
            
            if (data.message) {
              setSequentialMessage(data.message);
            }
            
            switch (data.status) {
              case 'init':
                // 初始化消息
                console.log('SSE连接已初始化，开始处理激活');
                break;
                
              case 'start':
                setSequentialTotal(data.total || 0);
                break;
                
              case 'processing':
                setSequentialCurrent(data.current || 0);
                setSequentialCurrentAccount(data.account || '');
                setSequentialProgress(Math.floor((data.current / data.total) * 100) - 5); // 减5表示正在处理
                break;
                
              case 'result':
                if (data.account_result) {
                  setResults(prev => [...prev, data.account_result]);
                }
                setSequentialProgress(Math.floor((data.current / data.total) * 100));
                break;
                
              case 'delay':
                setSequentialDelay(data.delay || 0);
                break;
                
              case 'complete':
                setSuccessMessage(data.message || '激活成功完成');
                if (data.results) {
                  setResults(data.results);
                }
                setSequentialProgress(100);
                setLoading(false);
                eventSource.close();
                setSequentialEventSource(null);
                // 不自动刷新，用户点击时才刷新
                break;
                
              case 'error':
                message.error(data.message || '激活过程中发生错误');
                eventSource.close();
                setSequentialEventSource(null);
                setLoading(false);
                // 不跳转页面，保持在进度页面显示错误
                setSequentialMessage(data.message || '激活过程中发生错误');
                break;
            }
          } catch (e) {
            console.error('解析SSE消息错误:', e);
          }
        };
        
        // 监听错误事件
        eventSource.onerror = (error) => {
          console.error('SSE连接错误:', error);
          message.error('激活过程中连接中断，请刷新页面重试');
          eventSource.close();
          setSequentialEventSource(null);
          setLoading(false);
          // 不跳转页面，保持在进度页面显示错误
          setSequentialMessage('激活过程中连接中断，请刷新页面重试');
        };
        
      } catch (error: any) {
        console.error('创建SSE连接失败:', error);
        message.error('无法建立激活连接，请检查网络或重试');
        setLoading(false);
        // 不跳转页面，保持在进度页面显示错误
        setSequentialMessage('无法建立激活连接，请检查网络或重试');
      }
      
      // 不需要等待响应，因为使用SSE
      return;
    }

    // 以下是常规的一次性激活模式
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
        // 即使激活失败也刷新一下，可能有部分成功的
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

  // 处理取消顺序激活
  const handleCancelSequential = () => {
    if (sequentialEventSource) {
      sequentialEventSource.close();
      setSequentialEventSource(null);
    }
    setLoading(false);
    setView('accounts');
  };

  // 顺序激活设置对话框
  const showSequentialSettingsModal = () => {
    setShowSequentialSettings(true);
  };

  // 关闭顺序激活设置对话框
  const closeSequentialSettingsModal = () => {
    setShowSequentialSettings(false);
  };

  // 返回账户选择视图（用户主动点击）
  const handleContinueActivating = () => {
    setResults([]);
    setSuccessMessage('');
    loadAccounts(); // 用户主动点击时刷新
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
      title: (
        <Space>
          <CheckCircleOutlined />
          激活状态
        </Space>
      ),
      dataIndex: 'activation_status',
      key: 'activation_status',
      width: '12%',
      render: (status: number, record: Account) => {
        const activationStatus = status || 0;
        if (activationStatus === 0) {
          return (
            <Tag color="default" icon={<ClockCircleOutlined />}>
              未激活
            </Tag>
          );
        } else {
          return (
            <div>
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {activationStatus}次
              </Tag>
              {record.last_activation_time && (
                <div style={{ fontSize: '10px', color: '#666' }}>
                  {new Date(record.last_activation_time).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
          );
        }
      },
      sorter: (a, b) => (a.activation_status || 0) - (b.activation_status || 0),
    },
    {
      title: 'Device ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: '20%',
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
    
    // 激活状态统计
    const unactivated = accounts.filter(acc => (acc.activation_status || 0) === 0).length;
    const activated = accounts.filter(acc => (acc.activation_status || 0) > 0).length;
    const totalActivations = accounts.reduce((sum, acc) => sum + (acc.activation_status || 0), 0);
    
    return { 
      total, 
      filtered, 
      selected, 
      successCount, 
      errorCount,
      unactivated,
      activated,
      totalActivations
    };
  };

  const stats = getStatistics();

  // 激活视图内容
  const renderContent = () => {
    // 显示进度条视图
    if (view === 'sequential_progress') {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Card>
            <Result
              status="info"
              title="顺序激活进行中"
              subTitle={sequentialMessage}
            />
            
            <div style={{ marginTop: '20px', marginBottom: '20px' }}>
              <Progress 
                percent={sequentialProgress} 
                status={sequentialProgress === 100 ? 'success' : 'active'} 
                format={percent => `${sequentialCurrent}/${sequentialTotal} (${percent}%)`}
              />
            </div>
            
            {sequentialCurrentAccount && sequentialStatus === 'processing' && (
              <Alert
                message={`正在激活: ${sequentialCurrentAccount}`}
                type="info"
                showIcon
                style={{ marginBottom: '20px' }}
              />
            )}
            
            {sequentialDelay > 0 && sequentialStatus === 'delay' && (
              <Alert
                message={`等待 ${sequentialDelay} 秒后继续下一个账号`}
                type="warning"
                showIcon
                style={{ marginBottom: '20px' }}
              />
            )}
            
            {results.length > 0 && (
              <div style={{ marginTop: '20px', textAlign: 'left' }}>
                <Title level={4}>已完成账号</Title>
                <ul style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {results.map((result, index) => (
                    <li key={index} style={{ marginBottom: '8px' }}>
                      <Tag color={result.status === 'success' ? 'success' : 'error'}>
                        {result.status === 'success' ? '成功' : '失败'}
                      </Tag>
                      <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>{result.account}</span>
                      {result.message && (
                        <span style={{ marginLeft: '8px', color: '#888' }}>{result.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div style={{ marginTop: '20px' }}>
              <Space>
                {sequentialProgress < 100 && !sequentialStatus.includes('error') && sequentialStatus !== 'error' ? (
                  <Button type="primary" danger onClick={handleCancelSequential}>
                    取消激活
                  </Button>
                ) : sequentialProgress === 100 ? (
                  <Button type="primary" onClick={handleContinueActivating}>
                    返回账户列表
                  </Button>
                ) : (
                  <Space>
                    <Button type="primary" onClick={handleContinueActivating}>
                      返回账户列表
                    </Button>
                    <Button type="primary" danger onClick={() => {
                      // 重置状态并重新开始激活
                      setSequentialProgress(0);
                      setSequentialCurrent(0);
                      setSequentialTotal(0);
                      setSequentialCurrentAccount('');
                      setSequentialMessage('正在准备重新激活...');
                      setResults([]);
                      handleActivate(selectedAccounts.length === 0, selectedAccounts.length === 0 ? [] : accounts
                        .filter(acc => selectedAccounts.includes(acc.id))
                        .map(acc => acc.name || acc.email.split('@')[0]));
                    }}>
                      重新激活
                    </Button>
                  </Space>
                )}
              </Space>
            </div>
          </Card>
        </div>
      );
    }

    // 加载中视图
    if (view === 'loading') {
      return (
        <div className="loading-section" style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>正在处理激活请求...</Text>
          </div>
        </div>
      );
    }

    // 成功摘要视图
    if (view === 'success_summary') {
      return (
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
                    value={results.filter(r => r.status === 'success').length} 
                    prefix={<CheckCircleOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="激活失败" 
                    value={results.filter(r => r.status === 'error').length} 
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
      );
    }

    // 账户列表视图（默认视图）
    return (
      <div>
        {/* 筛选区域 */}
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
            <Col span={5}>
              <Select
                placeholder="选择邀请码"
                value={inviteCodeFilter || undefined}
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
            <Col span={5}>
              <Select
                placeholder="激活状态"
                value={activationStatusFilter || undefined}
                onChange={setActivationStatusFilter}
                style={{ width: '100%' }}
                allowClear
              >
                <Option value="unactivated">
                  <Tag color="default" icon={<ClockCircleOutlined />}>未激活</Tag>
                </Option>
                <Option value="activated">
                  <Tag color="success" icon={<CheckCircleOutlined />}>已激活</Tag>
                </Option>
                <Option value="once">
                  <Tag color="blue">激活1次</Tag>
                </Option>
                <Option value="multiple">
                  <Tag color="purple">激活多次</Tag>
                </Option>
              </Select>
            </Col>
            <Col span={4}>
              <Input
                placeholder="搜索邮箱或名称"
                value={emailFilter}
                onChange={e => setEmailFilter(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={10}>
              <Row justify="end">
                <Space>
                  <Button 
                    icon={<ClearOutlined />}
                    onClick={clearFilters}
                    disabled={!inviteCodeFilter && !emailFilter && !activationStatusFilter}
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
                    {useSequential ? '顺序激活筛选结果' : '激活筛选结果'} ({filteredAccounts.length})
                  </Button>
                </Space>
              </Row>
            </Col>
          </Row>
        </div>
        
        {/* 激活状态统计 */}
        {accounts.length > 0 && (
          <div className="stats-section" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Card size="small">
                  <Statistic 
                    title="总账号数" 
                    value={stats.total} 
                    prefix={<UserOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic 
                    title="未激活" 
                    value={stats.unactivated} 
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic 
                    title="已激活" 
                    value={stats.activated} 
                    prefix={<CheckCircleOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic 
                    title="总激活次数" 
                    value={stats.totalActivations} 
                    prefix={<RocketOutlined />}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* 账户列表视图 */} 
        <div className="accounts-section">
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredAccounts}
            rowKey="id"
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
      </div>
    );
  };

  return (
    <div className="activate-container">
      <Card bordered={false} className="full-height-card">
        {/* 顶部区域：标题和激活说明 */}
        <div style={{ marginBottom: 20 }}>
          <Row gutter={16} align="middle">
            <Col span={24}>
              <Alert
                message="PikPak 账号激活"
                description={
                  <span>
                    请输入激活密钥并选择激活模式，密钥可在 <a href="https://kiteyuan.info" target="_blank" rel="noopener noreferrer">纸鸢佬的导航</a> 获取。
                    批量模式将同时激活所有账号，顺序模式将逐个激活并显示进度。
                  </span>
                }
                type="info"
                showIcon
              />
            </Col>
          </Row>
        </div>

        {/* 激活控制区域 */}
        <div style={{ marginBottom: 20, background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
          <Row gutter={16} align="middle">
            <Col span={12}>
              <Input
                placeholder="输入激活密钥"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                style={{ width: '100%' }}
                size="large"
              />
            </Col>
            <Col span={12}>
              <Row justify="end">
                <Space>
                  <Tooltip title={useSequential ? "顺序激活模式" : "批量激活模式"}>
                    <Switch
                      checkedChildren="顺序"
                      unCheckedChildren="批量"
                      checked={useSequential}
                      onChange={(checked) => setUseSequential(checked)}
                    />
                  </Tooltip>
                  {useSequential && (
                    <Tooltip title="激活设置">
                      <Button 
                        type="text" 
                        icon={<SettingOutlined />} 
                        onClick={showSequentialSettingsModal}
                      />
                    </Tooltip>
                  )}
                  <Button 
                    type="primary" 
                    icon={<RocketOutlined />}
                    onClick={handleActivateSelected} 
                    loading={loading}
                    disabled={selectedAccounts.length === 0 || view !== 'accounts'}
                  >
                    激活选定 ({selectedAccounts.length})
                  </Button>
                  <Button 
                    onClick={handleActivateAll} 
                    loading={loading}
                    disabled={view !== 'accounts'}
                  >
                    激活全部
                  </Button>
                </Space>
              </Row>
            </Col>
          </Row>
        </div>

        <Modal
          title="顺序激活设置"
          open={showSequentialSettings}
          onOk={closeSequentialSettingsModal}
          onCancel={closeSequentialSettingsModal}
        >
          <div style={{ marginBottom: '16px' }}>
            <p>设置账号激活间隔时间（秒）：</p>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ marginBottom: '8px' }}>最小延迟：</div>
                <InputNumber
                  min={1}
                  max={60}
                  value={minDelay}
                  onChange={(value) => setMinDelay(value || 10)}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: '8px' }}>最大延迟：</div>
                <InputNumber
                  min={1}
                  max={120}
                  value={maxDelay}
                  onChange={(value) => setMaxDelay(value || 30)}
                  style={{ width: '100%' }}
                />
              </Col>
            </Row>
            <Divider />
            <p>每次激活后将随机等待上述时间范围内的秒数再激活下一个账号，可有效防止频繁请求导致的封禁。</p>
          </div>
        </Modal>

        {renderContent()}
      </Card>
    </div>
  );
};

export default Activate; 