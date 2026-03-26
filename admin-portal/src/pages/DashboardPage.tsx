import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Table, Tag, Space, Spin, Alert } from 'antd';
import {
  TeamOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import type { DashboardStats, Alert as AlertType } from '../types';

const { Title } = Typography;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<{ offlineInstances: AlertType[]; expiringLicences: AlertType[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, alertsRes] = await Promise.all([
          api.get('/admin/dashboard'),
          api.get('/admin/dashboard/alerts'),
        ]);
        setStats(statsRes.data.data);
        setAlerts(alertsRes.data.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <div>
      <Title level={4}>Dashboard</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Customers"
              value={stats?.totalCustomers}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Active Licences"
              value={stats?.activeLicences}
              suffix={`/ ${stats?.totalLicences}`}
              prefix={<SafetyCertificateOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Instances"
              value={stats?.totalInstances}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Offline Instances (7+ days)"
              value={stats?.offlineInstances}
              prefix={<WarningOutlined />}
              valueStyle={{ color: stats?.offlineInstances ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Expiring Licences (30 days)"
              value={stats?.expiringLicences}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: stats?.expiringLicences ? '#faad14' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Alerts */}
      {alerts && (alerts.offlineInstances.length > 0 || alerts.expiringLicences.length > 0) && (
        <div style={{ marginTop: 24 }}>
          <Title level={5}>Active Alerts</Title>

          {alerts.offlineInstances.length > 0 && (
            <Card title="Offline Instances" size="small" style={{ marginBottom: 16 }}>
              <Table
                dataSource={alerts.offlineInstances}
                rowKey="instanceId"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Customer', dataIndex: 'customer' },
                  { title: 'Instance', dataIndex: 'instanceUuid', ellipsis: true },
                  {
                    title: 'Last Check-In',
                    dataIndex: 'lastCheckIn',
                    render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : 'Never',
                  },
                  {
                    title: 'Severity',
                    dataIndex: 'severity',
                    render: (v: string) => (
                      <Tag color={v === 'critical' ? 'red' : 'orange'}>{v.toUpperCase()}</Tag>
                    ),
                  },
                ]}
              />
            </Card>
          )}

          {alerts.expiringLicences.length > 0 && (
            <Card title="Expiring Licences" size="small">
              <Table
                dataSource={alerts.expiringLicences}
                rowKey="licenceId"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Customer', dataIndex: 'customer' },
                  {
                    title: 'Expiry Date',
                    dataIndex: 'expiryDate',
                    render: (v: string) => new Date(v).toLocaleDateString('en-GB'),
                  },
                  {
                    title: 'Severity',
                    dataIndex: 'severity',
                    render: (v: string) => (
                      <Tag color={v === 'critical' ? 'red' : 'orange'}>{v.toUpperCase()}</Tag>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
