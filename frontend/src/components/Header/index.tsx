import React from 'react';
import { Menu, Layout } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import './index.css';

const Header: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const items = [
    {
      key: '/register',
      label: <Link to="/register">账号注册</Link>,
    },
    {
      key: '/activate',
      label: <Link to="/activate">账号激活</Link>,
    },
    {
      key: '/history',
      label: <Link to="/history">历史账号</Link>,
    },
  ];

  return (
    <Layout.Header className="header-layout">
      <div className="logo">
        <Link to="/">PikPak 自动邀请</Link>
      </div>
      <Menu 
        theme="dark" 
        mode="horizontal" 
        selectedKeys={[currentPath]} 
        items={items}
        className="header-menu"
      />
    </Layout.Header>
  );
};

export default Header; 