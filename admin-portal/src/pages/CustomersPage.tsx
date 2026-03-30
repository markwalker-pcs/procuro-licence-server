import React, { useEffect, useState } from 'react';
import {
  Typography, Table, Button, Modal, Form, Input, Select, Tag, Space, message, Card, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../services/api';
import type { Customer, DeploymentModel } from '../types';

const { Title, Text } = Typography;

// Generate a short acronym from customer name for Azure resource naming
const generateAcronym = (name: string): string => {
  const stopWords = new Set([
    'for', 'of', 'the', 'and', 'in', 'at', 'by', 'to', 'a', 'an',
    'ltd', 'limited', 'inc', 'incorporated', 'plc', 'llp', 'llc',
    'corp', 'corporation', 'co', 'company',
  ]);
  const words = name
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopWords.has(w.toLowerCase()));

  if (words.length === 0) return '';
  if (words.length === 1) return words[0].substring(0, 6).toLowerCase();
  return words.map(w => w[0]).join('').substring(0, 10).toLowerCase();
};

const deploymentModelLabels: Record<DeploymentModel, { label: string; colour: string }> = {
  SAAS: { label: 'SaaS (Hosted)', colour: 'blue' },
  HYBRID: { label: 'Hybrid', colour: 'orange' },
  ON_PREMISES: { label: 'On-Premises', colour: 'green' },
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deploymentModelChanged, setDeploymentModelChanged] = useState(false);

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

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setDeploymentModelChanged(false);
    editForm.setFieldsValue({
      name: customer.name,
      primaryContact: customer.primaryContact,
      contactEmail: customer.contactEmail,
      contactPhone: customer.contactPhone,
      deploymentModel: customer.deploymentModel,
      notes: customer.notes,
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingCustomer) return;

    setEditSubmitting(true);
    try {
      await api.patch(`/admin/customers/${editingCustomer.id}`, values);
      message.success('Customer updated successfully');
      setEditModalOpen(false);
      editForm.resetFields();
      setEditingCustomer(null);
      setDeploymentModelChanged(false);
      fetchCustomers();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update customer');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeploymentModelChange = () => {
    if (editingCustomer && editForm.getFieldValue('deploymentModel') !== editingCustomer.deploymentModel) {
      setDeploymentModelChanged(true);
    } else {
      setDeploymentModelChanged(false);
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
      title: 'Acronym',
      dataIndex: 'customerAcronym',
      key: 'customerAcronym',
      width: 100,
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>,
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
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Customer) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
        />
      ),
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
            <Input
              placeholder="e.g. Southport NHS Foundation Trust"
              onChange={(e) => {
                const acronym = generateAcronym(e.target.value);
                form.setFieldsValue({ customerAcronym: acronym });
              }}
            />
          </Form.Item>
          <Form.Item
            name="customerAcronym"
            label="Customer Acronym"
            rules={[
              { required: true, message: 'Acronym is required' },
              { min: 2, message: 'At least 2 characters' },
              { max: 20, message: 'Maximum 20 characters' },
              { pattern: /^[a-z0-9]+$/, message: 'Lowercase alphanumeric only' },
            ]}
            extra="Used for Azure resource naming (database, containers, domain). Cannot be changed after creation."
          >
            <Input placeholder="e.g. snhsft" />
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

      <Modal
        title="Edit Customer"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          editForm.resetFields();
          setEditingCustomer(null);
          setDeploymentModelChanged(false);
        }}
        footer={null}
        width={520}
      >
        {editingCustomer && (
          <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
            <Form.Item label="Customer Number">
              <Input
                value={editingCustomer.customerNumber}
                disabled
              />
            </Form.Item>
            <Form.Item label="Customer ID">
              <Input
                value={editingCustomer.id}
                disabled
                style={{ fontSize: 12 }}
              />
            </Form.Item>
            <Form.Item label="Customer Acronym" extra="Set at creation — cannot be changed">
              <Input
                value={editingCustomer.customerAcronym || 'Not set'}
                disabled
              />
            </Form.Item>
            <Form.Item name="name" label="Organisation Name">
              <Input placeholder="e.g. Southport NHS Foundation Trust" />
            </Form.Item>
            <Form.Item name="primaryContact" label="Primary Contact Name">
              <Input placeholder="e.g. Dr Jane Smith" />
            </Form.Item>
            <Form.Item name="contactEmail" label="Contact Email" rules={[{ type: 'email' }]}>
              <Input placeholder="e.g. lab.manager@example.com" />
            </Form.Item>
            <Form.Item name="contactPhone" label="Contact Telephone">
              <Input placeholder="e.g. 0151 123 4567" />
            </Form.Item>
            <Form.Item name="deploymentModel" label="Deployment Model">
              <Select
                placeholder="Select deployment model"
                onChange={handleDeploymentModelChange}
              >
                <Select.Option value="SAAS">Model A — SaaS (Hosted)</Select.Option>
                <Select.Option value="HYBRID">Model B — Hybrid</Select.Option>
                <Select.Option value="ON_PREMISES">Model C — On-Premises</Select.Option>
              </Select>
            </Form.Item>
            {deploymentModelChanged && (
              <Alert
                message="Changing the deployment model will not affect existing licences. New licences will use the updated model."
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={editSubmitting}>Update Customer</Button>
                <Button onClick={() => {
                  setEditModalOpen(false);
                  editForm.resetFields();
                  setEditingCustomer(null);
                  setDeploymentModelChanged(false);
                }}>Cancel</Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
