import React, { useEffect, useState } from 'react';
import {
  Typography, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message,
  Card, Steps, Descriptions, Popconfirm, Drawer, Collapse, DatePicker, Checkbox, Tooltip,
  Dropdown,
} from 'antd';
import { PlusOutlined, EditOutlined, RocketOutlined, SettingOutlined, DeleteOutlined, CopyOutlined, DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';
import type { Customer, Deployment, DatabaseType, ConnectivityType, DeploymentStatus, TenantConfig } from '../types';

const { Title, Text } = Typography;

const statusColours: Record<DeploymentStatus, string> = {
  PROVISIONING: 'blue',
  ACTIVE: 'green',
  SUSPENDED: 'orange',
  DECOMMISSIONED: 'default',
};

const databaseTypeLabels: Record<DatabaseType, string> = {
  POSTGRESQL: 'PostgreSQL',
  SQLSERVER: 'SQL Server',
  MYSQL: 'MySQL',
  MARIADB: 'MariaDB',
};

const connectivityLabels: Record<ConnectivityType, string> = {
  PRIVATE_LINK: 'Private Link',
  SITE_TO_SITE_VPN: 'Site-to-Site VPN',
  EXPRESSROUTE: 'ExpressRoute',
  PUBLIC_ENDPOINT: 'Public Endpoint',
};

const databasePortDefaults: Record<DatabaseType, number> = {
  POSTGRESQL: 5432,
  SQLSERVER: 1433,
  MYSQL: 3306,
  MARIADB: 3306,
};

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState<Deployment | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editSelectedCustomer, setEditSelectedCustomer] = useState<Customer | null>(null);
  const [statusChangeLoading, setStatusChangeLoading] = useState<string | null>(null);

  // Tenant config state
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [configDrawerDeployment, setConfigDrawerDeployment] = useState<Deployment | null>(null);
  const [configs, setConfigs] = useState<TenantConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [addConfigModalOpen, setAddConfigModalOpen] = useState(false);
  const [editConfigModalOpen, setEditConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TenantConfig | null>(null);
  const [configForm] = Form.useForm();
  const [editConfigForm] = Form.useForm();
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [domainForm] = Form.useForm();
  const [savingDomain, setSavingDomain] = useState(false);
  const [bulkAddModalOpen, setBulkAddModalOpen] = useState(false);
  const [bulkConfigs, setBulkConfigs] = useState<TenantConfig[]>([]);
  const [bulkConfigForm] = Form.useForm();
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/deployments');
      setDeployments(res.data.data);
    } catch {
      message.error('Failed to load deployments');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/admin/customers');
      setCustomers(res.data.data);
    } catch {
      message.error('Failed to load customers');
    }
  };

  const fetchConfigs = async (deploymentId: string) => {
    setConfigsLoading(true);
    try {
      const res = await api.get(`/admin/tenant-config/${deploymentId}`);
      setConfigs(res.data.data || []);
    } catch {
      message.error('Failed to load tenant configurations');
      setConfigs([]);
    } finally {
      setConfigsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    fetchCustomers();
  }, []);

  const handleDatabaseTypeChange = (type: DatabaseType, isEdit: boolean = false) => {
    const form_ = isEdit ? editForm : form;
    const port = databasePortDefaults[type];
    form_.setFieldValue('databasePort', port);
  };

  const handleCreateNext = async () => {
    try {
      const values = await form.validateFields();
      if (currentStep === 0) {
        const customer = customers.find(c => c.id === values.customerId);
        setSelectedCustomer(customer || null);
      } else if (currentStep === 2) {
        const customer = customers.find(c => c.id === form.getFieldValue('customerId'));
        const suggestedLabel = `${customer?.name} Production`;
        form.setFieldValue('deploymentLabel', suggestedLabel);
      }
      setCurrentStep(currentStep + 1);
    } catch {
      // Form validation failed
    }
  };

  const handleCreatePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleCreate = async (values: any) => {
    setSubmitting(true);
    try {
      await api.post('/admin/deployments', values);
      message.success('Deployment provisioned successfully');
      setModalOpen(false);
      form.resetFields();
      setCurrentStep(0);
      setSelectedCustomer(null);
      fetchDeployments();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to provision deployment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (deployment: Deployment) => {
    setEditingDeployment(deployment);
    const customer = customers.find(c => c.id === deployment.customerId);
    setEditSelectedCustomer(customer || null);
    setEditStep(0);
    editForm.setFieldsValue({
      customerId: deployment.customerId,
      databaseType: deployment.databaseType,
      databaseHost: deployment.databaseHost,
      databasePort: deployment.databasePort,
      databaseName: deployment.databaseName,
      connectivityType: deployment.connectivityType,
      deploymentLabel: deployment.deploymentLabel,
      containerAppName: deployment.containerAppName,
      containerAppUrl: deployment.containerAppUrl,
      imageTag: deployment.imageTag,
      notes: deployment.notes,
    });
    setEditModalOpen(true);
  };

  const handleEditNext = async () => {
    try {
      const values = await editForm.validateFields();
      if (editStep === 0) {
        const customer = customers.find(c => c.id === values.customerId);
        setEditSelectedCustomer(customer || null);
      }
      setEditStep(editStep + 1);
    } catch {
      // Form validation failed
    }
  };

  const handleEditPrev = () => {
    setEditStep(editStep - 1);
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingDeployment) return;

    setEditSubmitting(true);
    try {
      await api.patch(`/admin/deployments/${editingDeployment.id}`, values);
      message.success('Deployment updated successfully');
      setEditModalOpen(false);
      editForm.resetFields();
      setEditingDeployment(null);
      setEditSelectedCustomer(null);
      setEditStep(0);
      fetchDeployments();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update deployment');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleStatusChange = async (deploymentId: string, newStatus: string) => {
    setStatusChangeLoading(deploymentId);
    try {
      await api.patch(`/admin/deployments/${deploymentId}/status`, { status: newStatus });
      message.success(`Deployment ${newStatus.toLowerCase()}`);
      fetchDeployments();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update deployment status');
    } finally {
      setStatusChangeLoading(null);
    }
  };

  const handleOpenConfigDrawer = async (deployment: Deployment) => {
    setConfigDrawerDeployment(deployment);
    setConfigDrawerOpen(true);
    await fetchConfigs(deployment.id);
    domainForm.setFieldsValue({
      customDomain: deployment.customDomain,
      sslCertExpiry: deployment.sslCertExpiry ? dayjs(deployment.sslCertExpiry) : null,
    });
  };

  const handleCloseConfigDrawer = () => {
    setConfigDrawerOpen(false);
    setConfigDrawerDeployment(null);
    setConfigs([]);
    domainForm.resetFields();
    configForm.resetFields();
  };

  const handleSaveDomain = async (values: any) => {
    if (!configDrawerDeployment) return;
    setSavingDomain(true);
    try {
      await api.patch(`/admin/deployments/${configDrawerDeployment.id}`, {
        customDomain: values.customDomain || null,
        sslCertExpiry: values.sslCertExpiry ? values.sslCertExpiry.toISOString() : null,
      });
      message.success('Domain configuration saved');
      fetchDeployments();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to save domain configuration');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleAddConfig = async (values: any) => {
    if (!configDrawerDeployment) return;
    setConfigSubmitting(true);
    try {
      await api.post(`/admin/tenant-config/${configDrawerDeployment.id}`, {
        category: values.category,
        configKey: values.configKey,
        configValue: values.configValue,
        isSecret: values.isSecret || false,
        description: values.description || null,
      });
      message.success('Configuration added');
      setAddConfigModalOpen(false);
      configForm.resetFields();
      await fetchConfigs(configDrawerDeployment.id);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to add configuration');
    } finally {
      setConfigSubmitting(false);
    }
  };

  const handleEditConfig = (config: TenantConfig) => {
    setEditingConfig(config);
    editConfigForm.setFieldsValue({
      category: config.category,
      configKey: config.configKey,
      configValue: config.configValue,
      isSecret: config.isSecret,
      description: config.description,
    });
    setEditConfigModalOpen(true);
  };

  const handleUpdateConfig = async (values: any) => {
    if (!configDrawerDeployment || !editingConfig) return;
    setConfigSubmitting(true);
    try {
      await api.patch(
        `/admin/tenant-config/${configDrawerDeployment.id}/${editingConfig.id}`,
        {
          category: values.category,
          configKey: values.configKey,
          configValue: values.configValue,
          isSecret: values.isSecret || false,
          description: values.description || null,
        }
      );
      message.success('Configuration updated');
      setEditConfigModalOpen(false);
      editConfigForm.resetFields();
      setEditingConfig(null);
      await fetchConfigs(configDrawerDeployment.id);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update configuration');
    } finally {
      setConfigSubmitting(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!configDrawerDeployment) return;
    try {
      await api.delete(`/admin/tenant-config/${configDrawerDeployment.id}/${configId}`);
      message.success('Configuration deleted');
      await fetchConfigs(configDrawerDeployment.id);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to delete configuration');
    }
  };

  const handleQuickAddTemplate = (template: 'standard-env' | 'feature-flags') => {
    const templateConfigs: TenantConfig[] = [];

    if (template === 'standard-env') {
      const envVars = [
        { key: 'DATABASE_URL', isSecret: true },
        { key: 'JWT_SECRET', isSecret: true },
        { key: 'NODE_ENV', isSecret: false },
        { key: 'PORT', isSecret: false },
        { key: 'CORS_ORIGIN', isSecret: false },
        { key: 'LICENCE_SERVER_URL', isSecret: false },
        { key: 'LICENCE_KEY', isSecret: true },
        { key: 'LICENCE_INSTANCE_ID', isSecret: false },
        { key: 'LICENCE_HMAC_SECRET', isSecret: true },
        { key: 'LICENCE_ENABLED', isSecret: false },
      ];

      templateConfigs.push(
        ...envVars.map((v, idx) => ({
          id: `temp-${idx}`,
          deploymentId: configDrawerDeployment?.id || '',
          category: 'env_var',
          configKey: v.key,
          configValue: '',
          isSecret: v.isSecret,
          description: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      );
    } else if (template === 'feature-flags') {
      const flags = [
        { key: 'ENABLE_AUDIT_EXPORT', value: 'false' },
        { key: 'ENABLE_DOCUMENT_LINKS', value: 'true' },
        { key: 'ENABLE_ALERTS', value: 'true' },
      ];

      templateConfigs.push(
        ...flags.map((f, idx) => ({
          id: `temp-${idx}`,
          deploymentId: configDrawerDeployment?.id || '',
          category: 'feature_flag',
          configKey: f.key,
          configValue: f.value,
          isSecret: false,
          description: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      );
    }

    setBulkConfigs(templateConfigs);
    bulkConfigForm.setFieldsValue({
      entries: templateConfigs.map(c => ({
        configKey: c.configKey,
        configValue: c.configValue,
        isSecret: c.isSecret,
        description: c.description,
      })),
    });
    setBulkAddModalOpen(true);
  };

  const handleBulkAddConfigs = async (values: any) => {
    if (!configDrawerDeployment) return;
    setBulkSubmitting(true);
    try {
      const entries = values.entries || bulkConfigs;
      await Promise.all(
        entries.map((entry: any) =>
          api.post(`/admin/tenant-config/${configDrawerDeployment.id}`, {
            category: entry.category || bulkConfigs[0]?.category,
            configKey: entry.configKey,
            configValue: entry.configValue,
            isSecret: entry.isSecret || false,
            description: entry.description || null,
          })
        )
      );
      message.success(`Added ${entries.length} configuration entries`);
      setBulkAddModalOpen(false);
      bulkConfigForm.resetFields();
      setBulkConfigs([]);
      await fetchConfigs(configDrawerDeployment.id);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to add configurations');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const configCategories = [
    { key: 'env_var', label: 'Environment Variables' },
    { key: 'feature_flag', label: 'Feature Flags' },
    { key: 'domain', label: 'Domain & Networking' },
    { key: 'notification', label: 'Notifications' },
    { key: 'other', label: 'Other' },
  ];

  const configTableColumns = [
    {
      title: 'Key',
      dataIndex: 'configKey',
      key: 'configKey',
      width: 180,
    },
    {
      title: 'Value',
      dataIndex: 'configValue',
      key: 'configValue',
      render: (value: string, record: TenantConfig) => (
        <code style={{ color: record.isSecret ? '#999' : '#333' }}>
          {record.isSecret ? '••••••••' : value}
        </code>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string | null) => desc || <Text type="secondary">—</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: TenantConfig) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditConfig(record)}
          />
          <Popconfirm
            title="Delete configuration?"
            description="This action cannot be undone."
            onConfirm={() => handleDeleteConfig(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: 'Deployment Label',
      dataIndex: 'deploymentLabel',
      key: 'deploymentLabel',
      sorter: (a: Deployment, b: Deployment) => a.deploymentLabel.localeCompare(b.deploymentLabel),
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_: unknown, record: Deployment) => (
        <div>
          {record.customer?.name && <div>{record.customer.name}</div>}
          {record.customer?.customerNumber && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.customer.customerNumber}</Text>
          )}
        </div>
      ),
      sorter: (a: Deployment, b: Deployment) => (a.customer?.name || '').localeCompare(b.customer?.name || ''),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: DeploymentStatus) => (
        <Tag color={statusColours[status]}>{status}</Tag>
      ),
      filters: [
        { text: 'Provisioning', value: 'PROVISIONING' },
        { text: 'Active', value: 'ACTIVE' },
        { text: 'Suspended', value: 'SUSPENDED' },
        { text: 'Decommissioned', value: 'DECOMMISSIONED' },
      ],
      onFilter: (value: any, record: Deployment) => record.status === value,
    },
    {
      title: 'Database Type',
      dataIndex: 'databaseType',
      key: 'databaseType',
      render: (type: DatabaseType) => databaseTypeLabels[type],
      filters: [
        { text: 'PostgreSQL', value: 'POSTGRESQL' },
        { text: 'SQL Server', value: 'SQLSERVER' },
        { text: 'MySQL', value: 'MYSQL' },
        { text: 'MariaDB', value: 'MARIADB' },
      ],
      onFilter: (value: any, record: Deployment) => record.databaseType === value,
    },
    {
      title: 'Connectivity',
      dataIndex: 'connectivityType',
      key: 'connectivityType',
      render: (type: ConnectivityType | null) => (type ? connectivityLabels[type] : <Text type="secondary">—</Text>),
    },
    {
      title: 'Image Tag',
      dataIndex: 'imageTag',
      key: 'imageTag',
      render: (tag: string | null) => (
        tag ? <Text code style={{ fontSize: 12 }}>{tag}</Text> : <Text type="secondary">—</Text>
      ),
    },
    {
      title: 'Provisioned',
      dataIndex: 'provisionedAt',
      key: 'provisionedAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-GB'),
      sorter: (a: Deployment, b: Deployment) => new Date(a.provisionedAt).getTime() - new Date(b.provisionedAt).getTime(),
    },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_: unknown, record: Deployment) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => handleOpenConfigDrawer(record)}
            title="Configure tenant"
          />
          <Popconfirm
            title="Change Status"
            description={
              <div>
                <div style={{ marginBottom: 8 }}>Select new status:</div>
                <Button.Group>
                  {record.status !== 'ACTIVE' && (
                    <Button
                      size="small"
                      onClick={() => handleStatusChange(record.id, 'ACTIVE')}
                      loading={statusChangeLoading === record.id}
                    >
                      Activate
                    </Button>
                  )}
                  {record.status !== 'SUSPENDED' && (
                    <Button
                      size="small"
                      onClick={() => handleStatusChange(record.id, 'SUSPENDED')}
                      loading={statusChangeLoading === record.id}
                    >
                      Suspend
                    </Button>
                  )}
                  {record.status !== 'DECOMMISSIONED' && (
                    <Button
                      size="small"
                      onClick={() => handleStatusChange(record.id, 'DECOMMISSIONED')}
                      loading={statusChangeLoading === record.id}
                      danger
                    >
                      Decommission
                    </Button>
                  )}
                </Button.Group>
              </div>
            }
            onOpenChange={() => {}}
          />
        </Space>
      ),
    },
  ];

  const createModalSteps = [
    {
      title: 'Customer',
      content: (
        <Form form={form} layout="vertical">
          <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select a customer' }]}>
            <Select placeholder="Select customer" onChange={(value) => {
              const customer = customers.find(c => c.id === value);
              setSelectedCustomer(customer || null);
            }}>
              {customers.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.customerNumber})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {selectedCustomer && (
            <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: 4 }}>
              <Text strong>Deployment Model:</Text>
              <div>{selectedCustomer.deploymentModel}</div>
            </div>
          )}
        </Form>
      ),
    },
    {
      title: 'Database',
      content: (
        <Form form={form} layout="vertical">
          <Form.Item name="databaseType" label="Database Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select database type"
              onChange={(value) => handleDatabaseTypeChange(value, false)}
            >
              <Select.Option value="POSTGRESQL">PostgreSQL</Select.Option>
              <Select.Option value="SQLSERVER">SQL Server</Select.Option>
              <Select.Option value="MYSQL">MySQL</Select.Option>
              <Select.Option value="MARIADB">MariaDB</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="databaseHost" label="Database Host" rules={[{ required: true }]}>
            <Input placeholder="e.g. procuro-db.postgres.database.azure.com" />
          </Form.Item>
          <Form.Item name="databasePort" label="Database Port" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="databaseName" label="Database Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. procuro_acme" />
          </Form.Item>
          <Form.Item name="connectivityType" label="Connectivity Type" rules={[{ required: true }]}>
            <Select placeholder="Select connectivity type">
              <Select.Option value="PRIVATE_LINK">Private Link</Select.Option>
              <Select.Option value="SITE_TO_SITE_VPN">Site-to-Site VPN</Select.Option>
              <Select.Option value="EXPRESSROUTE">ExpressRoute</Select.Option>
              <Select.Option value="PUBLIC_ENDPOINT">Public Endpoint</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      ),
    },
    {
      title: 'Application',
      content: (
        <Form form={form} layout="vertical">
          <Form.Item name="deploymentLabel" label="Deployment Label" rules={[{ required: true }]}>
            <Input placeholder="e.g. Acme Production" />
          </Form.Item>
          <Form.Item name="containerAppName" label="Container App Name">
            <Input placeholder="e.g. procuro-acme-backend" />
          </Form.Item>
          <Form.Item name="containerAppUrl" label="Container App URL">
            <Input placeholder="e.g. https://procuro-acme.azurecontainerapps.io" />
          </Form.Item>
          <Form.Item name="imageTag" label="Image Tag">
            <Input placeholder="e.g. build25" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      ),
    },
    {
      title: 'Review',
      content: (
        <div>
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Customer">
              {selectedCustomer?.name}
            </Descriptions.Item>
            <Descriptions.Item label="Database Type">
              {form.getFieldValue('databaseType') && databaseTypeLabels[form.getFieldValue('databaseType') as DatabaseType]}
            </Descriptions.Item>
            <Descriptions.Item label="Database Host">
              {form.getFieldValue('databaseHost')}
            </Descriptions.Item>
            <Descriptions.Item label="Database Port">
              {form.getFieldValue('databasePort')}
            </Descriptions.Item>
            <Descriptions.Item label="Database Name">
              {form.getFieldValue('databaseName')}
            </Descriptions.Item>
            <Descriptions.Item label="Connectivity Type">
              {form.getFieldValue('connectivityType') && connectivityLabels[form.getFieldValue('connectivityType') as ConnectivityType]}
            </Descriptions.Item>
            <Descriptions.Item label="Deployment Label">
              {form.getFieldValue('deploymentLabel')}
            </Descriptions.Item>
            <Descriptions.Item label="Container App Name">
              {form.getFieldValue('containerAppName') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Container App URL">
              {form.getFieldValue('containerAppUrl') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Image Tag">
              {form.getFieldValue('imageTag') || '—'}
            </Descriptions.Item>
            {form.getFieldValue('notes') && (
              <Descriptions.Item label="Notes">
                {form.getFieldValue('notes')}
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>
      ),
    },
  ];

  const editModalSteps = [
    {
      title: 'Customer',
      content: (
        <Form form={editForm} layout="vertical">
          <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
            <Select
              placeholder="Select customer"
              onChange={(value) => {
                const customer = customers.find(c => c.id === value);
                setEditSelectedCustomer(customer || null);
              }}
            >
              {customers.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.customerNumber})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {editSelectedCustomer && (
            <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: 4 }}>
              <Text strong>Deployment Model:</Text>
              <div>{editSelectedCustomer.deploymentModel}</div>
            </div>
          )}
        </Form>
      ),
    },
    {
      title: 'Database',
      content: (
        <Form form={editForm} layout="vertical">
          <Form.Item name="databaseType" label="Database Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select database type"
              onChange={(value) => handleDatabaseTypeChange(value, true)}
            >
              <Select.Option value="POSTGRESQL">PostgreSQL</Select.Option>
              <Select.Option value="SQLSERVER">SQL Server</Select.Option>
              <Select.Option value="MYSQL">MySQL</Select.Option>
              <Select.Option value="MARIADB">MariaDB</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="databaseHost" label="Database Host" rules={[{ required: true }]}>
            <Input placeholder="e.g. procuro-db.postgres.database.azure.com" />
          </Form.Item>
          <Form.Item name="databasePort" label="Database Port" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="databaseName" label="Database Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. procuro_acme" />
          </Form.Item>
          <Form.Item name="connectivityType" label="Connectivity Type" rules={[{ required: true }]}>
            <Select placeholder="Select connectivity type">
              <Select.Option value="PRIVATE_LINK">Private Link</Select.Option>
              <Select.Option value="SITE_TO_SITE_VPN">Site-to-Site VPN</Select.Option>
              <Select.Option value="EXPRESSROUTE">ExpressRoute</Select.Option>
              <Select.Option value="PUBLIC_ENDPOINT">Public Endpoint</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      ),
    },
    {
      title: 'Application',
      content: (
        <Form form={editForm} layout="vertical">
          <Form.Item name="deploymentLabel" label="Deployment Label" rules={[{ required: true }]}>
            <Input placeholder="e.g. Acme Production" />
          </Form.Item>
          <Form.Item name="containerAppName" label="Container App Name">
            <Input placeholder="e.g. procuro-acme-backend" />
          </Form.Item>
          <Form.Item name="containerAppUrl" label="Container App URL">
            <Input placeholder="e.g. https://procuro-acme.azurecontainerapps.io" />
          </Form.Item>
          <Form.Item name="imageTag" label="Image Tag">
            <Input placeholder="e.g. build25" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      ),
    },
    {
      title: 'Review',
      content: (
        <div>
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Customer">
              {editSelectedCustomer?.name}
            </Descriptions.Item>
            <Descriptions.Item label="Database Type">
              {editForm.getFieldValue('databaseType') && databaseTypeLabels[editForm.getFieldValue('databaseType') as DatabaseType]}
            </Descriptions.Item>
            <Descriptions.Item label="Database Host">
              {editForm.getFieldValue('databaseHost')}
            </Descriptions.Item>
            <Descriptions.Item label="Database Port">
              {editForm.getFieldValue('databasePort')}
            </Descriptions.Item>
            <Descriptions.Item label="Database Name">
              {editForm.getFieldValue('databaseName')}
            </Descriptions.Item>
            <Descriptions.Item label="Connectivity Type">
              {editForm.getFieldValue('connectivityType') && connectivityLabels[editForm.getFieldValue('connectivityType') as ConnectivityType]}
            </Descriptions.Item>
            <Descriptions.Item label="Deployment Label">
              {editForm.getFieldValue('deploymentLabel')}
            </Descriptions.Item>
            <Descriptions.Item label="Container App Name">
              {editForm.getFieldValue('containerAppName') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Container App URL">
              {editForm.getFieldValue('containerAppUrl') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Image Tag">
              {editForm.getFieldValue('imageTag') || '—'}
            </Descriptions.Item>
            {editForm.getFieldValue('notes') && (
              <Descriptions.Item label="Notes">
                {editForm.getFieldValue('notes')}
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Deployments</Title>
        <Button type="primary" icon={<RocketOutlined />} onClick={() => {
          setModalOpen(true);
          setCurrentStep(0);
          setSelectedCustomer(null);
          form.resetFields();
        }}>
          Provision New Deployment
        </Button>
      </div>

      <Card>
        <Table
          dataSource={deployments}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title="Provision New Deployment"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setCurrentStep(0);
          setSelectedCustomer(null);
        }}
        footer={null}
        width={600}
      >
        <Steps current={currentStep} items={createModalSteps.map(step => ({ title: step.title }))} style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 300 }}>
          {createModalSteps[currentStep].content}
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleCreatePrev} disabled={currentStep === 0}>
            Previous
          </Button>
          <Space>
            <Button onClick={() => {
              setModalOpen(false);
              form.resetFields();
              setCurrentStep(0);
              setSelectedCustomer(null);
            }}>Cancel</Button>
            {currentStep === createModalSteps.length - 1 ? (
              <Button type="primary" onClick={() => handleCreate(form.getFieldsValue())} loading={submitting}>
                Provision
              </Button>
            ) : (
              <Button type="primary" onClick={handleCreateNext}>
                Next
              </Button>
            )}
          </Space>
        </div>
      </Modal>

      <Modal
        title="Edit Deployment"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          editForm.resetFields();
          setEditingDeployment(null);
          setEditSelectedCustomer(null);
          setEditStep(0);
        }}
        footer={null}
        width={600}
      >
        <Steps current={editStep} items={editModalSteps.map(step => ({ title: step.title }))} style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 300 }}>
          {editModalSteps[editStep].content}
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleEditPrev} disabled={editStep === 0}>
            Previous
          </Button>
          <Space>
            <Button onClick={() => {
              setEditModalOpen(false);
              editForm.resetFields();
              setEditingDeployment(null);
              setEditSelectedCustomer(null);
              setEditStep(0);
            }}>Cancel</Button>
            {editStep === editModalSteps.length - 1 ? (
              <Button type="primary" onClick={() => handleEditSubmit(editForm.getFieldsValue())} loading={editSubmitting}>
                Update
              </Button>
            ) : (
              <Button type="primary" onClick={handleEditNext}>
                Next
              </Button>
            )}
          </Space>
        </div>
      </Modal>

      {/* Tenant Configuration Drawer */}
      <Drawer
        title={configDrawerDeployment ? `${configDrawerDeployment.deploymentLabel} — Tenant Configuration` : 'Tenant Configuration'}
        onClose={handleCloseConfigDrawer}
        open={configDrawerOpen}
        width={720}
        bodyStyle={{ paddingBottom: 80 }}
      >
        {configDrawerDeployment && (
          <>
            {/* Custom Domain Section */}
            <div style={{ marginBottom: 32 }}>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>Custom Domain</Typography.Title>
              <Form form={domainForm} layout="vertical" onFinish={handleSaveDomain}>
                <Form.Item name="customDomain" label="Custom Domain">
                  <Input placeholder="e.g. app.example.com" />
                </Form.Item>
                <Form.Item name="sslCertExpiry" label="SSL Certificate Expiry">
                  <DatePicker />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={savingDomain}>
                  Save Domain Configuration
                </Button>
              </Form>
            </div>

            {/* Configuration Entries Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>Configuration Entries</Typography.Title>
                <Space>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'standard-env',
                          label: 'Standard V5 Environment Variables',
                          onClick: () => handleQuickAddTemplate('standard-env'),
                        },
                        {
                          key: 'feature-flags',
                          label: 'Feature Flags',
                          onClick: () => handleQuickAddTemplate('feature-flags'),
                        },
                      ],
                    }}
                  >
                    <Button>
                      Quick Add <DownOutlined />
                    </Button>
                  </Dropdown>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    configForm.resetFields();
                    setAddConfigModalOpen(true);
                  }}>
                    Add Config
                  </Button>
                </Space>
              </div>

              {configsLoading ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <Text type="secondary">Loading configurations...</Text>
                </div>
              ) : configs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <Text type="secondary">No configurations yet</Text>
                </div>
              ) : (
                <Collapse
                  items={configCategories.map(category => ({
                    key: category.key,
                    label: category.label,
                    children: (
                      <Table
                        dataSource={configs.filter(c => c.category === category.key)}
                        columns={configTableColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        style={{ marginTop: -16 }}
                      />
                    ),
                  }))}
                  defaultActiveKey={configs.length > 0 ? [configs[0].category] : []}
                />
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* Add Configuration Modal */}
      <Modal
        title="Add Configuration"
        open={addConfigModalOpen}
        onCancel={() => {
          setAddConfigModalOpen(false);
          configForm.resetFields();
        }}
        onOk={() => configForm.submit()}
        confirmLoading={configSubmitting}
        okText="Add"
      >
        <Form form={configForm} layout="vertical" onFinish={handleAddConfig}>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select placeholder="Select category">
              <Select.Option value="env_var">Environment Variables</Select.Option>
              <Select.Option value="feature_flag">Feature Flags</Select.Option>
              <Select.Option value="domain">Domain & Networking</Select.Option>
              <Select.Option value="notification">Notifications</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="configKey" label="Key" rules={[{ required: true }]}>
            <Input placeholder="e.g. DATABASE_URL" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.isSecret !== currentValues.isSecret}>
            {({ getFieldValue }) =>
              getFieldValue('isSecret') ? (
                <Form.Item name="configValue" label="Value" rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
              ) : (
                <Form.Item name="configValue" label="Value" rules={[{ required: true }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="isSecret" valuePropName="checked">
            <Checkbox>Is Secret</Checkbox>
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Configuration Modal */}
      <Modal
        title="Edit Configuration"
        open={editConfigModalOpen}
        onCancel={() => {
          setEditConfigModalOpen(false);
          editConfigForm.resetFields();
          setEditingConfig(null);
        }}
        onOk={() => editConfigForm.submit()}
        confirmLoading={configSubmitting}
        okText="Update"
      >
        <Form form={editConfigForm} layout="vertical" onFinish={handleUpdateConfig}>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select placeholder="Select category">
              <Select.Option value="env_var">Environment Variables</Select.Option>
              <Select.Option value="feature_flag">Feature Flags</Select.Option>
              <Select.Option value="domain">Domain & Networking</Select.Option>
              <Select.Option value="notification">Notifications</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="configKey" label="Key" rules={[{ required: true }]}>
            <Input placeholder="e.g. DATABASE_URL" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.isSecret !== currentValues.isSecret}>
            {({ getFieldValue }) =>
              getFieldValue('isSecret') ? (
                <Form.Item name="configValue" label="Value" rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
              ) : (
                <Form.Item name="configValue" label="Value" rules={[{ required: true }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="isSecret" valuePropName="checked">
            <Checkbox>Is Secret</Checkbox>
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Add Template Modal */}
      <Modal
        title="Add Template Configurations"
        open={bulkAddModalOpen}
        onCancel={() => {
          setBulkAddModalOpen(false);
          bulkConfigForm.resetFields();
          setBulkConfigs([]);
        }}
        onOk={() => handleBulkAddConfigs(bulkConfigForm.getFieldsValue())}
        confirmLoading={bulkSubmitting}
        okText="Add All"
        width={700}
      >
        <Form form={bulkConfigForm} layout="vertical">
          <Table
            dataSource={bulkConfigs}
            columns={[
              {
                title: 'Key',
                dataIndex: 'configKey',
                key: 'configKey',
                render: (text, record, index) => (
                  <Form.Item
                    name={['entries', index, 'configKey']}
                    style={{ margin: 0 }}
                    initialValue={record.configKey}
                  >
                    <Input />
                  </Form.Item>
                ),
              },
              {
                title: 'Value',
                dataIndex: 'configValue',
                key: 'configValue',
                render: (text, record, index) => (
                  <Form.Item
                    name={['entries', index, 'configValue']}
                    style={{ margin: 0 }}
                    initialValue={record.configValue}
                  >
                    {record.isSecret ? <Input.Password /> : <Input />}
                  </Form.Item>
                ),
              },
            ]}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Form>
      </Modal>
    </div>
  );
}
