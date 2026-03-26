import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await login(values.email);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400, textAlign: 'center' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <SafetyCertificateOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Title level={3} style={{ marginTop: 16 }}>
              Pro-curo Licence Server
            </Title>
            <Text type="secondary">Admin Portal — Development Login</Text>
          </div>

          {error && <Alert type="error" message={error} showIcon />}

          <Form onFinish={onFinish} layout="vertical">
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email address' },
              ]}
            >
              <Input
                size="large"
                placeholder="Admin email (e.g. dev@pro-curo.com)"
                autoFocus
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Development mode — enter the email of a seeded admin user.
            <br />
            Production will use Azure AD SSO.
          </Text>
        </Space>
      </Card>
    </div>
  );
}
