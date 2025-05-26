import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Button, Space, Typography } from 'antd';
import { 
  UserAddOutlined, 
  CheckCircleOutlined, 
  HistoryOutlined,
  UserOutlined,
  SwapOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import zhCN from 'antd/lib/locale/zh_CN';
import './App.css';

// 导入页面组件 (needed in MainLayout)
import Register from './pages/Register';
import Activate from './pages/Activate';
import History from './pages/History';
import ProxyPool from './pages/ProxyPool';

// 导入会话管理组件
import SessionManager from './components/SessionManager';
import SessionInitializer from './components/SessionInitializer';

const { Sider, Content } = Layout;
const { Text } = Typography;

// Define the new MainLayout component
const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false); // Move state here
  const [sessionId, setSessionId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [showSessionInitializer, setShowSessionInitializer] = useState(false);
  
  const location = useLocation(); // Move hook call here
  const currentPath = location.pathname;

  // 检查会话状态
  useEffect(() => {
    const checkSession = async () => {
      const storedSessionId = localStorage.getItem('session_id');
      
      if (!storedSessionId) {
        setShowSessionInitializer(true);
        return;
      }

      try {
        const response = await fetch('/api/session/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: storedSessionId }),
        });

        const data = await response.json();
        if (data.status === 'success' && data.is_valid) {
          setSessionId(storedSessionId);
          setIsAdmin(data.is_admin);
        } else {
          localStorage.removeItem('session_id');
          setShowSessionInitializer(true);
        }
      } catch (error) {
        console.error('验证会话失败:', error);
        localStorage.removeItem('session_id');
        setShowSessionInitializer(true);
      }
    };

    checkSession();
  }, []);

  const handleSessionCreated = (newSessionId: string, adminStatus: boolean) => {
    setSessionId(newSessionId);
    setIsAdmin(adminStatus);
    setShowSessionInitializer(false);
  };

  const handleSessionChange = (newSessionId: string, adminStatus: boolean) => {
    setSessionId(newSessionId);
    setIsAdmin(adminStatus);
    // 刷新页面以重新加载数据
    window.location.reload();
  };

  // Move menu items definition here
  const items = [
    {
      key: '/register',
      icon: <UserAddOutlined />,
      label: <Link to="/register">账号注册</Link>,
    },
    {
      key: '/activate',
      icon: <CheckCircleOutlined />,
      label: <Link to="/activate">账号激活</Link>,
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: <Link to="/history">历史账号</Link>,
    },
    // 只有管理员可以看到代理池管理
    ...(isAdmin ? [{
      key: '/proxy-pool',
      icon: <GlobalOutlined />,
      label: <Link to="/proxy-pool">代理池管理</Link>,
    }] : []),
  ];

  // Move the Layout JSX structure here
  return (
    <>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider 
          collapsible 
          collapsed={collapsed} 
          onCollapse={(value) => setCollapsed(value)}
          style={{ 
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 10
          }}
        >
          <div className="sidebar-logo">
            {collapsed ? "P" : "PikPak 自动邀请"} 
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[currentPath]} items={items} />
          
          {/* 会话信息和管理按钮 */}
          {sessionId && (
            <div style={{ 
              position: 'absolute', 
              bottom: collapsed ? 150 : 100, // 进一步向上移动，给折叠按钮留出更多空间
              left: 8, 
              right: 8,
              padding: collapsed ? '4px' : '8px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '6px',
              zIndex: 999, // 降低层级，确保不遮挡折叠按钮
              backdropFilter: 'blur(4px)'
            }}>
              {!collapsed ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Text style={{ 
                    color: '#fff', 
                    fontSize: '11px',
                    display: 'block',
                    textAlign: 'center',
                    wordBreak: 'break-all'
                  }}>
                    会话: {sessionId.length > 12 ? sessionId.substring(0, 12) + '...' : sessionId}
                    {isAdmin && <Text style={{ color: '#52c41a', display: 'block' }}>(管理员)</Text>}
                  </Text>
                  <Button 
                    size="small" 
                    icon={<SwapOutlined />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowSessionManager(true);
                    }}
                    style={{ 
                      width: '100%',
                      pointerEvents: 'auto',
                      fontSize: '11px',
                      height: '24px'
                    }}
                  >
                    切换会话
                  </Button>
                </Space>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ 
                    color: '#fff', 
                    fontSize: '10px',
                    display: 'block',
                    marginBottom: '4px'
                  }}>
                    {sessionId.substring(0, 6)}...
                    {isAdmin && <Text style={{ color: '#52c41a' }}>★</Text>}
                  </Text>
                  <Button 
                    size="small" 
                    icon={<UserOutlined />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowSessionManager(true);
                    }}
                    style={{ 
                      width: '100%',
                      pointerEvents: 'auto',
                      height: '20px',
                      fontSize: '10px'
                    }}
                    title="会话管理"
                  />
                </div>
              )}
            </div>
          )}
        </Sider>
        <Layout style={{ 
          marginLeft: collapsed ? 80 : 200,
          transition: 'margin-left 0.2s'
        }}>
          <Content style={{ margin: '0', width: '100%' }}>
            <div 
              className="site-layout-background" 
              style={{
                padding: 24, 
                minHeight: '100vh',
                background: '#fff', 
                boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
                overflowY: 'auto'
              }}
            >
              {/* Routes are rendered here, inside the Router context */}
              <Routes>
                <Route path="/" element={<Navigate to="/register" replace />} />
                <Route path="/register" element={<Register />} />
                <Route path="/activate" element={<Activate />} />
                <Route path="/history" element={<History />} />
                {isAdmin && <Route path="/proxy-pool" element={<ProxyPool />} />}
              </Routes>
            </div>
          </Content>
        </Layout>
      </Layout>

      {/* 会话管理弹窗 */}
      <SessionManager
        visible={showSessionManager}
        onClose={() => setShowSessionManager(false)}
        onSessionChange={handleSessionChange}
        currentSessionId={sessionId}
        isAdmin={isAdmin}
      />

      {/* 会话初始化弹窗 */}
      <SessionInitializer
        visible={showSessionInitializer}
        onSessionCreated={handleSessionCreated}
      />
    </>
  );
};

// Simplify the App component
function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          colorPrimaryHover: '#6366f1',
          colorPrimaryActive: '#6366f1',
        },
        components: {
          Button: {
            colorPrimaryHover: '#6366f1',
            colorPrimaryActive: '#6366f1',
            algorithm: false, // Disable algorithm to prevent auto-generated hover styles
          }
        }
      }}
    >
      <Router>
        {/* Render MainLayout inside Router */}
        <MainLayout /> 
      </Router>
    </ConfigProvider>
  );
}

export default App;
