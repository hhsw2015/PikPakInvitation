import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, message, Space, Typography, Card, Divider, Alert } from 'antd';
import { UserOutlined, KeyOutlined, SwapOutlined, PlusOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface SessionManagerProps {
  visible: boolean;
  onClose: () => void;
  onSessionChange: (sessionId: string, isAdmin: boolean) => void;
  currentSessionId?: string;
  isAdmin?: boolean;
}

const SessionManager: React.FC<SessionManagerProps> = ({
  visible,
  onClose,
  onSessionChange,
  currentSessionId,
  isAdmin
}) => {
  const [sessionId, setSessionId] = useState('');
  const [sessionLength, setSessionLength] = useState(12);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && currentSessionId) {
      setSessionId(currentSessionId);
    }
  }, [visible, currentSessionId]);

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
        setSessionId(data.session_id);
        message.success('会话ID生成成功');
      } else {
        message.error(data.message || '生成会话ID失败');
      }
    } catch (error) {
      message.error('生成会话ID失败');
    } finally {
      setLoading(false);
    }
  };

  const validateAndSwitchSession = async () => {
    if (!sessionId.trim()) {
      message.error('请输入会话ID');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/session/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId.trim() }),
      });

      const data = await response.json();
      if (data.status === 'success' && data.is_valid) {
        // 保存到localStorage
        localStorage.setItem('session_id', sessionId.trim());
        
        // 通知父组件会话已切换
        onSessionChange(sessionId.trim(), data.is_admin);
        
        message.success(`会话切换成功${data.is_admin ? ' (管理员模式)' : ''}`);
        onClose();
      } else {
        message.error(data.message || '会话ID无效');
      }
    } catch (error) {
      message.error('验证会话ID失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSessionId(currentSessionId || '');
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          <span>会话管理</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={500}
      destroyOnClose
    >
      <div style={{ padding: '16px 0' }}>
        {/* 当前会话信息 */}
        {currentSessionId && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>当前会话</Text>
              <Space>
                <KeyOutlined />
                <Text code>{currentSessionId}</Text>
                {isAdmin && <Text type="success">(管理员)</Text>}
              </Space>
            </Space>
          </Card>
        )}

        <Alert
          message="会话隔离说明"
          description="每个会话ID只能查看和管理自己创建的账号，会话ID长度为6-20位字母数字组合。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* 会话ID输入 */}
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={5}>
            <SwapOutlined /> 切换会话
          </Title>
          
          <Input
            placeholder="输入会话ID (6-20位字母数字)"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            maxLength={20}
            prefix={<KeyOutlined />}
            onPressEnter={validateAndSwitchSession}
          />

          <Button
            type="primary"
            onClick={validateAndSwitchSession}
            loading={loading}
            block
            icon={<SwapOutlined />}
          >
            切换到此会话
          </Button>
        </Space>

        <Divider />

        {/* 生成新会话 */}
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={5}>
            <PlusOutlined /> 创建新会话
          </Title>
          
          <Text strong>自动生成:</Text>
          <Space style={{ width: '100%' }}>
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
            onClick={generateSessionId}
            loading={loading}
            block
            icon={<PlusOutlined />}
          >
            生成随机会话ID
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default SessionManager; 