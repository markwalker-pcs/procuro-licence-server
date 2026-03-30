import React, { useEffect, useState } from 'react';
import { Typography, Table, Tag, Card, message } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';
import api from '../services/api';
import type { Instance } from '../types';

const { Title, Text } = Typography;

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInstances = async () => {
      try {
        const res = await api.get('/admin/instances');
        setInstances(res.data.data);
      } catch {
        message.error('Failed to load instances');
      } finally {
        setLoading(false);
      }
    };
    fetchInstances();
  }, []);

  const getCheckInStatus = (lastCheckIn: string | null) => {
    if (!lastCheckIn) return { tag: <Tag>Never</Tag>, sortValue: 0 };
    const diff = Date.now() - new Date(lastCheckIn).getTime();
    const days = diff / (24 * 60 * 60 * 1000);
    if (days <= 1) return { tag: <Tag icon={<CheckCircleOutlined />} color="success">Online</Tag>, sortValue: 3 };
    if (days <= 7) return { tag: <Tag icon={<CheckCircleOutlined />} color="blue">Recent</Tag>, sortValue: 2 };
    if (days <= 30) return { tag: <Tag icon={<WarningOutlined />} color="warning">Offline {Math.floor(days)}d</Tag>, sortValue: 1 };
    return { tag: <Tag icon={<CloseCircleOutlined />} color="error">Offline {Math.floor(days)}d</Tag>, sortValue: 0 };
  };

  const columns = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_: unknown, r: Instance) => r.licence?.customer?.name ?? '—',
    },
    {
      title: 'Instance UUID',
      dataIndex: 'instanceUuid',
      key: 'instanceUuid',
      ellipsis: true,
      render: (v: string) => <Text copyable={{ text: v }}>{v.substring(0, 8)}...</Text>,
    },
    {
      title: 'Deployment',
      key: 'deployment',
      render: (_: unknown, r: Instance) => r.deployment?.deploymentLabel ?? <Text type="secondary">Not linked</Text>,
    },
    { title: 'Software Version', dataIndex: 'softwareVersion', key: 'softwareVersion' },
    { title: 'Active Users', dataIndex: 'activeUsers', key: 'activeUsers' },
    {
      title: 'Licensed Users',
      key: 'licensedUsers',
      render: (_: unknown, r: Instance) => r.licence?.licensedUsers ?? '—',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, r: Instance) => getCheckInStatus(r.lastCheckIn).tag,
    },
    {
      title: 'Last Check-In',
      dataIndex: 'lastCheckIn',
      key: 'lastCheckIn',
      render: (v: string | null) => v ? new Date(v).toLocaleString('en-GB') : 'Never',
      sorter: (a: Instance, b: Instance) =>
        new Date(a.lastCheckIn ?? 0).getTime() - new Date(b.lastCheckIn ?? 0).getTime(),
    },
    { title: 'IP Address', dataIndex: 'ipAddress', key: 'ipAddress' },
  ];

  return (
    <div>
      <Title level={4}>Instances</Title>
      <Card>
        <Table
          dataSource={instances}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </div>
  );
}
