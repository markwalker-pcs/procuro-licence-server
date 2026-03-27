import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import type { AdminAuthRequest } from '../../middleware/adminAuth';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Tenant Configuration Management
// Reference: Architecture Doc, Section 7.2
// ─────────────────────────────────────────────

// Utility function to mask secret values
function maskSecretValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.substring(0, 4) + '****';
}

// GET /api/admin/tenant-config/:deploymentId — List all config entries for a deployment, grouped by category
router.get('/:deploymentId', async (req: Request, res: Response) => {
  const deploymentId = req.params.deploymentId as string;

  // Verify deployment exists
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  const configs = await prisma.tenantConfig.findMany({
    where: { deploymentId },
    orderBy: [{ category: 'asc' }, { configKey: 'asc' }],
  });

  // Group by category and mask secrets
  const grouped: Record<string, any[]> = {};
  configs.forEach((config) => {
    if (!grouped[config.category]) {
      grouped[config.category] = [];
    }
    grouped[config.category].push({
      ...config,
      configValue: config.isSecret ? maskSecretValue(config.configValue) : config.configValue,
    });
  });

  res.json({ data: { grouped, total: configs.length } });
});

// POST /api/admin/tenant-config/:deploymentId — Create a new config entry
const createConfigSchema = z.object({
  category: z.string().min(1, 'category is required'),
  configKey: z.string().min(1, 'configKey is required'),
  configValue: z.string(),
  isSecret: z.boolean().default(false),
  description: z.string().optional(),
});

router.post('/:deploymentId', async (req: AdminAuthRequest, res: Response) => {
  const deploymentId = req.params.deploymentId as string;
  const data = createConfigSchema.parse(req.body);

  // Verify deployment exists
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  // Check if config key already exists
  const existingConfig = await prisma.tenantConfig.findUnique({
    where: {
      deploymentId_configKey: {
        deploymentId,
        configKey: data.configKey,
      },
    },
  });

  if (existingConfig) {
    res.status(409).json({ error: 'Configuration key already exists for this deployment' });
    return;
  }

  // Create config entry
  const config = await prisma.tenantConfig.create({
    data: {
      deploymentId,
      category: data.category,
      configKey: data.configKey,
      configValue: data.configValue,
      isSecret: data.isSecret,
      description: data.description || null,
    },
  });

  // Create audit log entry
  if (req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'tenant_config.create',
        targetType: 'tenant_config',
        targetId: config.id,
        details: {
          deploymentId,
          category: data.category,
          configKey: data.configKey,
          isSecret: data.isSecret,
        } as any,
      },
    });
  }

  logger.info('Tenant config created', {
    configId: config.id,
    deploymentId,
    configKey: data.configKey,
  });

  res.status(201).json({
    data: {
      ...config,
      configValue: config.isSecret ? maskSecretValue(config.configValue) : config.configValue,
    },
  });
});

// PATCH /api/admin/tenant-config/:deploymentId/:configId — Update a config entry
const updateConfigSchema = z.object({
  configValue: z.string().optional(),
  isSecret: z.boolean().optional(),
  description: z.string().optional().nullable(),
});

