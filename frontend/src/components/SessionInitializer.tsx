import React, { useState } from 'react';
import { Modal, Input, Button, message, Space, Typography, Card, Alert, Tabs } from 'antd';
import { UserOutlined, KeyOutlined, PlusOutlined, LoginOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

interface SessionInitializerProps {
  visible: boolean;
  onSessionCreated: (sessionId: string, isAdmin: boolean) => void;
}

const SessionInitializer: React.FC<SessionInitializerProps> = ({
  visible,
  onSessionCreated
}) => {
  const [activeTab, setActiveTab] = useState('create');
  const [customSessionId, setCustomSessionId] = useState(''); // 用于自定义会话ID
  const [existingSessionId, setExistingSessionId] = useState(''); // 用于现有会话ID
  const [sessionLength, setSessionLength] = useState(12);
  const [loading, setLoading] = useState(false);

  const generateSessionId = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/session/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ length: sessionLength }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        const newSessionId = data.session_id;
        
        // 保存到localStorage
        localStorage.setItem('session_id', newSessionId);
        
        message.success('会话创建成功！');
        onSessionCreated(newSessionId, false);
      } else {
        message.error(data.message || '创建会话失败');
      }
    } catch (error) {
      message.error('创建会话失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建自定义会话ID
  const createCustomSession = async () => {
    if (!customSessionId.trim()) {
      message.error('请输入会话ID');
      return;
    }

    const trimmedSessionId = customSessionId.trim();
    
    // 验证会话ID格式
    if (trimmedSessionId.length < 6 || trimmedSessionId.length > 20) {
      message.error('会话ID长度必须在6-20位之间');
      return;
    }
    
    if (!/^[a-zA-Z0-9]+$/.test(trimmedSessionId)) {
      message.error('会话ID只能包含字母和数字');
      return;
    }

    setLoading(true);
    try {
      // 直接创建自定义会话ID
      const response = await fetch('/api/session/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ custom_id: trimmedSessionId }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        localStorage.setItem('session_id', trimmedSessionId);
        message.success('自定义会话创建成功！');
        onSessionCreated(trimmedSessionId, false);
      } else {
        message.error(data.message || '创建自定义会话失败');
      }
    } catch (error) {
      message.error('创建自定义会话失败');
    } finally {
      setLoading(false);
    }
  };

  // 验证现有会话ID
  const validateExistingSession = async () => {
    if (!existingSessionId.trim()) {
      message.error('请输入会话ID');
      return;
    }

    const trimmedSessionId = existingSessionId.trim();
    
    // 验证会话ID格式
    if (trimmedSessionId.length < 6 || trimmedSessionId.length > 20) {
      message.error('会话ID长度必须在6-20位之间');
      return;
    }
    
    if (!/^[a-zA-Z0-9]+$/.test(trimmedSessionId)) {
      message.error('会话ID只能包含字母和数字');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/session/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: trimmedSessionId }),
      });

      const data = await response.json();
      if (data.status === 'success' && data.is_valid) {
        // 保存到localStorage
        localStorage.setItem('session_id', trimmedSessionId);
        
        message.success(`会话验证成功${data.is_admin ? ' (管理员模式)' : ''}！`);
        onSessionCreated(trimmedSessionId, data.is_admin);
      } else {
        message.error(data.message || '会话ID无效');
      }
    } catch (error) {
      message.error('验证会话ID失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          <span>欢迎使用 PikPak 自动邀请系统</span>
        </Space>
      }
      open={visible}
      closable={false}
      maskClosable={false}
      footer={null}
      width={600}
    >
      <div style={{ padding: '16px 0' }}>
        <Alert
          message="首次使用需要创建会话"
          description="为了保护您的数据隐私，系统采用会话隔离机制。每个会话只能查看和管理自己创建的账号。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane
            tab={
              <Space>
                <PlusOutlined />
                创建新会话
              </Space>
            }
            key="create"
          >
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Title level={4}>创建新会话</Title>
                <Paragraph type="secondary">
                  您可以自定义会话ID或让系统为您生成一个唯一的会话ID。
                </Paragraph>

                {/* 自定义会话ID输入 */}
                <div>
                  <Text strong>自定义会话ID:</Text>
                  <Input
                    placeholder="输入6-20位字母数字组合的会话ID"
                    value={customSessionId}
                    onChange={(e) => setCustomSessionId(e.target.value)}
                    maxLength={20}
                    prefix={<KeyOutlined />}
                    style={{ marginTop: 8 }}
                    onPressEnter={() => {
                      if (customSessionId.trim()) {
                        createCustomSession();
                      }
                    }}
                  />
                  {customSessionId && (
                    <Button
                      type="primary"
                      size="large"
                      onClick={createCustomSession}
                      loading={loading}
                      block
                      icon={<LoginOutlined />}
                      style={{ marginTop: 8 }}
                    >
                      创建此会话ID
                    </Button>
                  )}
                </div>

                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <Text type="secondary">或者</Text>
                </div>

                {/* 自动生成会话ID */}
                <div>
                  <Text strong>自动生成会话ID:</Text>
                  <Space style={{ width: '100%', marginTop: 8 }}>
                    <Text>长度:</Text>
                    <Input
                      type="number"
                      min={6}
                      max={20}
                      value={sessionLength}
                      onChange={(e) => setSessionLength(Number(e.target.value))}
                      style={{ width: 80 }}
                    />
                    <Text type="secondary">位</Text>
                  </Space>

                  <Button
                    size="large"
                    onClick={generateSessionId}
                    loading={loading}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 8 }}
                  >
                    生成随机会话ID
                  </Button>
                </div>
              </Space>
            </Card>
          </TabPane>

          <TabPane
            tab={
              <Space>
                <LoginOutlined />
                使用现有会话
              </Space>
            }
            key="existing"
          >
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Title level={4}>使用现有会话</Title>
                <Paragraph type="secondary">
                  如果您已经有会话ID，请在下方输入以继续使用。
                </Paragraph>

                <Input
                  placeholder="输入您的会话ID"
                  value={existingSessionId}
                  onChange={(e) => setExistingSessionId(e.target.value)}
                  maxLength={20}
                  prefix={<KeyOutlined />}
                  size="large"
                  onPressEnter={validateExistingSession}
                />

                <Button
                  type="primary"
                  size="large"
                  onClick={validateExistingSession}
                  loading={loading}
                  block
                  icon={<LoginOutlined />}
                >
                  验证并进入
                </Button>
              </Space>
            </Card>
          </TabPane>
        </Tabs>

        <Alert
          message="重要提醒"
          description={
            <div>
              <p>• 会话ID是您访问数据的唯一凭证，请务必保存好</p>
              <p>• 如果丢失会话ID，将无法访问之前创建的账号数据</p>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginTop: 24 }}
        />
      </div>
    </Modal>
  );
};

export default SessionInitializer; 