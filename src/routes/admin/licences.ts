import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { generateOfflineLicenceFile } from '../../services/cryptoService';
import { logAuditEvent } from '../../services/auditService';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Licence Management
// Reference: Architecture Doc, Sections 5.2, 7.2
// ─────────────────────────────────────────────

// Helper: Generate a licence key in format PCV5-XXXX-XXXX-XXXX-XXXX
function generateLicenceKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PCV5-${segment()}-${segment()}-${segment()}-${segment()}`;
}

// GET /api/admin/licences — List all licences with status and instance counts
router.get('/', async (_req: Request, res: Response) => {
  const licences = await prisma.licence.findMany({
    include: {
      customer: { select: { id: true, name: true, deploymentModel: true } },
      _count: { select: { instances: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ data: licences, total: licences.length });
});

// POST /api/admin/licences — Issue a new licence for a customer
const createLicenceSchema = z.object({
  customerId: z.string().uuid(),
  licenceType: z.enum(['PER_USER', 'CONCURRENT']).default('PER_USER'),
  licensedUsers: z.number().int().min(1), // For PER_USER: max user accounts; for CONCURRENT: max simultaneous sessions
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
  expiryDate: z.string().datetime(),
  invoiceReference: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const data = createLicenceSchema.parse(req.body);
  const adminUserId = (req as any).adminUser?.id || 'system';

  // Look up the customer to inherit their deployment model
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { deploymentModel: true },
  });
  if (!customer) {
    res.status(400).json({ error: 'Customer not found' });
    return;
  }

  const licenceKey = generateLicenceKey();

  // TODO: In production, store bcrypt hash of the licence key, not plaintext
  const licence = await prisma.licence.create({
    data: {
      customerId: data.customerId,
      licenceKey,
      licenceType: data.licenceType,
      licensedUsers: data.licensedUsers,
      gracePeriodDays: data.gracePeriodDays,
      expiryDate: new Date(data.expiryDate),
      deploymentModel: customer.deploymentModel, // Inherited from customer
      invoiceReference: data.invoiceReference || null,
      createdBy: adminUserId,
      notes: data.notes,
    },
  });

  logAuditEvent({
    userId: adminUserId,
    action: 'licence.create',
    targetType: 'licence',
    targetId: licence.id,
    details: {
      customerId: data.customerId,
      licensedUsers: data.licensedUsers,
      invoiceReference: data.invoiceReference || null,
    },
  });

  logger.info('Licence issued', {
    licenceId: licence.id,
    customerId: data.customerId,
    licensedUsers: data.licensedUsers,
    invoiceReference: data.invoiceReference,
  });

  // Return the plaintext key only on creation — it cannot be retrieved later
  res.status(201).json({
    data: licence,
    licenceKey, // Only returned once at creation time
  });
});

// PATCH /api/admin/licences/:id — Modify licence (user count, expiry, status)
const updateLicenceSchema = z.object({
  licensedUsers: z.number().int().min(1).optional(),
  expiryDate: z.string().datetime().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']).optional(),
  notes: z.string().optional(),
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = updateLicenceSchema.parse(req.body);

  const licence = await prisma.licence.update({
    where: { id },
    data: {
      ...data,
      ...(data.expiryDate && { expiryDate: new Date(data.expiryDate) }),
    },
  });

  logger.info('Licence updated', { licenceId: id, changes: data });

  // TODO: Log to audit trail

  res.json({ data: licence });
});

// DELETE /api/admin/licences/:id — Revoke a licence
router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const licence = await prisma.licence.update({
    where: { id },
    data: { status: 'REVOKED' },
  });

  logger.info('Licence revoked', { licenceId: id });

  // TODO: Log to audit trail

  res.json({ data: licence, message: 'Licence revoked successfully' });
});

// ─── Licence Amendments (user increases, renewals, etc.) ───

// POST /api/admin/licences/:id/amend — Create a licence amendment (e.g. add more users)
const amendLicenceSchema = z.object({
  amendmentType: z.enum(['USER_INCREASE', 'USER_DECREASE', 'RENEWAL', 'EXPIRY_EXTENSION', 'TYPE_CHANGE']),
  newUsers: z.number().int().min(1).optional(),
  newExpiryDate: z.string().datetime().optional(),
  newLicenceType: z.enum(['PER_USER', 'CONCURRENT']).optional(), // Required for TYPE_CHANGE
  invoiceReference: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/:id/amend', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = amendLicenceSchema.parse(req.body);
  const adminUserId = (req as any).adminUser?.id || 'system';

  // Load current licence
  const licence = await prisma.licence.findUnique({ where: { id } });
  if (!licence) {
    res.status(404).json({ error: 'Licence not found' });
    return;
  }

  if (licence.status !== 'ACTIVE') {
    res.status(400).json({ error: 'Can only amend active licences', status: licence.status });
    return;
  }

  const previousUsers = licence.licensedUsers;
  const previousType = licence.licenceType;
  let newUsers = previousUsers;
  let newExpiryDate = licence.expiryDate;
  let newLicenceType = licence.licenceType;

  // Determine the change based on amendment type
  switch (data.amendmentType) {
    case 'USER_INCREASE':
    case 'USER_DECREASE':
      if (!data.newUsers) {
        res.status(400).json({ error: 'newUsers is required for user count amendments' });
        return;
      }
      if (data.amendmentType === 'USER_INCREASE' && data.newUsers <= previousUsers) {
        res.status(400).json({
          error: `New user count (${data.newUsers}) must be greater than current count (${previousUsers})`,
        });
        return;
      }
      if (data.amendmentType === 'USER_DECREASE' && data.newUsers >= previousUsers) {
        res.status(400).json({
          error: `New user count (${data.newUsers}) must be less than current count (${previousUsers})`,
        });
        return;
      }
      newUsers = data.newUsers;
      break;

    case 'RENEWAL':
    case 'EXPIRY_EXTENSION':
      if (!data.newExpiryDate) {
        res.status(400).json({ error: 'newExpiryDate is required for renewal/extension amendments' });
        return;
      }
      newExpiryDate = new Date(data.newExpiryDate);
      if (data.newUsers) newUsers = data.newUsers; // Renewals can also change user count
      break;

    case 'TYPE_CHANGE':
      if (!data.newLicenceType) {
        res.status(400).json({ error: 'newLicenceType is required for TYPE_CHANGE amendments' });
        return;
      }
      if (data.newLicenceType === previousType) {
        res.status(400).json({ error: `Licence is already of type ${previousType}` });
        return;
      }
      newLicenceType = data.newLicenceType;
      if (data.newUsers) newUsers = data.newUsers; // Type change can also adjust the user/session limit
      break;
  }

  // Create the amendment record and update the licence in a transaction
  const [amendment, updatedLicence] = await prisma.$transaction([
    prisma.licenceAmendment.create({
      data: {
        licenceId: id,
        amendmentType: data.amendmentType,
        previousUsers,
        newUsers,
        previousType: data.amendmentType === 'TYPE_CHANGE' ? previousType : null,
        newType: data.amendmentType === 'TYPE_CHANGE' ? newLicenceType : null,
        invoiceReference: data.invoiceReference || null,
        notes: data.notes || null,
        createdBy: adminUserId,
      },
    }),
    prisma.licence.update({
      where: { id },
      data: {
        licenceType: newLicenceType,
        licensedUsers: newUsers,
        expiryDate: newExpiryDate,
      },
    }),
  ]);

  logAuditEvent({
    userId: adminUserId,
    action: `licence.amend.${data.amendmentType.toLowerCase()}`,
    targetType: 'licence',
    targetId: id,
    details: {
      amendmentId: amendment.id,
      amendmentType: data.amendmentType,
      previousUsers,
      newUsers,
      invoiceReference: data.invoiceReference || null,
    },
  });

  logger.info('Licence amended', {
    licenceId: id,
    amendmentType: data.amendmentType,
    previousUsers,
    newUsers,
    invoiceReference: data.invoiceReference,
  });

  res.status(201).json({
    data: {
      amendment,
      licence: updatedLicence,
    },
  });
});

// GET /api/admin/licences/:id/amendments — List all amendments for a licence
router.get('/:id/amendments', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const amendments = await prisma.licenceAmendment.findMany({
    where: { licenceId: id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ data: amendments, total: amendments.length });
});

// ─── Offline Licence File Endpoints (Phase 3) ───

// POST /api/admin/licences/:id/offline-file — Generate signed offline licence file
const offlineFileSchema = z.object({
  validityDays: z.number().int().min(1).max(365).default(90),
  instanceId: z.string().uuid().optional(), // Optional: lock to specific instance
  notes: z.string().optional(),
});

router.post('/:id/offline-file', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const params = offlineFileSchema.parse(req.body);

  // 1. Load the licence with customer details
  const licence = await prisma.licence.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!licence) {
    res.status(404).json({ error: 'Licence not found' });
    return;
  }

  if (licence.status !== 'ACTIVE') {
    res.status(400).json({
      error: 'Cannot generate offline file for a non-active licence',
      status: licence.status,
    });
    return;
  }

  // 2. Calculate expiry — the earlier of validityDays from now or the licence expiry
  const offlineExpiry = new Date();
  offlineExpiry.setDate(offlineExpiry.getDate() + params.validityDays);
  const effectiveExpiry = licence.expiryDate < offlineExpiry ? licence.expiryDate : offlineExpiry;

  // 3. Generate the signed offline licence file
  const offlineData = generateOfflineLicenceFile({
    licenceId: licence.id,
    customerName: licence.customer.name,
    licensedUsers: licence.licensedUsers,
    deploymentModel: licence.customer.deploymentModel,
    expiryDate: effectiveExpiry.toISOString(),
    instanceId: params.instanceId || null,
    validityDays: params.validityDays,
  });

  // 4. Store a record in the offline_files table
  const adminUserId = (req as any).adminUser?.id || 'system';

  const offlineFile = await prisma.offlineFile.create({
    data: {
      licenceId: licence.id,
      expiresAt: effectiveExpiry,
      generatedBy: adminUserId,
      fileHash: offlineData.fileHash,
    },
  });

  // 5. Audit log
  logAuditEvent({
    userId: adminUserId,
    action: 'offline_file.generate',
    targetType: 'licence',
    targetId: licence.id,
    details: {
      offlineFileId: offlineFile.id,
      validityDays: params.validityDays,
      expiresAt: effectiveExpiry.toISOString(),
      instanceId: params.instanceId || null,
    },
  });

  logger.info('Offline licence file generated', {
    licenceId: licence.id,
    offlineFileId: offlineFile.id,
    customer: licence.customer.name,
    expiresAt: effectiveExpiry.toISOString(),
  });

  // 6. Return the signed file content
  res.status(201).json({
    data: {
      id: offlineFile.id,
      licenceId: licence.id,
      customer: licence.customer.name,
      expiresAt: effectiveExpiry.toISOString(),
      fileHash: offlineData.fileHash,
      createdAt: offlineFile.issuedAt,
    },
    file: {
      payload: offlineData.payload,
      signature: offlineData.signature,
      fileHash: offlineData.fileHash,
    },
  });
});

// GET /api/admin/licences/:id/offline-files — List offline files for a licence
router.get('/:id/offline-files', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const offlineFiles = await prisma.offlineFile.findMany({
    where: { licenceId: id },
    orderBy: { issuedAt: 'desc' },
  });

  res.json({ data: offlineFiles, total: offlineFiles.length });
});

export default router;
