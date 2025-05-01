import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { ConfigProvider, Layout, Menu } from 'antd';
import { 
  UserAddOutlined, 
  CheckCircleOutlined, 
  HistoryOutlined 
} from '@ant-design/icons';
import zhCN from 'antd/lib/locale/zh_CN';
import './App.css';

// 导入页面组件 (needed in MainLayout)
import Register from './pages/Register';
import Activate from './pages/Activate';
import History from './pages/History';

const { Sider, Content } = Layout;

// Define the new MainLayout component
const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false); // Move state here
  const location = useLocation(); // Move hook call here
  const currentPath = location.pathname;

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
  ];

  // Move the Layout JSX structure here
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div className="sidebar-logo">
          {collapsed ? "P" : "PikPak 自动邀请"} 
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[currentPath]} items={items} />
      </Sider>
      <Content style={{ margin: '24px 16px 0', width: '100%' }}>
        <div 
          className="site-layout-background" 
          style={{
            padding: 24, 
            minHeight: 'calc(100vh - 48px)',
            background: '#fff', 
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
          }}
        >
          {/* Routes are rendered here, inside the Router context */}
          <Routes>
            <Route path="/" element={<Navigate to="/register" replace />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activate" element={<Activate />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </div>
      </Content>
    </Layout>
  );
};

// Simplify the App component
function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        {/* Render MainLayout inside Router */}
        <MainLayout /> 
      </Router>
    </ConfigProvider>
  );
}

export default App;
