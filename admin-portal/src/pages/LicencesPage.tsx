import React, { useEffect, useState } from 'react';
import {
  Typography, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, message, Card, Popconfirm, Descriptions, Tooltip, List, Timeline,
} from 'antd';
import {
  PlusOutlined, StopOutlined, DownloadOutlined, FileProtectOutlined,
  HistoryOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';
import type { Licence, LicenceStatus, LicenceType, DeploymentModel, Customer, OfflineFile, LicenceAmendment, AmendmentType } from '../types';

const { Title, Text, Paragraph } = Typography;

const statusColours: Record<LicenceStatus, string> = {
  ACTIVE: 'green',
  SUSPENDED: 'orange',
  EXPIRED: 'red',
  REVOKED: 'volcano',
};

const licenceTypeLabels: Record<LicenceType, { label: string; colour: string }> = {
  PER_USER: { label: 'Per User', colour: 'blue' },
  CONCURRENT: { label: 'Concurrent', colour: 'purple' },
};

const amendmentLabels: Record<AmendmentType, string> = {
  USER_INCREASE: 'User Increase',
  USER_DECREASE: 'User Decrease',
  RENEWAL: 'Renewal',
  EXPIRY_EXTENSION: 'Expiry Extension',
  TYPE_CHANGE: 'Type Change',
};

const amendmentColours: Record<AmendmentType, string> = {
  USER_INCREASE: 'green',
  USER_DECREASE: 'orange',
  RENEWAL: 'blue',
  EXPIRY_EXTENSION: 'cyan',
  TYPE_CHANGE: 'purple',
};

const deploymentModelLabels: Record<DeploymentModel, { label: string; colour: string }> = {
  SAAS: { label: 'SaaS', colour: 'blue' },
  HYBRID: { label: 'Hybrid', colour: 'orange' },
  ON_PREMISES: { label: 'On-Premises', colour: 'green' },
};

export default function LicencesPage() {
  const [licences, setLicences] = useState<Licence[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState<{ key: string; customerId: string } | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Amendment state
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const [amendLicence, setAmendLicence] = useState<Licence | null>(null);
  const [amendForm] = Form.useForm();
  const [amending, setAmending] = useState(false);
  const [amendHistoryOpen, setAmendHistoryOpen] = useState(false);
  const [amendHistoryLicence, setAmendHistoryLicence] = useState<Licence | null>(null);
  const [amendments, setAmendments] = useState<LicenceAmendment[]>([]);
  const [loadingAmendments, setLoadingAmendments] = useState(false);

  // Offline file state
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineModalLicence, setOfflineModalLicence] = useState<Licence | null>(null);
  const [offlineForm] = Form.useForm();
  const [generatingOffline, setGeneratingOffline] = useState(false);
  const [offlineResult, setOfflineResult] = useState<{
    data: { id: string; customer: string; expiresAt: string; fileHash: string };
    file: { payload: string; signature: string; fileHash: string };
  } | null>(null);

  // Offline file history state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLicence, setHistoryLicence] = useState<Licence | null>(null);
  const [offlineFiles, setOfflineFiles] = useState<OfflineFile[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [licRes, custRes] = await Promise.all([
        api.get('/admin/licences'),
        api.get('/admin/customers'),
      ]);
      setLicences(licRes.data.data);
      setCustomers(custRes.data.data);
    } catch {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (values: any) => {
    setSubmitting(true);
    try {
      const res = await api.post('/admin/licences', {
        ...values,
        expiryDate: values.expiryDate.toISOString(),
      });
      setNewKeyModal({ key: res.data.licenceKey, customerId: values.customerId });
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to issue licence');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.delete(`/admin/licences/${id}`);
      message.success('Licence revoked');
      fetchData();
    } catch {
      message.error('Failed to revoke licence');
    }
  };

  // ─── Amendment Handlers ───

  const openAmendModal = (licence: Licence) => {
    setAmendLicence(licence);
    amendForm.resetFields();
    amendForm.setFieldsValue({ amendmentType: 'USER_INCREASE' });
    setAmendModalOpen(true);
  };

  const handleAmend = async (values: any) => {
    if (!amendLicence) return;
    setAmending(true);
    try {
      await api.post(`/admin/licences/${amendLicence.id}/amend`, {
        amendmentType: values.amendmentType,
        newUsers: values.newUsers,
        newExpiryDate: values.newExpiryDate?.toISOString(),
        newLicenceType: values.newLicenceType || undefined,
        invoiceReference: values.invoiceReference || undefined,
        notes: values.notes || undefined,
      });
      message.success('Licence amended successfully');
      setAmendModalOpen(false);
      amendForm.resetFields();
      await fetchData();

      // Prompt to generate a new offline file only for on-premises (Model C) customers
      const updatedLicence = licences.find((l) => l.id === amendLicence.id) || amendLicence;
      if (updatedLicence.deploymentModel === 'ON_PREMISES') {
        Modal.confirm({
          title: 'Generate new offline licence file?',
          content: (
            <div>
              <p>
                This on-premises licence has been amended. The customer will need a new
                offline licence file — the previous file still contains the old entitlement data.
              </p>
            </div>
          ),
          okText: 'Generate Offline File',
          cancelText: 'Skip',
          onOk: () => {
            openOfflineModal({
              ...updatedLicence,
              // Use latest values from the amendment
              licensedUsers: values.newUsers || updatedLicence.licensedUsers,
            });
          },
        });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to amend licence');
    } finally {
      setAmending(false);
    }
  };

  const openAmendHistory = async (licence: Licence) => {
    setAmendHistoryLicence(licence);
    setAmendHistoryOpen(true);
    setLoadingAmendments(true);
    try {
      const res = await api.get(`/admin/licences/${licence.id}/amendments`);
      setAmendments(res.data.data);
    } catch {
      message.error('Failed to load amendment history');
    } finally {
      setLoadingAmendments(false);
    }
  };

  // ─── Offline File Handlers ───

  const openOfflineModal = (licence: Licence) => {
    setOfflineModalLicence(licence);
    setOfflineResult(null);
    offlineForm.resetFields();
    offlineForm.setFieldsValue({ validityDays: 90 });
    setOfflineModalOpen(true);
  };

  const handleGenerateOffline = async (values: any) => {
    if (!offlineModalLicence) return;
    setGeneratingOffline(true);
    try {
      const res = await api.post(`/admin/licences/${offlineModalLicence.id}/offline-file`, {
        validityDays: values.validityDays,
        instanceId: values.instanceId || undefined,
        notes: values.notes || undefined,
      });
      setOfflineResult(res.data);
      message.success('Offline licence file generated');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to generate offline file');
    } finally {
      setGeneratingOffline(false);
    }
  };

  const downloadOfflineFile = () => {
    if (!offlineResult || !offlineModalLicence) return;

    const fileContent = JSON.stringify({
      payload: JSON.parse(offlineResult.file.payload),
      signature: offlineResult.file.signature,
      fileHash: offlineResult.file.fileHash,
    }, null, 2);

    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const customerSlug = (offlineModalLicence.customer?.name ?? 'licence')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `procuro-offline-${customerSlug}-${dayjs().format('YYYYMMDD')}.lic`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openHistoryModal = async (licence: Licence) => {
    setHistoryLicence(licence);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/admin/licences/${licence.id}/offline-files`);
      setOfflineFiles(res.data.data);
    } catch {
      message.error('Failed to load offline file history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // ─── Table Columns ───

  const columns = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_: unknown, r: Licence) => r.customer?.name ?? '—',
      sorter: (a: Licence, b: Licence) => (a.customer?.name ?? '').localeCompare(b.customer?.name ?? ''),
    },
    {
      title: 'Type',
      key: 'licenceType',
      render: (_: unknown, r: Licence) => {
        const info = licenceTypeLabels[r.licenceType];
        return info ? <Tag color={info.colour}>{info.label}</Tag> : '—';
      },
      filters: [
        { text: 'Per User', value: 'PER_USER' },
        { text: 'Concurrent', value: 'CONCURRENT' },
      ],
      onFilter: (value: any, record: Licence) => record.licenceType === value,
    },
    {
      title: 'Deployment',
      key: 'deploymentModel',
      render: (_: unknown, r: Licence) => {
        const model = r.deploymentModel;
        const info = deploymentModelLabels[model];
        return info ? <Tag color={info.colour}>{info.label}</Tag> : '—';
      },
      filters: [
        { text: 'SaaS', value: 'SAAS' },
        { text: 'Hybrid', value: 'HYBRID' },
        { text: 'On-Premises', value: 'ON_PREMISES' },
      ],
      onFilter: (value: any, record: Licence) => record.deploymentModel === value,
    },
    {
      title: 'Limit',
      key: 'licensedUsers',
      render: (_: unknown, r: Licence) => (
        <Tooltip title={r.licenceType === 'CONCURRENT' ? 'Max simultaneous sessions' : 'Max active user accounts'}>
          <span>{r.licensedUsers} {r.licenceType === 'CONCURRENT' ? 'sessions' : 'users'}</span>
        </Tooltip>
      ),
      sorter: (a: Licence, b: Licence) => a.licensedUsers - b.licensedUsers,
    },
    {
      title: 'Invoice Ref',
      dataIndex: 'invoiceReference',
      key: 'invoiceReference',
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Expiry Date',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      render: (v: string) => {
        const d = new Date(v);
        const isExpired = d < new Date();
        return <Text type={isExpired ? 'danger' : undefined}>{d.toLocaleDateString('en-GB')}</Text>;
      },
      sorter: (a: Licence, b: Licence) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: LicenceStatus) => <Tag color={statusColours[s]}>{s}</Tag>,
      filters: Object.keys(statusColours).map((k) => ({ text: k, value: k })),
      onFilter: (value: any, record: Licence) => record.status === value,
    },
    {
      title: 'Instances',
      key: 'instances',
      render: (_: unknown, r: Licence) => r._count?.instances ?? 0,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 320,
      render: (_: unknown, r: Licence) => (
        <Space size="small">
          {r.status === 'ACTIVE' && (
            <>
              <Tooltip title="Amend Licence (add users, renew)">
                <Button size="small" icon={<EditOutlined />} onClick={() => openAmendModal(r)}>
                  Amend
                </Button>
              </Tooltip>
              {r.deploymentModel === 'ON_PREMISES' && (
                <Tooltip title="Generate Offline Licence File">
                  <Button size="small" icon={<FileProtectOutlined />} onClick={() => openOfflineModal(r)}>
                    Offline
                  </Button>
                </Tooltip>
              )}
              <Popconfirm
                title="Revoke this licence?"
                description="The customer will enter read-only mode after the grace period."
                onConfirm={() => handleRevoke(r.id)}
                okText="Revoke"
                okType="danger"
              >
                <Button size="small" danger icon={<StopOutlined />}>Revoke</Button>
              </Popconfirm>
            </>
          )}
          <Tooltip title="View Amendment & Offline File History">
            <Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => openAmendHistory(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const amendmentType = Form.useWatch('amendmentType', amendForm);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Licences</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Issue New Licence
        </Button>
      </div>

      <Card>
        <Table
          dataSource={licences}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      {/* ─── Create Licence Modal ─── */}
      <Modal
        title="Issue New Licence"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
            <Select placeholder="Select customer" showSearch optionFilterProp="label"
              options={customers.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item
            name="licenceType"
            label="Licence Type"
            rules={[{ required: true }]}
            initialValue="PER_USER"
            extra="Per User: each user account needs a licence slot. Concurrent: limits simultaneous sessions only (for upgrade customers transitioning from V4)."
          >
            <Select options={[
              { label: 'Per User (new customers)', value: 'PER_USER' },
              { label: 'Concurrent (upgrade customers)', value: 'CONCURRENT' },
            ]} />
          </Form.Item>
          <Form.Item
            name="licensedUsers"
            label={Form.useWatch('licenceType', form) === 'CONCURRENT' ? 'Max Concurrent Sessions' : 'Licensed Users'}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={9999} keyboard controls style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiryDate" label="Expiry Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs())} />
          </Form.Item>
          <Form.Item
            name="gracePeriodDays"
            label="Grace Period (days)"
            initialValue={30}
            extra="How many days the instance can run without reaching the licence server before showing warnings."
          >
            <InputNumber min={1} max={365} keyboard controls style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="invoiceReference" label="Invoice Reference (FreeAgent)">
            <Input placeholder="e.g. INV-001234" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>Issue Licence</Button>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── New Key Display Modal ─── */}
      <Modal
        title="Licence Key Generated"
        open={!!newKeyModal}
        onOk={() => setNewKeyModal(null)}
        onCancel={() => setNewKeyModal(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Licence Key">
            <Space>
              <Text code copyable strong style={{ fontSize: 16 }}>{newKeyModal?.key}</Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
        <br />
        <Text type="warning">
          This key is shown only once. Copy it now and provide it to the customer.
          It cannot be retrieved later as it is stored as a hashed value.
        </Text>
      </Modal>

      {/* ─── Amend Licence Modal ─── */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Amend Licence — {amendLicence?.customer?.name}</span>
          </Space>
        }
        open={amendModalOpen}
        onCancel={() => { setAmendModalOpen(false); amendForm.resetFields(); }}
        footer={null}
        width={520}
      >
        {amendLicence && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Type">
                <Tag color={licenceTypeLabels[amendLicence.licenceType]?.colour}>
                  {licenceTypeLabels[amendLicence.licenceType]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={amendLicence.licenceType === 'CONCURRENT' ? 'Current Sessions' : 'Current Users'}>
                {amendLicence.licensedUsers}
              </Descriptions.Item>
              <Descriptions.Item label="Expiry">{new Date(amendLicence.expiryDate).toLocaleDateString('en-GB')}</Descriptions.Item>
              {amendLicence.invoiceReference && (
                <Descriptions.Item label="Original Invoice">
                  <Text code>{amendLicence.invoiceReference}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Form form={amendForm} layout="vertical" onFinish={handleAmend}>
              <Form.Item name="amendmentType" label="Amendment Type" rules={[{ required: true }]}>
                <Select options={[
                  { label: 'Add More Users / Sessions', value: 'USER_INCREASE' },
                  { label: 'Reduce Users / Sessions', value: 'USER_DECREASE' },
                  { label: 'Renewal', value: 'RENEWAL' },
                  { label: 'Extend Expiry', value: 'EXPIRY_EXTENSION' },
                  { label: 'Change Licence Type', value: 'TYPE_CHANGE' },
                ]} />
              </Form.Item>

              {amendmentType === 'TYPE_CHANGE' && (
                <Form.Item
                  name="newLicenceType"
                  label="New Licence Type"
                  rules={[{ required: true }]}
                  extra={
                    amendLicence.licenceType === 'CONCURRENT'
                      ? 'Switching to Per User will immediately enforce user limits — excess users will be locked out.'
                      : 'Switching to Concurrent will limit simultaneous sessions rather than user accounts.'
                  }
                >
                  <Select options={[
                    { label: 'Per User', value: 'PER_USER', disabled: amendLicence.licenceType === 'PER_USER' },
                    { label: 'Concurrent', value: 'CONCURRENT', disabled: amendLicence.licenceType === 'CONCURRENT' },
                  ]} />
                </Form.Item>
              )}

              {(amendmentType === 'USER_INCREASE' || amendmentType === 'USER_DECREASE' || amendmentType === 'RENEWAL' || amendmentType === 'TYPE_CHANGE') && (
                <Form.Item
                  name="newUsers"
                  label={amendmentType === 'TYPE_CHANGE' ? 'New Limit' : 'New User Count'}
                  rules={[{ required: amendmentType !== 'RENEWAL' && amendmentType !== 'TYPE_CHANGE' }]}
                  extra={
                    amendmentType === 'RENEWAL'
                      ? 'Optional — leave blank to keep the same user count.'
                      : amendmentType === 'TYPE_CHANGE'
                        ? 'Optional — leave blank to keep the same numeric limit.'
                        : undefined
                  }
                >
                  <InputNumber min={1} max={9999} keyboard controls style={{ width: '100%' }} placeholder={`Currently ${amendLicence.licensedUsers}`} />
                </Form.Item>
              )}

              {(amendmentType === 'RENEWAL' || amendmentType === 'EXPIRY_EXTENSION') && (
                <Form.Item name="newExpiryDate" label="New Expiry Date" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs())} />
                </Form.Item>
              )}

              <Form.Item
                name="invoiceReference"
                label="Invoice Reference (FreeAgent)"
                extra="The FreeAgent invoice number for this amendment."
              >
                <Input placeholder="e.g. INV-001567" />
              </Form.Item>

              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={2} placeholder="e.g. Customer purchased 10 additional user licences" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={amending}>Apply Amendment</Button>
                  <Button onClick={() => { setAmendModalOpen(false); amendForm.resetFields(); }}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* ─── Amendment History Modal ─── */}
      <Modal
        title={
          <Space>
            <HistoryOutlined />
            <span>Licence History — {amendHistoryLicence?.customer?.name}</span>
          </Space>
        }
        open={amendHistoryOpen}
        onCancel={() => setAmendHistoryOpen(false)}
        footer={<Button onClick={() => setAmendHistoryOpen(false)}>Close</Button>}
        width={600}
      >
        {amendHistoryLicence && (
          <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Current Users">{amendHistoryLicence.licensedUsers}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColours[amendHistoryLicence.status]}>{amendHistoryLicence.status}</Tag>
            </Descriptions.Item>
            {amendHistoryLicence.invoiceReference && (
              <Descriptions.Item label="Original Invoice" span={2}>
                <Text code>{amendHistoryLicence.invoiceReference}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}

        {loadingAmendments ? (
          <Text type="secondary">Loading...</Text>
        ) : amendments.length === 0 ? (
          <Text type="secondary">No amendments recorded for this licence.</Text>
        ) : (
          <Timeline
            items={amendments.map((a) => ({
              color: amendmentColours[a.amendmentType] || 'grey',
              children: (
                <div key={a.id}>
                  <Space>
                    <Tag color={amendmentColours[a.amendmentType]}>{amendmentLabels[a.amendmentType]}</Tag>
                    <Text type="secondary">{new Date(a.createdAt).toLocaleString('en-GB')}</Text>
                  </Space>
                  <div style={{ marginTop: 4 }}>
                    {a.amendmentType === 'TYPE_CHANGE' && a.previousType && a.newType ? (
                      <Text>
                        Type: {licenceTypeLabels[a.previousType]?.label} → {licenceTypeLabels[a.newType]?.label}
                        {a.previousUsers !== a.newUsers && ` · Limit: ${a.previousUsers} → ${a.newUsers}`}
                      </Text>
                    ) : (
                      <Text>Users: {a.previousUsers} → {a.newUsers}</Text>
                    )}
                    {a.invoiceReference && (
                      <span> · Invoice: <Text code>{a.invoiceReference}</Text></span>
                    )}
                  </div>
                  {a.notes && <div><Text type="secondary" style={{ fontSize: 12 }}>{a.notes}</Text></div>}
                </div>
              ),
            }))}
          />
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Button
            size="small"
            icon={<FileProtectOutlined />}
            onClick={() => {
              setAmendHistoryOpen(false);
              if (amendHistoryLicence) openHistoryModal(amendHistoryLicence);
            }}
          >
            View Offline File History
          </Button>
        </div>
      </Modal>

      {/* ─── Generate Offline File Modal ─── */}
      <Modal
        title={
          <Space>
            <FileProtectOutlined />
            <span>Generate Offline Licence File</span>
          </Space>
        }
        open={offlineModalOpen}
        onCancel={() => { setOfflineModalOpen(false); setOfflineResult(null); }}
        footer={offlineResult ? [
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={downloadOfflineFile}>
            Download .lic File
          </Button>,
          <Button key="close" onClick={() => { setOfflineModalOpen(false); setOfflineResult(null); }}>
            Close
          </Button>,
        ] : null}
        width={560}
      >
        {offlineModalLicence && !offlineResult && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Customer">{offlineModalLicence.customer?.name}</Descriptions.Item>
              <Descriptions.Item label="Licensed Users">{offlineModalLicence.licensedUsers}</Descriptions.Item>
              <Descriptions.Item label="Licence Expiry">
                {new Date(offlineModalLicence.expiryDate).toLocaleDateString('en-GB')}
              </Descriptions.Item>
            </Descriptions>

            <Form form={offlineForm} layout="vertical" onFinish={handleGenerateOffline}>
              <Form.Item
                name="validityDays"
                label="Validity Period (days)"
                rules={[{ required: true }]}
                extra="The offline file will expire after this many days, or when the licence expires — whichever is sooner."
              >
                <InputNumber min={1} max={365} keyboard controls style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="instanceId"
                label="Lock to Instance (optional)"
                extra="Enter a specific instance UUID to restrict this file to a single installation. Leave blank for any instance."
              >
                <Input placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={generatingOffline} icon={<FileProtectOutlined />}>
                  Generate Offline File
                </Button>
              </Form.Item>
            </Form>
          </>
        )}

        {offlineResult && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Customer">{offlineResult.data.customer}</Descriptions.Item>
              <Descriptions.Item label="Expires">
                {new Date(offlineResult.data.expiresAt).toLocaleDateString('en-GB')}
              </Descriptions.Item>
              <Descriptions.Item label="File Hash">
                <Text code copyable style={{ fontSize: 11 }}>{offlineResult.data.fileHash}</Text>
              </Descriptions.Item>
            </Descriptions>
            <br />
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              Click "Download .lic File" to save the signed offline licence file.
              Provide this file to the customer for installation on their air-gapped system.
              The file is cryptographically signed and tamper-proof.
            </Paragraph>
          </div>
        )}
      </Modal>

      {/* ─── Offline File History Modal ─── */}
      <Modal
        title={
          <Space>
            <HistoryOutlined />
            <span>Offline File History — {historyLicence?.customer?.name}</span>
          </Space>
        }
        open={historyModalOpen}
        onCancel={() => setHistoryModalOpen(false)}
        footer={<Button onClick={() => setHistoryModalOpen(false)}>Close</Button>}
        width={600}
      >
        <List
          loading={loadingHistory}
          dataSource={offlineFiles}
          locale={{ emptyText: 'No offline files have been generated for this licence.' }}
          renderItem={(item: OfflineFile) => {
            const isExpired = new Date(item.expiresAt) < new Date();
            return (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Text>Generated {new Date(item.issuedAt).toLocaleString('en-GB')}</Text>
                      {isExpired ? <Tag color="red">Expired</Tag> : <Tag color="green">Active</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary">
                        Expires: {new Date(item.expiresAt).toLocaleDateString('en-GB')}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Hash: {item.fileHash.substring(0, 16)}...
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Modal>
    </div>
  );
}
