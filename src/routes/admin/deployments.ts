import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import type { AdminAuthRequest } from '../../middleware/adminAuth';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Deployment Management
// Reference: Architecture Doc, Section 7.2
// ─────────────────────────────────────────────

// GET /api/admin/deployments — List all deployments with customer info
router.get('/', async (_req: Request, res: Response) => {
  const deployments = await prisma.deployment.findMany({
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          customerNumber: true,
          deploymentModel: true,
        },
      },
    },
    orderBy: { provisionedAt: 'desc' },
  });

  res.json({ data: deployments, total: deployments.length });
});

// GET /api/admin/deployments/:id — Get single deployment with customer info
router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const deployment = await prisma.deployment.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          customerNumber: true,
          deploymentModel: true,
        },
      },
      configs: true,
    },
  });

  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  res.json({ data: deployment });
});

// POST /api/admin/deployments — Create a new deployment
const createDeploymentSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  deploymentLabel: z.string().min(1, 'deploymentLabel is required'),
  databaseType: z
    .enum(['POSTGRESQL', 'SQLSERVER', 'MYSQL', 'MARIADB'])
    .default('POSTGRESQL'),
  databaseHost: z.string().optional(),
  databasePort: z.number().int().optional(),
  databaseName: z.string().optional(),
  connectivityType: z
    .enum(['PRIVATE_LINK', 'SITE_TO_SITE_VPN', 'EXPRESSROUTE', 'PUBLIC_ENDPOINT'])
    .optional(),
  containerAppName: z.string().optional(),
  containerAppUrl: z.string().optional(),
  imageTag: z.string().optional(),
  v5BuildId: z.string().optional(),
  customDomain: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: AdminAuthRequest, res: Response) => {
  if (!req.adminUser) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  try {
    const data = createDeploymentSchema.parse(req.body);

    const deployment = await prisma.deployment.create({
      data: {
        customerId: data.customerId,
        deploymentLabel: data.deploymentLabel,
        databaseType: data.databaseType,
        databaseHost: data.databaseHost || null,
        databasePort: data.databasePort || null,
        databaseName: data.databaseName || null,
        connectivityType: data.connectivityType || null,
        containerAppName: data.containerAppName || null,
        containerAppUrl: data.containerAppUrl || null,
        imageTag: data.imageTag || null,
        v5BuildId: data.v5BuildId || null,
        customDomain: data.customDomain || null,
        notes: data.notes || null,
        provisionedBy: req.adminUser.id,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            customerNumber: true,
            deploymentModel: true,
          },
        },
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'deployment.create',
        targetType: 'deployment',
        targetId: deployment.id,
        details: {
          customerId: data.customerId,
          deploymentLabel: data.deploymentLabel,
          databaseType: data.databaseType,
        } as any,
      },
    });

    logger.info('Deployment created', {
      deploymentId: deployment.id,
      customerId: data.customerId,
      deploymentLabel: data.deploymentLabel,
    });

    res.status(201).json({ data: deployment });
  } catch (err: any) {
    logger.error('Failed to create deployment', { error: err.message, body: req.body });

    if (err.name === 'ZodError') {
      res.status(400).json({
        error: 'Validation error',
        details: err.errors?.map((e: any) => ({ field: e.path?.join('.'), message: e.message })),
      });
      return;
    }

    // Prisma unique constraint or foreign key errors
    if (err.code === 'P2002') {
      const target = err.meta?.target as string[] | undefined;
      let detail = 'A deployment with these details already exists';
      if (target?.includes('containerAppName')) {
        detail = 'A deployment with this Container App name already exists';
      } else if (target?.includes('customDomain')) {
        detail = 'A deployment with this custom domain already exists';
      } else if (target?.includes('databaseName')) {
        detail = 'A deployment with this database name and host combination already exists';
      }
      res.status(409).json({ error: detail });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Invalid customer reference — customer not found' });
      return;
    }

    res.status(500).json({ error: err.message || 'Failed to create deployment' });
  }
});

