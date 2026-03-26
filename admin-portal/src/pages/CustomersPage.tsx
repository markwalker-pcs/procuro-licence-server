import React, { useEffect, useState } from 'react';
import {
  Typography, Table, Button, Modal, Form, Input, Select, Tag, Space, message, Card,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../services/api';
import type { Customer, DeploymentModel } from '../types';

const { Title, Text } = Typography;

const deploymentModelLabels: Record<DeploymentModel, { label: string; colour: string }> = {
  SAAS: { label: 'SaaS (Hosted)', colour: 'blue' },
  HYBRID: { label: 'Hybrid', colour: 'orange' },
  ON_PREMISES: { label: 'On-Premises', colour: 'green' },
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/customers');
      setCustomers(res.data.data);
    } catch {
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleCreate = async (values: any) => {
    setSubmitting(true);
    try {
      await api.post('/admin/customers', values);
      message.success('Customer created successfully');
      setModalOpen(false);
      form.resetFields();
      fetchCustomers();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'Customer No.',
      dataIndex: 'customerNumber',
      key: 'customerNumber',
      width: 180,
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Customer, b: Customer) => a.name.localeCompare(b.name),
    },
    {
      title: 'Primary Contact',
      key: 'primaryContact',
      render: (_: unknown, record: Customer) => {
        if (!record.primaryContact && !record.contactEmail) return <Text type="secondary">—</Text>;
        return (
          <div>
            {record.primaryContact && <div>{record.primaryContact}</div>}
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.contactEmail}</Text>
            </div>
            {record.contactPhone && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{record.contactPhone}</Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Deployment Model',
      dataIndex: 'deploymentModel',
      key: 'deploymentModel',
      render: (model: DeploymentModel) => (
        <Tag color={deploymentModelLabels[model].colour}>{deploymentModelLabels[model].label}</Tag>
      ),
      filters: [
        { text: 'SaaS (Hosted)', value: 'SAAS' },
        { text: 'Hybrid', value: 'HYBRID' },
        { text: 'On-Premises', value: 'ON_PREMISES' },
      ],
      onFilter: (value: any, record: Customer) => record.deploymentModel === value,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-GB'),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Customers</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New Customer
        </Button>
      </div>

      <Card>
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title="Create New Customer"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Organisation Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Southport NHS Foundation Trust" />
          </Form.Item>
          <Form.Item name="primaryContact" label="Primary Contact Name">
            <Input placeholder="e.g. Dr Jane Smith" />
          </Form.Item>
          <Form.Item name="contactEmail" label="Contact Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="e.g. lab.manager@example.com" />
          </Form.Item>
          <Form.Item name="contactPhone" label="Contact Telephone">
            <Input placeholder="e.g. 0151 123 4567" />
          </Form.Item>
          <Form.Item name="deploymentModel" label="Deployment Model" rules={[{ required: true }]}>
            <Select placeholder="Select deployment model">
              <Select.Option value="SAAS">Model A — SaaS (Hosted)</Select.Option>
              <Select.Option value="HYBRID">Model B — Hybrid</Select.Option>
              <Select.Option value="ON_PREMISES">Model C — On-Premises</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>Create Customer</Button>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
