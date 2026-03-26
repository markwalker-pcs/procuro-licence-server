import React, { useState, useEffect } from 'react';
import { Layout, Menu, Typography, Space, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
  AuditOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/customers', icon: <TeamOutlined />, label: 'Customers' },
  { key: '/licences', icon: <SafetyCertificateOutlined />, label: 'Licences' },
  { key: '/instances', icon: <CloudServerOutlined />, label: 'Instances' },
  { key: '/audit-log', icon: <AuditOutlined />, label: 'Audit Log' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [buildId, setBuildId] = useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // Fetch server build ID
  useEffect(() => {
    api.get('/v1/status')
      .then((res) => setBuildId(res.data.build || ''))
      .catch(() => setBuildId('unknown'));
  }, []);

  const userMenuItems = [
    {
      key: 'role',
      label: <Text type="secondary">{user?.role}</Text>,
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Text strong style={{ color: '#fff', fontSize: collapsed ? 14 : 16 }}>
            {collapsed ? 'PLS' : 'Pro-curo Licence'}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1 }}
        />
        {/* Build number — bottom left of sidebar */}
        <div
          style={{
            position: 'absolute',
            bottom: 48, // Above the collapse trigger
            left: 0,
            right: 0,
            padding: collapsed ? '8px 4px' : '8px 16px',
            textAlign: collapsed ? 'center' : 'left',
          }}
        >
          <Text
            style={{
              color: 'rgba(255, 255, 255, 0.35)',
              fontSize: 10,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            {collapsed ? (buildId ? buildId.split('-')[0] : '—') : (buildId || '—')}
          </Text>
        </div>
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <Text>{user?.displayName}</Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