// PATCH /api/admin/deployments/:id — Update a deployment
const updateDeploymentSchema = z.object({
  deploymentLabel: z.string().min(1).optional(),
  databaseType: z
    .enum(['POSTGRESQL', 'SQLSERVER', 'MYSQL', 'MARIADB'])
    .optional(),
  databaseHost: z.string().optional().nullable(),
  databasePort: z.number().int().optional().nullable(),
  databaseName: z.string().optional().nullable(),
  connectivityType: z
    .enum(['PRIVATE_LINK', 'SITE_TO_SITE_VPN', 'EXPRESSROUTE', 'PUBLIC_ENDPOINT'])
    .optional()
    .nullable(),
  containerAppName: z.string().optional().nullable(),
  containerAppUrl: z.string().optional().nullable(),
  imageTag: z.string().optional().nullable(),
  v5BuildId: z.string().optional().nullable(),
  customDomain: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.patch('/:id', async (req: AdminAuthRequest, res: Response) => {
  const id = req.params.id as string;
  const updates = updateDeploymentSchema.parse(req.body);

  // Fetch existing deployment for audit purposes
  const existingDeployment = await prisma.deployment.findUnique({
    where: { id },
  });

  if (!existingDeployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  // Update deployment
  let updatedDeployment;
  try {
    updatedDeployment = await prisma.deployment.update({
      where: { id },
      data: updates as any,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            customerNumber: true,
            deploymentModel: true,
          },
        },
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      const target = err.meta?.target as string[] | undefined;
      let detail = 'A deployment with these details already exists';
      if (target?.includes('containerAppName')) {
        detail = 'A deployment with this Container App name already exists';
      } else if (target?.includes('customDomain')) {
        detail = 'A deployment with this custom domain already exists';
      } else if (target?.includes('databaseName')) {
        detail = 'A deployment with this database name and host combination already exists';
      }
      res.status(409).json({ error: detail });
      return;
    }
    throw err;
  }

  // Build details object for audit log (only changed fields)
  const changedFields: Record<string, unknown> = {};
  let hasChanges = false;

  if (
    updates.deploymentLabel &&
    updates.deploymentLabel !== existingDeployment.deploymentLabel
  ) {
    changedFields.deploymentLabel = {
      old: existingDeployment.deploymentLabel,
      new: updates.deploymentLabel,
    };
    hasChanges = true;
  }
  if (
    updates.databaseType &&
    updates.databaseType !== existingDeployment.databaseType
  ) {
    changedFields.databaseType = {
      old: existingDeployment.databaseType,
      new: updates.databaseType,
    };
    hasChanges = true;
  }
  if (
    updates.databaseHost !== undefined &&
    updates.databaseHost !== existingDeployment.databaseHost
  ) {
    changedFields.databaseHost = {
      old: existingDeployment.databaseHost,
      new: updates.databaseHost,
    };
    hasChanges = true;
  }
  if (
    updates.databasePort !== undefined &&
    updates.databasePort !== existingDeployment.databasePort
  ) {
    changedFields.databasePort = {
      old: existingDeployment.databasePort,
      new: updates.databasePort,
    };
    hasChanges = true;
  }
  if (
    updates.databaseName !== undefined &&
    updates.databaseName !== existingDeployment.databaseName
  ) {
    changedFields.databaseName = {
      old: existingDeployment.databaseName,
      new: updates.databaseName,
    };
    hasChanges = true;
  }
  if (
    updates.connectivityType !== undefined &&
    updates.connectivityType !== existingDeployment.connectivityType
  ) {
    changedFields.connectivityType = {
      old: existingDeployment.connectivityType,
      new: updates.connectivityType,
    };
    hasChanges = true;
  }
  if (
    updates.containerAppName !== undefined &&
    updates.containerAppName !== existingDeployment.containerAppName
  ) {
    changedFields.containerAppName = {
      old: existingDeployment.containerAppName,
      new: updates.containerAppName,
    };
    hasChanges = true;
  }
  if (
    updates.containerAppUrl !== undefined &&
    updates.containerAppUrl !== existingDeployment.containerAppUrl
  ) {
    changedFields.containerAppUrl = {
      old: existingDeployment.containerAppUrl,
      new: updates.containerAppUrl,
    };
    hasChanges = true;
  }
  if (updates.imageTag !== undefined && updates.imageTag !== existingDeployment.imageTag) {
    changedFields.imageTag = {
      old: existingDeployment.imageTag,
      new: updates.imageTag,
    };
    hasChanges = true;
  }
  if (updates.v5BuildId !== undefined && updates.v5BuildId !== existingDeployment.v5BuildId) {
    changedFields.v5BuildId = {
      old: existingDeployment.v5BuildId,
      new: updates.v5BuildId,
    };
    hasChanges = true;
  }
  if (updates.customDomain !== undefined && updates.customDomain !== existingDeployment.customDomain) {
    changedFields.customDomain = {
      old: existingDeployment.customDomain,
      new: updates.customDomain,
    };
    hasChanges = true;
  }
  if (updates.notes !== undefined && updates.notes !== existingDeployment.notes) {
    changedFields.notes = { old: existingDeployment.notes, new: updates.notes };
    hasChanges = true;
  }

  // Log to audit trail if there are changes
  if (hasChanges && req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'deployment.update',
        targetType: 'deployment',
        targetId: id,
        details: changedFields as any,
      },
    });
  }

  logger.info('Deployment updated', {
    deploymentId: id,
    changedFields: Object.keys(changedFields),
  });

  res.json({ data: updatedDeployment });
});

// PATCH /api/admin/deployments/:id/status — Update deployment status only
const updateStatusSchema = z.object({
  status: z.enum(['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED']),
});

router.patch('/:id/status', async (req: AdminAuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { status } = updateStatusSchema.parse(req.body);

  // Fetch existing deployment
  const existingDeployment = await prisma.deployment.findUnique({
    where: { id },
  });

  if (!existingDeployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }

  // Update status
  const updatedDeployment = await prisma.deployment.update({
    where: { id },
    data: { status },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          customerNumber: true,
          deploymentModel: true,
        },
      },
    },
  });

  // Create audit log with old and new status
  if (req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'deployment.status_change',
        targetType: 'deployment',
        targetId: id,
        details: {
          oldStatus: existingDeployment.status,
          newStatus: status,
        } as any,
      },
    });
  }

  logger.info('Deployment status updated', {
    deploymentId: id,
    oldStatus: existingDeployment.status,
    newStatus: status,
  });

  res.json({ data: updatedDeployment });
});

export default router;
