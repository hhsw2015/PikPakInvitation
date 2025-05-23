import React, { useState, useEffect } from 'react';
import { Table, Card, Button, message, Modal, Typography, Tag, Space, Popconfirm } from 'antd';
import { ReloadOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { fetchAccounts as apiFetchAccounts, deleteAccount, deleteAccounts } from '../../services/api';
import './index.css';

const { Text, Paragraph } = Typography;

interface AccountInfo {
  name?: string;
  email?: string;
  password?: string;
  user_id?: string;
  device_id?: string;
  version?: string;
  access_token?: string;
  refresh_token?: string;
  filename: string;
  captcha_token?: string;
  timestamp?: number;
}

const History: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<AccountInfo | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleteVisible, setBatchDeleteVisible] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  // 修改 fetchAccounts 函数以调用 API
  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const response = await apiFetchAccounts(); // Call the imported API function
      if (response.data && response.data.status === 'success') {
        // Map the response to ensure consistency, though AccountInfo is now optional
        const fetchedAccounts = response.data.accounts.map((acc: any) => ({
          ...acc,
          name: acc.name || acc.filename, // Use filename as name if name is missing
        }));
        setAccounts(fetchedAccounts);
        // 清空选择
        setSelectedRowKeys([]);
      } else {
        message.error(response.data.message || '获取账号列表失败');
      }
    } catch (error: any) {
      console.error('获取账号错误:', error);
      message.error(`获取账号列表失败: ${error.message || '未知错误'}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDelete = async (filename: string) => {
    setLoading(true);
    try {
      // 调用删除账号API
      const response = await deleteAccount(filename);

      if (response.data && response.data.status === 'success') {
        // 从状态中移除账号
        setAccounts(prevAccounts => prevAccounts.filter(acc => acc.filename !== filename));
        message.success(response.data.message || '账号已成功删除');
      } else {
        // 显示API返回的错误消息
        message.error(response.data.message || '删除账号失败');
      }
    } catch (error: any) {
      console.error('删除账号错误:', error);
      // 显示捕获到的错误消息
      message.error(`删除账号出错: ${error.message || '未知错误'}`);
    } finally {
      // 确保 loading 状态在所有情况下都设置为 false
      setLoading(false);
    }
  };

  // 批量删除账号
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请至少选择一个账号');
      return;
    }

    setBatchDeleteLoading(true);
    try {
      // 从选中的键中提取文件名
      const filenames = selectedRowKeys.map(key => key.toString());
      
      // 调用批量删除API
      const response = await deleteAccounts(filenames);
      
      if (response.data && (response.data.status === 'success' || response.data.status === 'partial')) {
        // 从状态中移除成功删除的账号
        if (response.data.results && response.data.results.success) {
          const successFilenames = response.data.results.success;
          setAccounts(prevAccounts => 
            prevAccounts.filter(acc => !successFilenames.includes(acc.filename))
          );
        }
        
        // 显示成功消息
        message.success(response.data.message || '账号已成功删除');
        
        // 清空选择
        setSelectedRowKeys([]);
      } else {
        // 显示API返回的错误消息
        message.error(response.data.message || '批量删除账号失败');
      }
    } catch (error: any) {
      console.error('批量删除账号错误:', error);
      message.error(`批量删除账号出错: ${error.message || '未知错误'}`);
    } finally {
      setBatchDeleteLoading(false);
      setBatchDeleteVisible(false); // 关闭确认对话框
    }
  };

  const showAccountDetails = (account: AccountInfo) => {
    setCurrentAccount(account);
    setVisible(true);
  };

  // 表格行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: AccountInfo) => {
        if (record.access_token) {
          return <Tag color="green">已激活</Tag>;
        } else if (record.email) { // Check if email exists as an indicator of more complete info
          return <Tag color="orange">未激活</Tag>;
        } else {
          return <Tag color="default">信息不完整</Tag>; // Indicate incomplete info
        }
      },
    },
    {
      title: '修改日期',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: number) => {
        // 这里需要类型转换
        return (new Date(timestamp*1)).toLocaleString();
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: AccountInfo) => {
        const isIncomplete = !record.email; // Consider incomplete if email is missing
        return (
          <Space size="middle">
            <Button 
              type="text" 
              icon={<InfoCircleOutlined />}
              onClick={() => showAccountDetails(record)}
              disabled={isIncomplete} // Disable if incomplete
            >
              详情
            </Button>
            <Popconfirm
              title="确定要删除此账号吗？"
              onConfirm={() => handleDelete(record.filename)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="history-container">
      <Card 
        title="PikPak 历史账号" 
        className="history-card"
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => setBatchDeleteVisible(true)}
              >
                批量删除 ({selectedRowKeys.length})
              </Button>
            )}
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={fetchAccounts} 
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Table 
          rowSelection={rowSelection}
          columns={columns} 
          dataSource={accounts} 
          rowKey="filename" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 账号详情模态框 */}
      <Modal
        title="账号详情"
        open={visible}
        onCancel={() => setVisible(false)}
        footer={[
          <Button key="close" onClick={() => setVisible(false)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {currentAccount && (
          <div className="account-details">
            <Paragraph>
              <Text strong>名称：</Text> {currentAccount.name || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>邮箱：</Text> {currentAccount.email || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>密码：</Text> {currentAccount.password || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>用户ID：</Text> {currentAccount.user_id || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>设备ID：</Text> {currentAccount.device_id || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>版本：</Text> {currentAccount.version || '未提供'}
            </Paragraph>
            <Paragraph>
              <Text strong>Access Token：</Text>
              <div className="token-container">
                {currentAccount.access_token || '无'}
              </div>
            </Paragraph>
            <Paragraph>
              <Text strong>Refresh Token：</Text>
              <div className="token-container">
                {currentAccount.refresh_token || '无'}
              </div>
            </Paragraph>
            <Paragraph>
              <Text strong>文件名：</Text> {currentAccount.filename}
            </Paragraph>
          </div>
        )}
      </Modal>

      {/* 批量删除确认对话框 */}
      <Modal
        title="确认批量删除"
        open={batchDeleteVisible}
        onCancel={() => setBatchDeleteVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setBatchDeleteVisible(false)}>
            取消
          </Button>,
          <Button 
            key="delete" 
            type="primary" 
            danger 
            loading={batchDeleteLoading}
            onClick={handleBatchDelete}
          >
            删除
          </Button>
        ]}
      >
        <p>确定要删除选中的 {selectedRowKeys.length} 个账号吗？此操作不可撤销。</p>
      </Modal>
    </div>
  );
};

export default History; 
