import React, { useEffect, useState } from 'react';
import {
  Typography, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message,
  Card, Steps, Descriptions, Popconfirm, Drawer, Collapse, DatePicker, Checkbox, Tooltip,
  Dropdown, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, RocketOutlined, SettingOutlined, DeleteOutlined, CopyOutlined, DownOutlined, CloudOutlined, HomeOutlined, FileTextOutlined, PrinterOutlined, CodeOutlined, ArrowUpOutlined, PauseCircleOutlined, StopOutlined, PlayCircleOutlined, GithubOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';
import type { Customer, Deployment, DatabaseType, ConnectivityType, DeploymentStatus, TenantConfig } from '../types';

const { Title, Text } = Typography;

const statusColours: Record<DeploymentStatus, string> = {
  PROVISIONING: 'gold',
  ACTIVE: 'green',
  SUSPENDED: 'orange',
  DECOMMISSIONED: 'default',
};

const statusLabels: Record<DeploymentStatus, string> = {
  PROVISIONING: 'Pending Setup',
  ACTIVE: 'Running',
  SUSPENDED: 'Suspended',
  DECOMMISSIONED: 'Decommissioned',
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

// Azure SaaS defaults — our own infrastructure
const SAAS_DEFAULTS = {
  databaseType: 'POSTGRESQL' as DatabaseType,
  databaseHost: 'procuro-db.postgres.database.azure.com',
  databasePort: 5432,
  connectivityType: 'PRIVATE_LINK' as ConnectivityType,
};

// Azure Container Apps environment suffix — same for all apps in procuro-env
const AZURE_ENV_SUFFIX = 'grayriver-3c973afe.uksouth.azurecontainerapps.io';

// Latest deployed V5 application image tag — update with each release
const LATEST_V5_IMAGE_TAG = 'build25';

// Pro-curo V5 GitHub repository
const V5_GITHUB_URL = 'https://github.com/markwalker-pcs/procuro-v5';

// Azure Container Registry
const ACR_SERVER = 'procuroacr-eshnbwa0fvfshzg0.azurecr.io';
const RESOURCE_GROUP = 'procuro-production';
const CONTAINER_ENV = 'procuro-env';
const DB_SERVER_NAME = 'procuro-db';

// V5 application image names in ACR
const V5_BACKEND_IMAGE = 'procurov5-backend';
const V5_FRONTEND_IMAGE = 'procurov5-frontend';

/**
 * Generate an acronym from a company/organisation name.
 * Takes the first letter of each significant word, lowercased.
 * Strips common suffixes (Ltd, Limited, Inc, PLC, LLP, etc.)
 * e.g. "Cambridge University Centre for Trophoblast Research" → "cuctr"
 */
function generateAcronym(name: string): string {
  const stopWords = new Set(['for', 'of', 'the', 'and', 'in', 'at', 'by', 'to', 'a', 'an']);
  const suffixes = new Set(['ltd', 'limited', 'inc', 'incorporated', 'plc', 'llp', 'llc', 'corp', 'corporation', 'co', 'company']);

  const words = name
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .filter(w => !suffixes.has(w.toLowerCase()));

  const acronym = words
    .filter(w => !stopWords.has(w.toLowerCase()))
    .map(w => w[0].toLowerCase())
    .join('');

  return acronym || name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
}

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
  const [deploymentType, setDeploymentType] = useState<'SAAS' | 'HYBRID' | null>(null);
  const [customerAcronym, setCustomerAcronym] = useState<string>('');

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

  // Pre-provisioning brief state
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [briefCustomer, setBriefCustomer] = useState<Customer | null>(null);
  const [briefAcronym, setBriefAcronym] = useState('');
  const [briefType, setBriefType] = useState<'SAAS' | 'HYBRID' | null>(null);

  // Setup scripts state (post-provisioning)
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [setupDeployment, setSetupDeployment] = useState<Deployment | null>(null);

  // Upgrade state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeDeployment, setUpgradeDeployment] = useState<Deployment | null>(null);
  const [upgradeImageTag, setUpgradeImageTag] = useState('');
  const [upgradeV5BuildId, setUpgradeV5BuildId] = useState('');
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);

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

  const handleCustomerSelected = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);

    if (customer) {
      const isSaas = customer.deploymentModel === 'SAAS';
      setDeploymentType(isSaas ? 'SAAS' : 'HYBRID');

      const acronym = generateAcronym(customer.name);
      setCustomerAcronym(acronym);

      const appName = acronym ? `procuro-${acronym}-backend` : '';

      if (isSaas) {
        // Auto-populate SaaS defaults — our Azure infrastructure
        form.setFieldsValue({
          databaseType: SAAS_DEFAULTS.databaseType,
          databaseHost: SAAS_DEFAULTS.databaseHost,
          databasePort: SAAS_DEFAULTS.databasePort,
          databaseName: acronym ? `${acronym}_procuro` : '',
          connectivityType: SAAS_DEFAULTS.connectivityType,
          deploymentLabel: `${customer.name} Production`,
          containerAppName: appName,
          containerAppUrl: '',
          customDomain: acronym ? `${acronym}.app.pro-curo.com` : '',
          imageTag: LATEST_V5_IMAGE_TAG,
        });
      } else {
        // Hybrid / On-Premises — suggest naming but leave DB config blank
        form.setFieldsValue({
          databaseType: undefined,
          databaseHost: undefined,
          databasePort: undefined,
          databaseName: acronym ? `${acronym}_procuro` : '',
          connectivityType: undefined,
          deploymentLabel: `${customer.name} Production`,
          containerAppName: appName,
          containerAppUrl: '',
          customDomain: acronym ? `${acronym}.app.pro-curo.com` : '',
          imageTag: LATEST_V5_IMAGE_TAG,
        });
      }
    }
  };

  // Field names per wizard step — used for per-step validation
  const createStepFields: string[][] = [
    ['customerId'],
    ['databaseType', 'databaseHost', 'databasePort', 'databaseName', 'connectivityType'],
    ['deploymentLabel', 'containerAppName', 'customDomain', 'containerAppUrl', 'imageTag', 'v5BuildId', 'notes'],
    [], // Review step — no validation needed
  ];

  const handleCreateNext = async () => {
    try {
      await form.validateFields(createStepFields[currentStep]);
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
      setDeploymentType(null);
      setCustomerAcronym('');
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
      customDomain: deployment.customDomain,
      containerAppUrl: deployment.containerAppUrl,
      imageTag: deployment.imageTag,
      v5BuildId: deployment.v5BuildId,
      notes: deployment.notes,
    });
    setEditModalOpen(true);
  };

  const editStepFields: string[][] = [
    ['customerId'],
    ['databaseType', 'databaseHost', 'databasePort', 'databaseName', 'connectivityType'],
    ['deploymentLabel', 'containerAppName', 'customDomain', 'containerAppUrl', 'imageTag', 'v5BuildId', 'notes'],
    [],
  ];

  const handleEditNext = async () => {
    try {
      const values = await editForm.validateFields(editStepFields[editStep]);
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

  const handleBriefCustomerSelected = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setBriefCustomer(customer || null);
    if (customer) {
      const isSaas = customer.deploymentModel === 'SAAS';
      setBriefType(isSaas ? 'SAAS' : 'HYBRID');
      setBriefAcronym(generateAcronym(customer.name));
    } else {
      setBriefType(null);
      setBriefAcronym('');
    }
  };

  const generateBriefScript = (): string => {
    if (!briefCustomer || !briefAcronym) return '';

    const dbName = `${briefAcronym}_procuro`;
    const appName = `procuro-${briefAcronym}-backend`;
    const domain = `${briefAcronym}.app.pro-curo.com`;
    const appUrl = `https://${appName}.${AZURE_ENV_SUFFIX}`;
    const isSaas = briefType === 'SAAS';

    const lines: string[] = [];
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push(`# PRO-CURO V5 — Pre-Provisioning Setup Script`);
    lines.push(`# Customer: ${briefCustomer.name}`);
    lines.push(`# Customer No: ${briefCustomer.customerNumber}`);
    lines.push(`# Deployment Type: ${isSaas ? 'SaaS (Pro-curo Azure)' : 'Hybrid (Client Infrastructure)'}`);
    lines.push(`# Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push('');
    lines.push(`# RESOURCE NAMING SUMMARY`);
    lines.push(`# ───────────────────────`);
    lines.push(`# Acronym:            ${briefAcronym}`);
    lines.push(`# Database Name:      ${dbName}`);
    lines.push(`# Container App:      ${appName}`);
    lines.push(`# Custom Domain:      ${domain}`);
    lines.push(`# Container App URL:  ${appUrl}`);
    lines.push(`# Image Tag:          ${LATEST_V5_IMAGE_TAG}`);
    lines.push('');

    if (isSaas) {
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 1: Create the Customer Database`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az postgres flexible-server db create \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --server-name ${DB_SERVER_NAME} \\`);
      lines.push(`  --database-name ${dbName}`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 2: Create the Backend Container App`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp create \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --image ${ACR_SERVER}/${V5_BACKEND_IMAGE}:${LATEST_V5_IMAGE_TAG} \\`);
      lines.push(`  --registry-server ${ACR_SERVER} \\`);
      lines.push(`  --registry-username procuroacr \\`);
      lines.push(`  --registry-password <ACR_PASSWORD> \\`);
      lines.push(`  --target-port 3100 \\`);
      lines.push(`  --ingress external \\`);
      lines.push(`  --min-replicas 1 --max-replicas 1 \\`);
      lines.push(`  --cpu 0.5 --memory 1Gi`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 2b: Create the Frontend Container App`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp create \\`);
      lines.push(`  --name ${appName.replace('-backend', '-frontend')} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --image ${ACR_SERVER}/${V5_FRONTEND_IMAGE}:${LATEST_V5_IMAGE_TAG} \\`);
      lines.push(`  --registry-server ${ACR_SERVER} \\`);
      lines.push(`  --registry-username procuroacr \\`);
      lines.push(`  --registry-password <ACR_PASSWORD> \\`);
      lines.push(`  --target-port 80 \\`);
      lines.push(`  --ingress external \\`);
      lines.push(`  --min-replicas 1 --max-replicas 1 \\`);
      lines.push(`  --cpu 0.25 --memory 0.5Gi \\`);
      lines.push(`  --env-vars BACKEND_URL="https://${appName}.${AZURE_ENV_SUFFIX}"`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 3: Set Backend Environment Variables`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# Generate secrets first:`);
      lines.push(`#   JWT_SECRET:         openssl rand -hex 32`);
      lines.push(`#   LICENCE_INSTANCE_ID: uuidgen`);
      lines.push('');
      lines.push(`az containerapp update \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --set-env-vars \\`);
      lines.push(`    DATABASE_URL="postgresql://<USER>:<PASSWORD>@${SAAS_DEFAULTS.databaseHost}:5432/${dbName}" \\`);
      lines.push(`    NODE_ENV=production \\`);
      lines.push(`    PORT=3100 \\`);
      lines.push(`    JWT_SECRET="<GENERATED_JWT_SECRET>" \\`);
      lines.push(`    CORS_ORIGIN="https://${domain}" \\`);
      lines.push(`    LICENCE_SERVER_URL="https://procuro-licence-server.${AZURE_ENV_SUFFIX}" \\`);
      lines.push(`    LICENCE_KEY="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_HMAC_SECRET="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_INSTANCE_ID="<GENERATED_UUID>" \\`);
      lines.push(`    LICENCE_ENABLED=true`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 4: Configure Custom Domain & SSL`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# First: add a CNAME record in DNS pointing ${domain} to:`);
      lines.push(`#   ${appName}.${AZURE_ENV_SUFFIX}`);
      lines.push('');
      lines.push(`az containerapp hostname add \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --hostname ${domain}`);
      lines.push('');
      lines.push(`az containerapp hostname bind \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --hostname ${domain} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --validation-method CNAME`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 5: Run Database Migration`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp exec \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --command "npx prisma migrate deploy"`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# DONE — Now go to the Admin Portal → Deployments → Provision`);
      lines.push(`# Select: ${briefCustomer.name}`);
      lines.push(`# All fields will auto-populate. Confirm the Container App URL:`);
      lines.push(`#   ${appUrl}`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    } else {
      // Hybrid
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# HYBRID DEPLOYMENT — Client Database`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# The database is managed by the client. Before proceeding, confirm:`);
      lines.push(`#   - Database platform (PostgreSQL recommended)`);
      lines.push(`#   - Database host & port`);
      lines.push(`#   - Database credentials (service account)`);
      lines.push(`#   - Connectivity method (Private Link, VPN, ExpressRoute, or Public)`);
      lines.push(`#   - Firewall / IP whitelisting requirements`);
      lines.push(`#   - SSL/TLS requirements`);
      lines.push(`# See DOC-024 (Hybrid Deployment Technical Reference) for details.`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 1: Create the Backend Container App (on our Azure)`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp create \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --image ${ACR_SERVER}/${V5_BACKEND_IMAGE}:${LATEST_V5_IMAGE_TAG} \\`);
      lines.push(`  --registry-server ${ACR_SERVER} \\`);
      lines.push(`  --registry-username procuroacr \\`);
      lines.push(`  --registry-password <ACR_PASSWORD> \\`);
      lines.push(`  --target-port 3100 \\`);
      lines.push(`  --ingress external \\`);
      lines.push(`  --min-replicas 1 --max-replicas 1 \\`);
      lines.push(`  --cpu 0.5 --memory 1Gi`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 1b: Create the Frontend Container App`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp create \\`);
      lines.push(`  --name ${appName.replace('-backend', '-frontend')} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --image ${ACR_SERVER}/${V5_FRONTEND_IMAGE}:${LATEST_V5_IMAGE_TAG} \\`);
      lines.push(`  --registry-server ${ACR_SERVER} \\`);
      lines.push(`  --registry-username procuroacr \\`);
      lines.push(`  --registry-password <ACR_PASSWORD> \\`);
      lines.push(`  --target-port 80 \\`);
      lines.push(`  --ingress external \\`);
      lines.push(`  --min-replicas 1 --max-replicas 1 \\`);
      lines.push(`  --cpu 0.25 --memory 0.5Gi \\`);
      lines.push(`  --env-vars BACKEND_URL="https://${appName}.${AZURE_ENV_SUFFIX}"`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 2: Verify Connectivity to Client Database`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# Replace <CLIENT_DB_URL> with the client's connection string`);
      lines.push('');
      lines.push(`az containerapp update \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --set-env-vars DATABASE_URL="<CLIENT_DB_URL>"`);
      lines.push('');
      lines.push(`az containerapp exec \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --command "node -e \\"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\\\\\\$connect().then(()=>{console.log('Connected');p.\\\\\\$disconnect()}).catch(e=>console.error(e))\\""`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 3: Set Environment Variables (once connectivity confirmed)`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# Generate secrets first:`);
      lines.push(`#   JWT_SECRET:         openssl rand -hex 32`);
      lines.push(`#   LICENCE_INSTANCE_ID: uuidgen`);
      lines.push('');
      lines.push(`az containerapp update \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --set-env-vars \\`);
      lines.push(`    DATABASE_URL="<CLIENT_DB_URL>" \\`);
      lines.push(`    NODE_ENV=production \\`);
      lines.push(`    PORT=3100 \\`);
      lines.push(`    JWT_SECRET="<GENERATED_JWT_SECRET>" \\`);
      lines.push(`    CORS_ORIGIN="https://${domain}" \\`);
      lines.push(`    LICENCE_SERVER_URL="https://procuro-licence-server.${AZURE_ENV_SUFFIX}" \\`);
      lines.push(`    LICENCE_KEY="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_HMAC_SECRET="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_INSTANCE_ID="<GENERATED_UUID>" \\`);
      lines.push(`    LICENCE_ENABLED=true`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 4: Configure Custom Domain & SSL`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# First: add a CNAME record in DNS pointing ${domain} to:`);
      lines.push(`#   ${appName}.${AZURE_ENV_SUFFIX}`);
      lines.push('');
      lines.push(`az containerapp hostname add \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --hostname ${domain}`);
      lines.push('');
      lines.push(`az containerapp hostname bind \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --hostname ${domain} \\`);
      lines.push(`  --environment ${CONTAINER_ENV} \\`);
      lines.push(`  --validation-method CNAME`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# STEP 5: Run Database Migration`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push('');
      lines.push(`az containerapp exec \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --command "npx prisma migrate deploy"`);
      lines.push('');
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
      lines.push(`# DONE — Now go to the Admin Portal → Deployments → Provision`);
      lines.push(`# Select: ${briefCustomer.name}`);
      lines.push(`# Enter the client's database details in the wizard.`);
      lines.push(`# Confirm the Container App URL:`);
      lines.push(`#   ${appUrl}`);
      lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    }

    return lines.join('\n');
  };

  const handleCopyBrief = () => {
    const script = generateBriefScript();
    navigator.clipboard.writeText(script).then(() => {
      message.success('Setup script copied to clipboard');
    }).catch(() => {
      message.error('Failed to copy — please select and copy manually');
    });
  };

  const handlePrintBrief = () => {
    const script = generateBriefScript();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Pre-Provisioning Brief — ${briefCustomer?.name || ''}</title><style>
        body { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; line-height: 1.5; padding: 24px; white-space: pre-wrap; }
        @media print { body { font-size: 10px; } }
      </style></head><body>${script.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // ─── Setup Scripts Generator (post-provisioning) ───
  const generateSetupScript = (deployment: Deployment): string => {
    const lines: string[] = [];
    const appName = deployment.containerAppName || 'procuro-UNKNOWN-backend';
    const dbName = deployment.databaseName || 'UNKNOWN_procuro';
    const domain = deployment.customDomain || 'UNKNOWN.app.pro-curo.com';
    const dbHost = deployment.databaseHost || 'procuro-db.postgres.database.azure.com';
    const isSaas = deployment.customer?.deploymentModel === 'SAAS';

    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push(`# PRO-CURO V5 — Post-Provisioning Setup Script`);
    lines.push(`# Customer: ${deployment.customer?.name || 'Unknown'}`);
    lines.push(`# Deployment: ${deployment.deploymentLabel}`);
    lines.push(`# Container App: ${appName}`);
    lines.push(`# Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push('');

    lines.push(`# ─── STEP 1: Set Environment Variables ─────────────────────────────`);
    lines.push(`# Generate secrets first:`);
    lines.push(`#   JWT_SECRET:          openssl rand -hex 32`);
    lines.push(`#   LICENCE_INSTANCE_ID: uuidgen`);
    lines.push('');

    if (isSaas) {
      lines.push(`az containerapp update \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --set-env-vars \\`);
      lines.push(`    DATABASE_URL="postgresql://<USER>:<PASSWORD>@${dbHost}:${deployment.databasePort || 5432}/${dbName}?sslmode=require" \\`);
      lines.push(`    NODE_ENV=production \\`);
      lines.push(`    PORT=3100 \\`);
      lines.push(`    JWT_SECRET="<GENERATED_JWT_SECRET>" \\`);
      lines.push(`    CORS_ORIGIN="https://${domain}" \\`);
      lines.push(`    LICENCE_SERVER_URL="https://procuro-licence-server.${AZURE_ENV_SUFFIX}" \\`);
      lines.push(`    LICENCE_KEY="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_HMAC_SECRET="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_INSTANCE_ID="<GENERATED_UUID>" \\`);
      lines.push(`    LICENCE_ENABLED=true`);
    } else {
      lines.push(`az containerapp update \\`);
      lines.push(`  --name ${appName} \\`);
      lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
      lines.push(`  --set-env-vars \\`);
      lines.push(`    DATABASE_URL="<CLIENT_DATABASE_URL>" \\`);
      lines.push(`    NODE_ENV=production \\`);
      lines.push(`    PORT=3100 \\`);
      lines.push(`    JWT_SECRET="<GENERATED_JWT_SECRET>" \\`);
      lines.push(`    CORS_ORIGIN="https://${domain}" \\`);
      lines.push(`    LICENCE_SERVER_URL="https://procuro-licence-server.${AZURE_ENV_SUFFIX}" \\`);
      lines.push(`    LICENCE_KEY="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_HMAC_SECRET="<FROM_LICENCE_SERVER>" \\`);
      lines.push(`    LICENCE_INSTANCE_ID="<GENERATED_UUID>" \\`);
      lines.push(`    LICENCE_ENABLED=true`);
    }

    lines.push('');
    lines.push(`# ─── STEP 2: Run Database Migration ────────────────────────────────`);
    lines.push('');
    lines.push(`az containerapp exec \\`);
    lines.push(`  --name ${appName} \\`);
    lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
    lines.push(`  --command "npx prisma migrate deploy"`);

    lines.push('');
    lines.push(`# ─── STEP 3: Verify Deployment ─────────────────────────────────────`);
    lines.push('');
    if (deployment.containerAppUrl) {
      lines.push(`# Health check:`);
      lines.push(`curl -s ${deployment.containerAppUrl}/api/health | jq .`);
    } else {
      lines.push(`# Health check (replace with actual Container App URL):`);
      lines.push(`curl -s https://${appName}.${AZURE_ENV_SUFFIX}/api/health | jq .`);
    }
    if (domain) {
      lines.push('');
      lines.push(`# Custom domain check:`);
      lines.push(`curl -s https://${domain}/api/health | jq .`);
    }

    lines.push('');
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push(`# Once verified, return to the Admin Portal and mark as Active.`);
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);

    return lines.join('\n');
  };

  const handleCopySetupScript = (deployment: Deployment) => {
    const script = generateSetupScript(deployment);
    navigator.clipboard.writeText(script).then(() => {
      message.success('Setup script copied to clipboard');
    }).catch(() => {
      message.error('Failed to copy — please select and copy manually');
    });
  };

  // ─── Upgrade Script Generator ───
  const generateUpgradeScript = (deployment: Deployment, newTag: string): string => {
    const appName = deployment.containerAppName || 'procuro-UNKNOWN-backend';
    const lines: string[] = [];

    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push(`# PRO-CURO V5 — Upgrade Script`);
    lines.push(`# Customer: ${deployment.customer?.name || 'Unknown'}`);
    lines.push(`# Deployment: ${deployment.deploymentLabel}`);
    lines.push(`# Upgrading: ${deployment.imageTag || 'unknown'} → ${newTag}`);
    lines.push(`# Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push('');

    const frontendAppName = appName.replace('-backend', '-frontend');

    lines.push(`# ─── STEP 1: Build Updated Images in ACR ───────────────────────────`);
    lines.push(`# Run from Azure Cloud Shell after pulling latest source`);
    lines.push('');
    lines.push(`cd ~/procuro-v5/v5-source`);
    lines.push(`git pull`);
    lines.push('');
    lines.push(`az acr build --registry procuroacr --image ${V5_BACKEND_IMAGE}:${newTag} --file backend/Dockerfile ./backend`);
    lines.push(`az acr build --registry procuroacr --image ${V5_FRONTEND_IMAGE}:${newTag} --file frontend/Dockerfile ./frontend`);

    lines.push('');
    lines.push(`# ─── STEP 2: Update Container Apps ─────────────────────────────────`);
    lines.push('');
    lines.push(`az containerapp update \\`);
    lines.push(`  --name ${appName} \\`);
    lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
    lines.push(`  --image ${ACR_SERVER}/${V5_BACKEND_IMAGE}:${newTag}`);
    lines.push('');
    lines.push(`az containerapp update \\`);
    lines.push(`  --name ${frontendAppName} \\`);
    lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
    lines.push(`  --image ${ACR_SERVER}/${V5_FRONTEND_IMAGE}:${newTag}`);

    lines.push('');
    lines.push(`# ─── STEP 3: Run Database Migration (if schema changes) ─────────────`);
    lines.push('');
    lines.push(`az containerapp exec \\`);
    lines.push(`  --name ${appName} \\`);
    lines.push(`  --resource-group ${RESOURCE_GROUP} \\`);
    lines.push(`  --command "npx prisma migrate deploy"`);

    lines.push('');
    lines.push(`# ─── STEP 4: Verify Upgrade ─────────────────────────────────────────`);
    lines.push('');
    if (deployment.containerAppUrl) {
      lines.push(`curl -s ${deployment.containerAppUrl}/api/health | jq .`);
    } else {
      lines.push(`curl -s https://${appName}.${AZURE_ENV_SUFFIX}/api/health | jq .`);
    }
    lines.push(`# Confirm the build ID shows: PCSv5 build matching ${newTag}`);

    lines.push('');
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);
    lines.push(`# Once verified, the deployment record has been updated automatically.`);
    lines.push(`# ═══════════════════════════════════════════════════════════════════`);

    return lines.join('\n');
  };

  const handleUpgradeSubmit = async () => {
    if (!upgradeDeployment || !upgradeImageTag) return;
    setUpgradeSubmitting(true);
    try {
      const updateData: Record<string, string> = { imageTag: upgradeImageTag };
      if (upgradeV5BuildId) {
        updateData.v5BuildId = upgradeV5BuildId;
      }
      await api.patch(`/admin/deployments/${upgradeDeployment.id}`, updateData);

      // Copy the upgrade script to clipboard
      const script = generateUpgradeScript(upgradeDeployment, upgradeImageTag);
      navigator.clipboard.writeText(script).then(() => {
        message.success('Upgrade recorded and script copied to clipboard');
      }).catch(() => {
        message.success('Upgrade recorded — copy the script manually from below');
      });

      fetchDeployments();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to record upgrade');
    } finally {
      setUpgradeSubmitting(false);
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
      render: (status: DeploymentStatus, record: Deployment) => {
        if (status === 'ACTIVE' && (record.v5BuildId || record.imageTag)) {
          return (
            <Tooltip title={record.v5BuildId ? `Image: ${record.imageTag || '—'}` : 'Running'}>
              <Tag color="green" icon={<PlayCircleOutlined />}>
                {record.v5BuildId || record.imageTag}
              </Tag>
            </Tooltip>
          );
        }
        return <Tag color={statusColours[status]}>{statusLabels[status]}</Tag>;
      },
      filters: [
        { text: 'Pending Setup', value: 'PROVISIONING' },
        { text: 'Running', value: 'ACTIVE' },
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
      title: 'Domain',
      dataIndex: 'customDomain',
      key: 'customDomain',
      render: (domain: string | null) => (
        domain ? <Text style={{ fontSize: 12 }}>{domain}</Text> : <Text type="secondary">—</Text>
      ),
    },
    {
      title: 'V5 Build',
      key: 'v5BuildId',
      render: (_: unknown, record: Deployment) => (
        <div>
          {record.v5BuildId ? (
            <Text code style={{ fontSize: 12 }}>{record.v5BuildId}</Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )}
          {record.imageTag && (
            <div><Text type="secondary" style={{ fontSize: 11 }}>tag: {record.imageTag}</Text></div>
          )}
        </div>
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
      width: 220,
      render: (_: unknown, record: Deployment) => {
        const menuItems: any[] = [];

        // Setup Scripts — available for PROVISIONING deployments
        if (record.status === 'PROVISIONING') {
          menuItems.push({
            key: 'setup',
            icon: <CodeOutlined />,
            label: 'Setup Scripts',
            onClick: () => {
              setSetupDeployment(record);
              setSetupDrawerOpen(true);
            },
          });
          menuItems.push({
            key: 'activate',
            icon: <PlayCircleOutlined />,
            label: 'Mark as Running',
            onClick: () => handleStatusChange(record.id, 'ACTIVE'),
          });
        }

        // Upgrade — available for ACTIVE deployments
        if (record.status === 'ACTIVE') {
          menuItems.push({
            key: 'upgrade',
            icon: <ArrowUpOutlined />,
            label: 'Provision Upgrade',
            onClick: () => {
              setUpgradeDeployment(record);
              setUpgradeImageTag('');
              setUpgradeV5BuildId('');
              setUpgradeModalOpen(true);
            },
          });
          menuItems.push({
            key: 'setup-active',
            icon: <CodeOutlined />,
            label: 'Setup Scripts',
            onClick: () => {
              setSetupDeployment(record);
              setSetupDrawerOpen(true);
            },
          });
          menuItems.push({
            key: 'suspend',
            icon: <PauseCircleOutlined />,
            label: 'Suspend',
            onClick: () => handleStatusChange(record.id, 'SUSPENDED'),
          });
        }

        // Suspended — can reactivate or decommission
        if (record.status === 'SUSPENDED') {
          menuItems.push({
            key: 'reactivate',
            icon: <PlayCircleOutlined />,
            label: 'Reactivate',
            onClick: () => handleStatusChange(record.id, 'ACTIVE'),
          });
          menuItems.push({
            key: 'decommission',
            icon: <StopOutlined />,
            label: 'Decommission',
            danger: true,
            onClick: () => handleStatusChange(record.id, 'DECOMMISSIONED'),
          });
        }

        // Always available unless decommissioned
        if (record.status !== 'DECOMMISSIONED') {
          menuItems.push({ type: 'divider' });
          menuItems.push({
            key: 'decommission-final',
            icon: <StopOutlined />,
            label: 'Decommission',
            danger: true,
            onClick: () => handleStatusChange(record.id, 'DECOMMISSIONED'),
          });
        }

        return (
          <Space size="small">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              title="Edit deployment"
            />
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => handleOpenConfigDrawer(record)}
              title="Tenant configuration"
            />
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
            >
              <Button
                type="text"
                loading={statusChangeLoading === record.id}
              >
                Actions <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const createModalSteps = [
    {
      title: 'Customer',
      content: (
        <Form form={form} layout="vertical">
          <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select a customer' }]}>
            <Select
              placeholder="Select customer"
              showSearch
              optionFilterProp="children"
              onChange={handleCustomerSelected}
            >
              {customers.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.customerNumber})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {selectedCustomer && (
            <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 8 }}>
                <Tag
                  color={deploymentType === 'SAAS' ? 'blue' : 'purple'}
                  icon={deploymentType === 'SAAS' ? <CloudOutlined /> : <HomeOutlined />}
                  style={{ fontSize: 13, padding: '2px 10px' }}
                >
                  {deploymentType === 'SAAS' ? 'SaaS — Pro-curo Azure' : selectedCustomer.deploymentModel === 'ON_PREMISES' ? 'On-Premises — Client Infrastructure' : 'Hybrid — Client Database'}
                </Tag>
              </div>
              {deploymentType === 'SAAS' && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Database, connectivity, and application settings will be pre-filled with our standard Azure configuration.
                </Text>
              )}
              {deploymentType === 'HYBRID' && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  You will need to configure the client's database connection and connectivity details in the next step.
                </Text>
              )}
              {customerAcronym && (
                <div style={{ marginTop: 8 }}>
                  <Text strong>Generated Acronym:</Text> <Text code>{customerAcronym}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>(used for database, domain &amp; container naming)</Text>
                </div>
              )}
            </div>
          )}
        </Form>
      ),
    },
    {
      title: 'Database',
      content: (
        <Form form={form} layout="vertical">
          {deploymentType === 'SAAS' && (
            <Alert
              message="SaaS Deployment — Azure Defaults Applied"
              description="Database configuration has been pre-filled with our standard Azure setup. You can adjust values if needed."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item name="databaseType" label="Database Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select database type"
              onChange={(value) => handleDatabaseTypeChange(value, false)}
              disabled={deploymentType === 'SAAS'}
            >
              <Select.Option value="POSTGRESQL">PostgreSQL</Select.Option>
              <Select.Option value="SQLSERVER">SQL Server</Select.Option>
              <Select.Option value="MYSQL">MySQL</Select.Option>
              <Select.Option value="MARIADB">MariaDB</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="databaseHost" label="Database Host" rules={[{ required: true }]}>
            <Input
              placeholder="e.g. procuro-db.postgres.database.azure.com"
              disabled={deploymentType === 'SAAS'}
            />
          </Form.Item>
          <Form.Item name="databasePort" label="Database Port" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} disabled={deploymentType === 'SAAS'} />
          </Form.Item>
          <Form.Item name="databaseName" label="Database Name" rules={[{ required: true }]}>
            <Input placeholder={customerAcronym ? `e.g. ${customerAcronym}_procuro` : 'e.g. acme_procuro'} />
          </Form.Item>
          <Form.Item name="connectivityType" label="Connectivity Type" rules={[{ required: true }]}>
            <Select placeholder="Select connectivity type" disabled={deploymentType === 'SAAS'}>
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
          {deploymentType === 'SAAS' && (
            <Alert
              message="Application fields have been pre-filled based on your customer selection."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item name="deploymentLabel" label="Deployment Label" rules={[{ required: true }]}>
            <Input placeholder="e.g. Acme Production" />
          </Form.Item>
          <Form.Item name="containerAppName" label="Container App Name">
            <Input placeholder={customerAcronym ? `e.g. procuro-${customerAcronym}-backend` : 'e.g. procuro-acme-backend'} />
          </Form.Item>
          <Form.Item name="customDomain" label="Customer Domain">
            <Input placeholder={customerAcronym ? `e.g. ${customerAcronym}.app.pro-curo.com` : 'e.g. acme.app.pro-curo.com'} />
          </Form.Item>
          <Form.Item
            name="containerAppUrl"
            label="Container App URL (optional — set after Azure setup)"
            extra="Leave blank during provisioning. Update after creating the Container App in Azure, or use Prepare Azure Setup to generate the script first."
          >
            <Input placeholder={customerAcronym ? `e.g. https://procuro-${customerAcronym}-backend.${AZURE_ENV_SUFFIX}` : 'Set after Azure provisioning'} />
          </Form.Item>
          <Form.Item name="imageTag" label="ACR Image Tag">
            <Input placeholder={`Latest: ${LATEST_V5_IMAGE_TAG}`} />
          </Form.Item>
          <Form.Item name="v5BuildId" label="V5 Build ID" extra="The PCSv5 build identifier, e.g. PCSv5-20260326-1925-25">
            <Input placeholder="e.g. PCSv5-20260326-1925-25" />
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
          <Tag color={deploymentType === 'SAAS' ? 'blue' : 'purple'} style={{ marginBottom: 12, fontSize: 13, padding: '2px 10px' }}>
            {deploymentType === 'SAAS' ? 'SaaS — Pro-curo Azure' : 'Hybrid — Client Infrastructure'}
          </Tag>
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
            <Descriptions.Item label="Customer Domain">
              {form.getFieldValue('customDomain') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Container App URL">
              {form.getFieldValue('containerAppUrl') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="ACR Image Tag">
              {form.getFieldValue('imageTag') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="V5 Build ID">
              {form.getFieldValue('v5BuildId') || '—'}
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
          <Form.Item name="customDomain" label="Customer Domain">
            <Input placeholder="e.g. acme.app.pro-curo.com" />
          </Form.Item>
          <Form.Item
            name="containerAppUrl"
            label="Container App URL"
            extra="Confirm after creating the resource in Azure."
          >
            <Input placeholder="e.g. https://procuro-acme-backend.grayriver-3c973afe.uksouth.azurecontainerapps.io" />
          </Form.Item>
          <Form.Item name="imageTag" label="ACR Image Tag">
            <Input placeholder={`Latest: ${LATEST_V5_IMAGE_TAG}`} />
          </Form.Item>
          <Form.Item name="v5BuildId" label="V5 Build ID" extra="The PCSv5 build identifier, e.g. PCSv5-20260326-1925-25">
            <Input placeholder="e.g. PCSv5-20260326-1925-25" />
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
            <Descriptions.Item label="Customer Domain">
              {editForm.getFieldValue('customDomain') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Container App URL">
              {editForm.getFieldValue('containerAppUrl') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="ACR Image Tag">
              {editForm.getFieldValue('imageTag') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="V5 Build ID">
              {editForm.getFieldValue('v5BuildId') || '—'}
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
        <Space>
          <Tooltip title="View V5 source on GitHub">
            <Button
              icon={<GithubOutlined />}
              onClick={() => window.open(V5_GITHUB_URL, '_blank')}
            >
              V5 Source
            </Button>
          </Tooltip>
          <Button icon={<FileTextOutlined />} onClick={() => {
            setBriefModalOpen(true);
            setBriefCustomer(null);
            setBriefAcronym('');
            setBriefType(null);
          }}>
            Prepare Azure Setup
          </Button>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => {
            setModalOpen(true);
            setCurrentStep(0);
            setSelectedCustomer(null);
            setDeploymentType(null);
            setCustomerAcronym('');
            form.resetFields();
          }}>
            Provision New Deployment
          </Button>
        </Space>
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
          setDeploymentType(null);
          setCustomerAcronym('');
        }}
        footer={null}
        width={640}
      >
        <Steps current={currentStep} items={createModalSteps.map(step => ({ title: step.title }))} style={{ marginBottom: 24 }} size="small" />
        <div style={{ minHeight: 300 }}>
          {createModalSteps.map((step, index) => (
            <div key={step.title} style={{ display: index === currentStep ? 'block' : 'none' }}>
              {step.content}
            </div>
          ))}
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
              setDeploymentType(null);
              setCustomerAcronym('');
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
          {editModalSteps.map((step, index) => (
            <div key={step.title} style={{ display: index === editStep ? 'block' : 'none' }}>
              {step.content}
            </div>
          ))}
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

      {/* Setup Scripts Drawer (post-provisioning) */}
      <Drawer
        title={setupDeployment ? `Setup Scripts — ${setupDeployment.deploymentLabel}` : 'Setup Scripts'}
        onClose={() => {
          setSetupDrawerOpen(false);
          setSetupDeployment(null);
        }}
        open={setupDrawerOpen}
        width={720}
      >
        {setupDeployment && (
          <>
            <Alert
              message="Post-Provisioning Setup"
              description="Run these commands in Azure Cloud Shell after the Container App has been created. Replace placeholder values in <angle brackets> with actual credentials."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Card size="small" title="Deployment Summary" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Customer">{setupDeployment.customer?.name}</Descriptions.Item>
                <Descriptions.Item label="Container App"><Text code>{setupDeployment.containerAppName || '—'}</Text></Descriptions.Item>
                <Descriptions.Item label="Database"><Text code>{setupDeployment.databaseName || '—'}</Text></Descriptions.Item>
                <Descriptions.Item label="Domain"><Text code>{setupDeployment.customDomain || '—'}</Text></Descriptions.Item>
                <Descriptions.Item label="V5 Build"><Text code>{setupDeployment.v5BuildId || '—'}</Text></Descriptions.Item>
                <Descriptions.Item label="Image Tag"><Text code>{setupDeployment.imageTag || '—'}</Text></Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              title="Setup Script"
              extra={
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopySetupScript(setupDeployment)}>
                  Copy to Clipboard
                </Button>
              }
            >
              <pre style={{
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                padding: 16,
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.5,
                maxHeight: 500,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                margin: 0,
              }}>
                {generateSetupScript(setupDeployment)}
              </pre>
            </Card>

            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Once the setup is complete and the health check passes, use <strong>Actions → Mark as Running</strong> to update the deployment status.
              </Text>
            </div>
          </>
        )}
      </Drawer>

      {/* Provision Upgrade Modal */}
      <Modal
        title={upgradeDeployment ? `Provision Upgrade — ${upgradeDeployment.deploymentLabel}` : 'Provision Upgrade'}
        open={upgradeModalOpen}
        onCancel={() => {
          setUpgradeModalOpen(false);
          setUpgradeDeployment(null);
          setUpgradeImageTag('');
          setUpgradeV5BuildId('');
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setUpgradeModalOpen(false);
            setUpgradeDeployment(null);
            setUpgradeImageTag('');
          }}>
            Cancel
          </Button>,
          <Button
            key="upgrade"
            type="primary"
            icon={<ArrowUpOutlined />}
            loading={upgradeSubmitting}
            disabled={!upgradeImageTag}
            onClick={handleUpgradeSubmit}
          >
            Record Upgrade & Copy Script
          </Button>,
        ]}
        width={720}
      >
        {upgradeDeployment && (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="Customer">{upgradeDeployment.customer?.name}</Descriptions.Item>
                <Descriptions.Item label="Container App"><Text code>{upgradeDeployment.containerAppName}</Text></Descriptions.Item>
                <Descriptions.Item label="Current Image Tag"><Tag color="orange">{upgradeDeployment.imageTag || 'none'}</Tag></Descriptions.Item>
                <Descriptions.Item label="Current V5 Build"><Tag color="blue">{upgradeDeployment.v5BuildId || 'not set'}</Tag></Descriptions.Item>
              </Descriptions>
            </Card>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>New Image Tag</Text>
                <Button
                  type="link"
                  size="small"
                  icon={<GithubOutlined />}
                  onClick={() => window.open(`${V5_GITHUB_URL}/commits/main`, '_blank')}
                >
                  View V5 Commits
                </Button>
              </div>
              <Input
                placeholder="e.g. build26"
                value={upgradeImageTag}
                onChange={(e) => setUpgradeImageTag(e.target.value)}
                style={{ marginTop: 8 }}
                addonBefore={`${ACR_SERVER}/${V5_BACKEND_IMAGE}:`}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                Enter the new V5 build tag. The script will build and deploy both backend and frontend images.
              </Text>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong>V5 Build ID</Text>
              <Input
                placeholder="e.g. PCSv5-20260330-1500-26"
                value={upgradeV5BuildId}
                onChange={(e) => setUpgradeV5BuildId(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                The PCSv5 build identifier from frontend/src/buildInfo.ts — recorded against this deployment.
              </Text>
            </div>

            {upgradeImageTag && (
              <Card
                size="small"
                title={`Upgrade Script: ${upgradeDeployment.imageTag || 'unknown'} → ${upgradeImageTag}`}
              >
                <pre style={{
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 16,
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.5,
                  maxHeight: 300,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                }}>
                  {generateUpgradeScript(upgradeDeployment, upgradeImageTag)}
                </pre>
              </Card>
            )}
          </>
        )}
      </Modal>

      {/* Pre-Provisioning Brief Modal */}
      <Modal
        title="Prepare Azure Setup"
        open={briefModalOpen}
        onCancel={() => {
          setBriefModalOpen(false);
          setBriefCustomer(null);
          setBriefAcronym('');
          setBriefType(null);
        }}
        footer={briefCustomer ? [
          <Button key="close" onClick={() => {
            setBriefModalOpen(false);
            setBriefCustomer(null);
            setBriefAcronym('');
            setBriefType(null);
          }}>Close</Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={handlePrintBrief}>Print</Button>,
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopyBrief}>
            Copy Script to Clipboard
          </Button>,
        ] : null}
        width={780}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>Select Customer</Text>
          <Select
            placeholder="Select a customer to generate setup brief"
            showSearch
            optionFilterProp="children"
            style={{ width: '100%', marginTop: 8 }}
            value={briefCustomer?.id}
            onChange={handleBriefCustomerSelected}
          >
            {customers.map(c => (
              <Select.Option key={c.id} value={c.id}>
                {c.name} ({c.customerNumber})
              </Select.Option>
            ))}
          </Select>
        </div>

        {briefCustomer && briefAcronym && (
          <>
            <Alert
              message={briefType === 'SAAS' ? 'SaaS Deployment — Pro-curo Azure' : 'Hybrid Deployment — Client Infrastructure'}
              description={briefType === 'SAAS'
                ? 'All Azure resources will be created in our subscription. The script below contains the complete setup commands.'
                : 'The Container App is created in our Azure, but the database is on the client\'s infrastructure. Confirm connectivity details before running.'
              }
              type={briefType === 'SAAS' ? 'info' : 'warning'}
              showIcon
              icon={briefType === 'SAAS' ? <CloudOutlined /> : <HomeOutlined />}
              style={{ marginBottom: 16 }}
            />

            <Card size="small" title="Resource Summary" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Customer">{briefCustomer.name}</Descriptions.Item>
                <Descriptions.Item label="Acronym"><Text code>{briefAcronym}</Text></Descriptions.Item>
                <Descriptions.Item label="Database Name"><Text code>{briefAcronym}_procuro</Text></Descriptions.Item>
                <Descriptions.Item label="Container App Name"><Text code>procuro-{briefAcronym}-backend</Text></Descriptions.Item>
                <Descriptions.Item label="Custom Domain"><Text code>{briefAcronym}.app.pro-curo.com</Text></Descriptions.Item>
                <Descriptions.Item label="Container App URL">
                  <Text code style={{ fontSize: 11 }}>https://procuro-{briefAcronym}-backend.{AZURE_ENV_SUFFIX}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Image Tag"><Text code>{LATEST_V5_IMAGE_TAG}</Text></Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              title="Azure CLI Setup Script"
              extra={<Button size="small" icon={<CopyOutlined />} onClick={handleCopyBrief}>Copy</Button>}
            >
              <pre style={{
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                padding: 16,
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.5,
                maxHeight: 400,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                margin: 0,
              }}>
                {generateBriefScript()}
              </pre>
            </Card>

            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Run these commands in Azure Cloud Shell or a local terminal with Azure CLI.
                Replace placeholder values (in &lt;angle brackets&gt;) with actual credentials.
                Once Azure resources are created, return to the admin portal and use <strong>Provision New Deployment</strong> to register the deployment.
              </Text>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
