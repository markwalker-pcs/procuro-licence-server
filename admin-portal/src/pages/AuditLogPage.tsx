import React, { useEffect, useState } from 'react';
import { Typography, Table, Card, Tag, Modal, Descriptions, message } from 'antd';
import api from '../services/api';
import type { AuditLogEntry } from '../types';

const { Title, Text } = Typography;

const actionColours: Record<string, string> = {
  'licence.create': 'green',
  'licence.update': 'blue',
  'licence.revoke': 'red',
  'licence.amend.user_increase': 'cyan',
  'licence.amend.user_decrease': 'orange',
  'licence.amend.renewal': 'blue',
  'licence.amend.expiry_extension': 'geekblue',
  'offline_file.generate': 'purple',
  'customer.create': 'green',
  'customer.update': 'blue',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/dashboard/audit-log', { params: { page: p, limit: 50 } });
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch {
      message.error('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (v: string) => new Date(v).toLocaleString('en-GB'),
      width: 180,
    },
    {
      title: 'User',
      key: 'user',
      render: (_: unknown, r: AuditLogEntry) => r.user?.displayName ?? r.userId,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (v: string) => <Tag color={actionColours[v] ?? 'default'}>{v}</Tag>,
    },
    { title: 'Target Type', dataIndex: 'targetType', key: 'targetType' },
    {
      title: 'Target ID',
      dataIndex: 'targetId',
      key: 'targetId',
      ellipsis: true,
      render: (v: string) => <Text copyable={{ text: v }}>{v.substring(0, 8)}...</Text>,
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (v: Record<string, unknown> | null) => {
        if (!v) return <Text type="secondary">—</Text>;
        const preview = JSON.stringify(v);
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {preview.length > 60 ? preview.substring(0, 60) + '...' : preview}
          </Text>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={4}>Audit Log</Title>
      <Card>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          Double-click any row to view full details.
        </Text>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({
            onDoubleClick: () => setDetailEntry(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `${t} entries`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title="Audit Log Entry"
        open={!!detailEntry}
        onCancel={() => setDetailEntry(null)}
        footer={null}
        width={700}
      >
        {detailEntry && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Timestamp">
              {new Date(detailEntry.timestamp).toLocaleString('en-GB')}
            </Descriptions.Item>
            <Descriptions.Item label="User">
              {detailEntry.user?.displayName ?? detailEntry.userId}
              {detailEntry.user?.email && (
                <Text type="secondary"> ({detailEntry.user.email})</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Action">
              <Tag color={actionColours[detailEntry.action] ?? 'default'}>{detailEntry.action}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Target Type">{detailEntry.targetType}</Descriptions.Item>
            <Descriptions.Item label="Target ID">
              <Text code copyable>{detailEntry.targetId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Entry ID">
              <Text code copyable style={{ fontSize: 11 }}>{detailEntry.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Details">
              {detailEntry.details ? (
                <pre style={{
                  background: '#f6f8fa',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  maxHeight: 300,
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {JSON.stringify(detailEntry.details, null, 2)}
                </pre>
              ) : (
                <Text type="secondary">No additional details</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
