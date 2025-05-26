import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  message,
  Modal,
  Space,
  Tag,
  Popconfirm,
  Typography,
  Alert,
  Tooltip,
  Progress
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { HttpClient } from '../../utils/httpClient';
import './index.css';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface ProxyInfo {
  id: number;
  proxy_url: string;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  is_active: boolean;
  last_checked?: string;
  response_time?: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

const ProxyPool: React.FC = () => {
  const [proxies, setProxies] = useState<ProxyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [batchAddModalVisible, setBatchAddModalVisible] = useState(false);
  const [newProxyUrl, setNewProxyUrl] = useState('');
  const [batchProxyUrls, setBatchProxyUrls] = useState('');
  const [testingAll, setTestingAll] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [testingProxies, setTestingProxies] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchProxies();
  }, []);

  const fetchProxies = async () => {
    setLoading(true);
    try {
      const response = await HttpClient.get('/api/proxy/list');
      const data = await response.json();
      
      if (data.status === 'success') {
        setProxies(data.proxies);
      } else {
        message.error(data.message || '获取代理列表失败');
      }
    } catch (error) {
      message.error('获取代理列表失败');
    } finally {
      setLoading(false);
    }
  };

  const addProxy = async () => {
    if (!newProxyUrl.trim()) {
      message.error('请输入代理URL');
      return;
    }

    try {
      const response = await HttpClient.post('/api/proxy/add', {
        proxy_url: newProxyUrl.trim()
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        message.success('代理添加成功');
        setNewProxyUrl('');
        setAddModalVisible(false);
        fetchProxies();
      } else {
        message.error(data.message || '添加代理失败');
      }
    } catch (error) {
      message.error('添加代理失败');
    }
  };

  const batchAddProxies = async () => {
    const urls = batchProxyUrls.split('\n').filter(url => url.trim());
    if (urls.length === 0) {
      message.error('请输入代理URL');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const url of urls) {
      try {
        const response = await HttpClient.post('/api/proxy/add', {
          proxy_url: url.trim()
        });
        const data = await response.json();
        
        if (data.status === 'success') {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
      }
    }

    message.success(`批量添加完成: 成功 ${successCount} 个，失败 ${failCount} 个`);
    setBatchProxyUrls('');
    setBatchAddModalVisible(false);
    fetchProxies();
  };

  const removeProxy = async (proxyId: number) => {
    try {
      const response = await HttpClient.post('/api/proxy/remove', {
        proxy_id: proxyId
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        message.success('代理删除成功');
        fetchProxies();
      } else {
        message.error(data.message || '删除代理失败');
      }
    } catch (error) {
      message.error('删除代理失败');
    }
  };

  const testProxy = async (proxyId: number, proxyUrl: string) => {
    // 添加到测试中的代理集合
    setTestingProxies(prev => new Set(prev).add(proxyId));
    
    try {
      const response = await HttpClient.post('/api/proxy/test', {
        proxy_url: proxyUrl
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        const result = data.test_result;
        if (result.success) {
          message.success(`代理测试成功，响应时间: ${result.response_time?.toFixed(2)}s`);
        } else {
          message.error(`代理测试失败: ${result.error}`);
        }
        fetchProxies(); // 刷新列表以显示最新状态
      } else {
        message.error(data.message || '测试代理失败');
      }
    } catch (error) {
      message.error('测试代理失败');
    } finally {
      // 从测试中的代理集合中移除
      setTestingProxies(prev => {
        const newSet = new Set(prev);
        newSet.delete(proxyId);
        return newSet;
      });
    }
  };

  const testAllProxies = async () => {
    setTestingAll(true);
    setTestProgress(0);
    
    try {
      const response = await HttpClient.post('/api/proxy/test-all');
      const data = await response.json();
      
      if (data.status === 'success') {
        const results = data.results;
        message.success(`批量测试完成: ${results.success}/${results.total} 成功`);
        fetchProxies();
      } else {
        message.error(data.message || '批量测试失败');
      }
    } catch (error) {
      message.error('批量测试失败');
    } finally {
      setTestingAll(false);
      setTestProgress(0);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '代理地址',
      dataIndex: 'proxy_url',
      key: 'proxy_url',
      ellipsis: true,
      render: (text: string, record: ProxyInfo) => (
        <Tooltip title={text}>
          <Text code style={{ fontSize: '12px' }}>
            {text.length > 40 ? `${text.substring(0, 40)}...` : text}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 80,
      render: (protocol: string) => (
        <Tag color={protocol === 'https' ? 'green' : protocol === 'http' ? 'blue' : 'orange'}>
          {protocol.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'} icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {isActive ? '活跃' : '不活跃'}
        </Tag>
      ),
    },
    {
      title: '响应时间',
      dataIndex: 'response_time',
      key: 'response_time',
      width: 100,
      render: (time: number) => (
        time ? (
          <Text type={time < 2 ? 'success' : time < 5 ? 'warning' : 'danger'}>
            {time.toFixed(2)}s
          </Text>
        ) : '-'
      ),
    },
    {
      title: '成功/失败',
      key: 'stats',
      width: 100,
      render: (record: ProxyInfo) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px', color: '#52c41a' }}>成功: {record.success_count}</Text>
          <Text style={{ fontSize: '12px', color: '#ff4d4f' }}>失败: {record.fail_count}</Text>
        </Space>
      ),
    },
    {
      title: '最后检查',
      dataIndex: 'last_checked',
      key: 'last_checked',
      width: 120,
      render: (time: string) => (
        time ? (
          <Text style={{ fontSize: '12px' }}>
            {new Date(time).toLocaleString()}
          </Text>
        ) : '-'
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (record: ProxyInfo) => (
        <Space>
          <Button
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => testProxy(record.id, record.proxy_url)}
            loading={testingProxies.has(record.id)}
            title="测试代理"
          />
          <Popconfirm
            title="确定要删除这个代理吗？"
            onConfirm={() => removeProxy(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              title="删除代理"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="proxy-pool-container">
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Title level={3}>代理池管理</Title>
          <Alert
            message="代理池功能说明"
            description="管理员可以添加和管理代理服务器。用户在注册时可以选择使用内置代理池，系统会自动从可用代理中选择。代理格式: 协议://用户名:密码@主机:端口"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setAddModalVisible(true)}
            >
              添加代理
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => setBatchAddModalVisible(true)}
            >
              批量添加
            </Button>
            <Button
              icon={<ExperimentOutlined />}
              onClick={testAllProxies}
              loading={testingAll}
            >
              测试所有代理
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchProxies}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        {testingAll && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={testProgress} status="active" />
            <Text type="secondary">正在测试代理...</Text>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={proxies}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个代理`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* 添加单个代理弹窗 */}
      <Modal
        title="添加代理"
        open={addModalVisible}
        onOk={addProxy}
        onCancel={() => {
          setAddModalVisible(false);
          setNewProxyUrl('');
        }}
        okText="添加"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>代理URL格式示例：</Text>
          <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            <div>• http://127.0.0.1:7890</div>
            <div>• https://user:pass@proxy.example.com:8080</div>
            <div>• socks5://user:pass@proxy.example.com:1080</div>
          </div>
        </div>
        <Input
          placeholder="请输入代理URL"
          value={newProxyUrl}
          onChange={(e) => setNewProxyUrl(e.target.value)}
          onPressEnter={addProxy}
        />
      </Modal>

      {/* 批量添加代理弹窗 */}
      <Modal
        title="批量添加代理"
        open={batchAddModalVisible}
        onOk={batchAddProxies}
        onCancel={() => {
          setBatchAddModalVisible(false);
          setBatchProxyUrls('');
        }}
        okText="批量添加"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>每行一个代理URL：</Text>
        </div>
        <TextArea
          placeholder={`http://127.0.0.1:7890
https://user:pass@proxy1.example.com:8080
socks5://user:pass@proxy2.example.com:1080`}
          value={batchProxyUrls}
          onChange={(e) => setBatchProxyUrls(e.target.value)}
          rows={8}
        />
      </Modal>
    </div>
  );
};

export default ProxyPool; 