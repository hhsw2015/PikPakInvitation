import React, { useState, useEffect, useRef } from 'react';
import { 
  Table, 
  Card, 
  Button, 
  Space, 
  Modal, 
  message, 
  Tooltip, 
  Badge, 
  Typography, 
  Tag,
  Drawer,
  Descriptions,
  Spin,
  Alert,
  Input,
  InputRef
} from 'antd';
import { 
  ReloadOutlined, 
  KeyOutlined,
  TeamOutlined,
  CrownOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { fetchAccounts, getAccountVipInfo, getAccountInviteCode, getAccountInviteList } from '../../services/api';

const { Text, Title } = Typography;

const AccountManager: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [vipModalVisible, setVipModalVisible] = useState<boolean>(false);
  const [inviteCodeModalVisible, setInviteCodeModalVisible] = useState<boolean>(false);
  const [inviteListDrawerVisible, setInviteListDrawerVisible] = useState<boolean>(false);
  const [currentAccount, setCurrentAccount] = useState<any>(null);
  const [vipInfo, setVipInfo] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteList, setInviteList] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [inviteListLoading, setInviteListLoading] = useState<boolean>(false);
  const [inviteListError, setInviteListError] = useState<string | null>(null);
  const [_, setInviteListInfo] = useState<any>(null);
  const [searchText, setSearchText] = useState<string>('');
  const searchInputRef = useRef<InputRef>(null);

  // 加载账号列表
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const response = await fetchAccounts();
      if (response.data.status === 'success') {
        const accountData = response.data.accounts || [];
        setAccounts(accountData);
        setFilteredAccounts(accountData);
      } else {
        message.error(response.data.message || '获取账号列表失败');
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
      message.error('获取账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadAccounts();
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (searchText) {
      const filtered = accounts.filter(account => 
        account.email.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredAccounts(filtered);
    } else {
      setFilteredAccounts(accounts);
    }
  }, [searchText, accounts]);

  // 查询VIP信息
  const handleViewVipInfo = async (account: any) => {
    setCurrentAccount(account);
    setVipInfo(null);
    setVipModalVisible(true);
    setActionLoading(true);
    
    try {
      const response = await getAccountVipInfo(account);
      if (response.data.status === 'success') {
        setVipInfo(response.data.data);
      } else {
        message.error(response.data.message || '获取VIP信息失败');
      }
    } catch (error) {
      console.error('获取VIP信息失败:', error);
      message.error('获取VIP信息失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 查看邀请码
  const handleViewInviteCode = async (account: any) => {
    setCurrentAccount(account);
    setInviteCode('');
    setInviteCodeModalVisible(true);
    setActionLoading(true);
    
    try {
      const response = await getAccountInviteCode(account);
      if (response.data.status === 'success') {
        setInviteCode(response.data.data.code || '');
      } else {
        message.error(response.data.message || '获取邀请码失败');
      }
    } catch (error) {
      console.error('获取邀请码失败:', error);
      message.error('获取邀请码失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 查看邀请记录
  const handleViewInviteList = async (account: any) => {
    setCurrentAccount(account);
    setInviteList([]);
    setInviteListInfo(null);
    setInviteListDrawerVisible(true);
    setActionLoading(true);
    setInviteListLoading(true);
    setInviteListError(null);
    
    try {
      const response = await getAccountInviteList(account);
      
      if (response.data.status === 'success') {
        const inviteData = response.data.data?.data || [];
        
        // 直接设置两个state
        setInviteList(inviteData);
        setInviteListInfo(response.data.data ? response.data : { data: { data: inviteData } });
        
        if (inviteData.length === 0) {
          message.info('暂无邀请记录');
        }
      } else {
        const errorMsg = response.data.message || '获取邀请记录失败';
        message.error(errorMsg);
        setInviteListError(errorMsg);
      }
    } catch (error) {
      console.error('获取邀请记录失败:', error);
      message.error('获取邀请记录失败');
      setInviteListError('获取邀请记录失败');
    } finally {
      setActionLoading(false);
      setInviteListLoading(false);
    }
  };

  // 复制邀请码到剪贴板
  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode)
        .then(() => message.success('邀请码已复制到剪贴板'))
        .catch(() => message.error('复制失败，请手动复制'));
    }
  };

  // 邀请记录抽屉内容
  const renderInviteList = () => {
    if (inviteListLoading) {
      return <Spin tip="加载中..." />;
    }

    if (inviteListError) {
      return <Alert message="加载失败" description={inviteListError} type="error" />;
    }

    // 数据为空时显示提示
    if (!inviteList || inviteList.length === 0) {
      return <Alert message="暂无邀请记录" type="info" />;
    }

    // 简化列定义，只保留最基本的列
    const columns = [
      {
        title: '邮箱',
        dataIndex: 'invited_user',
        key: 'invited_user',
      },
      {
        title: '邀请时间',
        dataIndex: 'time',
        key: 'time',
        render: (time: string) => time ? new Date(time).toLocaleString() : '-'
      },
      {
        title: '奖励天数',
        dataIndex: 'reward_days',
        key: 'reward_days'
      },
      {
        title: '状态',
        dataIndex: 'order_status',
        key: 'order_status',
        render: (status: string, record: any) => (
          <Tag color={status === 'present' ? 'green' : (record.delay ? 'orange' : 'blue')}>
            {status === 'present' ? '已生效' : (record.delay ? '延迟中' : status)}
          </Tag>
        )
      },
      {
        title: '激活状态',
        dataIndex: 'activation_status',
        key: 'activation_status',
        render: (status: number) => (
          <Badge 
            status={status > 0 ? "success" : "default"} 
            text={status > 0 ? `已激活(${status}次)` : "未激活"} 
          />
        )
      }
    ];

    // 添加调试信息
    return (
      <>
        <div style={{ marginBottom: '10px' }}>
          <Alert 
            message={`找到 ${inviteList.length} 条邀请记录`} 
            type="info" 
            showIcon 
          />
        </div>
        
        <Table 
          dataSource={inviteList} 
          columns={columns} 
          rowKey="invited_user_id"
          pagination={{ pageSize: 10 }}
          bordered
        />
      </>
    );
  };

  // 表格列定义
  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => <Text ellipsis={{tooltip: text}}>{text}</Text>,
      filterDropdown: () => (
        <div style={{ padding: 8 }}>
          <Input
            ref={searchInputRef}
            placeholder="搜索邮箱"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={() => searchInputRef.current?.blur()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => searchInputRef.current?.blur()}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90 }}
            >
              搜索
            </Button>
            <Button
              onClick={() => {
                setSearchText('');
              }}
              size="small"
              style={{ width: 90 }}
            >
              重置
            </Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a: any, b: any) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      },
      render: (time: string) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: '激活次数',
      dataIndex: 'activation_status',
      key: 'activation_status',
      sorter: (a: any, b: any) => (a.activation_status || 0) - (b.activation_status || 0),
      defaultSortOrder: 'descend' as const,
      render: (status: number) => status > 0 ? status : 0
    },
    {
      title: '最后激活时间',
      dataIndex: 'last_activation_time',
      key: 'last_activation_time',
      sorter: (a: any, b: any) => {
        const timeA = a.last_activation_time ? new Date(a.last_activation_time).getTime() : 0;
        const timeB = b.last_activation_time ? new Date(b.last_activation_time).getTime() : 0;
        return timeA - timeB;
      },
      render: (time: string) => time ? new Date(time).toLocaleString() : '未激活'
    },
    {
      title: '状态',
      dataIndex: 'activation_status',
      key: 'status',
      render: (status: number) => (
        <Badge 
          status={status > 0 ? "success" : "default"} 
          text={status > 0 ? `已激活` : "未激活"} 
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="small">
          <Tooltip title="查询VIP信息">
            <Button 
              icon={<CrownOutlined />} 
              size="small" 
              onClick={() => handleViewVipInfo(record)} 
            />
          </Tooltip>
          <Tooltip title="查看邀请码">
            <Button 
              icon={<KeyOutlined />} 
              size="small" 
              onClick={() => handleViewInviteCode(record)} 
            />
          </Tooltip>
          <Tooltip title="查看邀请记录">
            <Button 
              icon={<TeamOutlined />} 
              size="small" 
              onClick={() => handleViewInviteList(record)} 
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <Card 
        title="账号信息"
        extra={
          <Space>
            <Input
              placeholder="搜索邮箱"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
              prefix={<SearchOutlined />}
            />
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={loadAccounts}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Table 
          dataSource={filteredAccounts} 
          columns={columns} 
          rowKey="id"
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            locale: { items_per_page: '条/页' }
          }}
          locale={{
            filterReset: '重置',
            filterConfirm: '确定',
            emptyText: searchText ? '没有找到匹配的数据' : '暂无数据'
          }}
          size="middle"
          bordered
          scroll={{ x: 'max-content' }}
          sortDirections={['ascend', 'descend']}
          showSorterTooltip={true}
        />
      </Card>

      {/* VIP信息弹窗 */}
      <Modal
        title={<><CrownOutlined /> VIP信息</>}
        open={vipModalVisible}
        onCancel={() => setVipModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setVipModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {actionLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin />
            <div style={{ marginTop: '10px' }}>加载中...</div>
          </div>
        ) : (
          vipInfo ? (
            <Descriptions bordered column={1}>
              <Descriptions.Item label="账号">
                {currentAccount?.email}
              </Descriptions.Item>
              <Descriptions.Item label="VIP状态">
                {vipInfo.data?.status === 'ok' ? (
                  <Tag color="green">有效</Tag>
                ) : (
                  <Tag color="red">无效</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="会员类型">
                {vipInfo.data?.type === 'platinum' ? '白金会员' : 
                 vipInfo.data?.type === 'gold' ? '黄金会员' : 
                 vipInfo.data?.type === 'novip' ? '非会员' : vipInfo.data?.type}
              </Descriptions.Item>
              {vipInfo.data?.expire && (
                <Descriptions.Item label="到期时间">
                  {new Date(vipInfo.data.expire).toLocaleString()}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Alert type="warning" message="获取VIP信息失败，请重试" />
          )
        )}
      </Modal>

      {/* 邀请码弹窗 */}
      <Modal
        title={<><KeyOutlined /> 邀请码</>}
        open={inviteCodeModalVisible}
        onCancel={() => setInviteCodeModalVisible(false)}
        footer={[
          <Button key="copy" type="primary" onClick={copyInviteCode} disabled={!inviteCode}>
            复制邀请码
          </Button>,
          <Button key="close" onClick={() => setInviteCodeModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {actionLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin />
            <div style={{ marginTop: '10px' }}>加载中...</div>
          </div>
        ) : (
          inviteCode ? (
            <div style={{ textAlign: 'center' }}>
              <Title level={2}>{inviteCode}</Title>
              <Text type="secondary">这是账号 {currentAccount?.email} 的邀请码</Text>
            </div>
          ) : (
            <Alert type="warning" message="获取邀请码失败，请重试" />
          )
        )}
      </Modal>

      {/* 邀请记录抽屉 */}
      <Drawer
        title={<><TeamOutlined /> 邀请记录</>}
        width={720}
        open={inviteListDrawerVisible}
        onClose={() => setInviteListDrawerVisible(false)}
        extra={
          <Button 
            type="primary" 
            onClick={() => handleViewInviteList(currentAccount)}
            loading={actionLoading}
            icon={<ReloadOutlined />}
          >
            刷新
          </Button>
        }
      >
        {renderInviteList()}
      </Drawer>
    </div>
  );
};

export default AccountManager; 