router.patch('/:deploymentId/:configId', async (req: AdminAuthRequest, res: Response) => {
  const deploymentId = req.params.deploymentId as string;
  const configId = req.params.configId as string;
  const updates = updateConfigSchema.parse(req.body);

  // Verify deployment exists
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  // Fetch existing config for audit purposes
  const existingConfig = await prisma.tenantConfig.findUnique({
    where: { id: configId },
  });

  if (!existingConfig || existingConfig.deploymentId !== deploymentId) {
    res.status(404).json({ error: 'Configuration not found' });
    return;
  }

  // Update config
  const updatedConfig = await prisma.tenantConfig.update({
    where: { id: configId },
    data: {
      configValue: updates.configValue !== undefined ? updates.configValue : existingConfig.configValue,
      isSecret: updates.isSecret !== undefined ? updates.isSecret : existingConfig.isSecret,
      description: updates.description !== undefined ? updates.description : existingConfig.description,
    },
  });

  // Build details object for audit log (only changed fields, mask secrets)
  const changedFields: Record<string, unknown> = {};

  if (updates.configValue !== undefined && updates.configValue !== existingConfig.configValue) {
    changedFields.configValue = {
      old: existingConfig.isSecret ? maskSecretValue(existingConfig.configValue) : existingConfig.configValue,
      new: updates.isSecret !== false ? maskSecretValue(updates.configValue) : updates.configValue,
    };
  }

  if (updates.isSecret !== undefined && updates.isSecret !== existingConfig.isSecret) {
    changedFields.isSecret = {
      old: existingConfig.isSecret,
      new: updates.isSecret,
    };
  }

  if (updates.description !== undefined && updates.description !== existingConfig.description) {
    changedFields.description = {
      old: existingConfig.description,
      new: updates.description,
    };
  }

  // Log to audit trail if there are changes
  if (Object.keys(changedFields).length > 0 && req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'tenant_config.update',
        targetType: 'tenant_config',
        targetId: configId,
        details: changedFields as any,
      },
    });
  }

  logger.info('Tenant config updated', {
    configId,
    deploymentId,
    changedFields: Object.keys(changedFields),
  });

  res.json({
    data: {
      ...updatedConfig,
      configValue: updatedConfig.isSecret ? maskSecretValue(updatedConfig.configValue) : updatedConfig.configValue,
    },
  });
});

// DELETE /api/admin/tenant-config/:deploymentId/:configId — Delete a config entry
router.delete('/:deploymentId/:configId', async (req: AdminAuthRequest, res: Response) => {
  const deploymentId = req.params.deploymentId as string;
  const configId = req.params.configId as string;

  // Verify deployment exists
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  // Fetch config to verify it belongs to this deployment
  const config = await prisma.tenantConfig.findUnique({
    where: { id: configId },
  });

  if (!config || config.deploymentId !== deploymentId) {
    res.status(404).json({ error: 'Configuration not found' });
    return;
  }

  // Delete config
  await prisma.tenantConfig.delete({
    where: { id: configId },
  });

  // Create audit log entry
  if (req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'tenant_config.delete',
        targetType: 'tenant_config',
        targetId: configId,
        details: {
          deploymentId,
          configKey: config.configKey,
          category: config.category,
        } as any,
      },
    });
  }

  logger.info('Tenant config deleted', {
    configId,
    deploymentId,
    configKey: config.configKey,
  });

  res.status(204).send();
});

// POST /api/admin/tenant-config/:deploymentId/bulk — Bulk create/update config entries
const bulkConfigSchema = z.object({
  configs: z.array(
    z.object({
      category: z.string().min(1),
      configKey: z.string().min(1),
      configValue: z.string(),
      isSecret: z.boolean().default(false),
      description: z.string().optional(),
    })
  ),
});

router.post('/:deploymentId/bulk', async (req: AdminAuthRequest, res: Response) => {
  const deploymentId = req.params.deploymentId as string;
  const data = bulkConfigSchema.parse(req.body);

  // Verify deployment exists
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  const results = [];
  const createdCount = 0;
  const updatedCount = 0;

  for (const configData of data.configs) {
    const result = await prisma.tenantConfig.upsert({
      where: {
        deploymentId_configKey: {
          deploymentId,
          configKey: configData.configKey,
        },
      },
      update: {
        configValue: configData.configValue,
        isSecret: configData.isSecret,
        description: configData.description || null,
      },
      create: {
        deploymentId,
        category: configData.category,
        configKey: configData.configKey,
        configValue: configData.configValue,
        isSecret: configData.isSecret,
        description: configData.description || null,
      },
    });

    results.push({
      ...result,
      configValue: result.isSecret ? maskSecretValue(result.configValue) : result.configValue,
    });
  }

  // Create audit log entry for bulk operation
  if (req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'tenant_config.bulk_update',
        targetType: 'tenant_config',
        targetId: deploymentId,
        details: {
          deploymentId,
          entriesProcessed: data.configs.length,
          configKeys: data.configs.map((c) => c.configKey),
        } as any,
      },
    });
  }

  logger.info('Tenant config bulk operation completed', {
    deploymentId,
    entriesProcessed: data.configs.length,
  });

  res.status(201).json({
    data: {
      configs: results,
      processed: data.configs.length,
    },
  });
});

export default router;
