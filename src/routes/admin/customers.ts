import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import type { AdminAuthRequest } from '../../middleware/adminAuth';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Customer Management
// Reference: Architecture Doc, Section 7.2
// ─────────────────────────────────────────────

// Helper: Generate the next customer number in format PCSCN-YYYYMMDD-0001
async function generateCustomerNumber(): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `PCSCN-${dateStr}-`;

  // Find the highest existing number for today
  const latest = await prisma.customer.findFirst({
    where: { customerNumber: { startsWith: prefix } },
    orderBy: { customerNumber: 'desc' },
    select: { customerNumber: true },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.customerNumber.slice(prefix.length), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// GET /api/admin/customers — List all customers with licence summaries
router.get('/', async (_req: Request, res: Response) => {
  const customers = await prisma.customer.findMany({
    include: {
      licences: {
        select: {
          id: true,
          status: true,
          licensedUsers: true,
          expiryDate: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ data: customers, total: customers.length });
});

// POST /api/admin/customers — Create a new customer record
const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  contactEmail: z.string().email('Valid email address is required'),
  contactPhone: z.string().optional(),
  primaryContact: z.string().optional(),
  deploymentModel: z.enum(['SAAS', 'HYBRID', 'ON_PREMISES']),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const data = createCustomerSchema.parse(req.body);

  const customerNumber = await generateCustomerNumber();

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      name: data.name,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone || null,
      primaryContact: data.primaryContact || null,
      deploymentModel: data.deploymentModel,
      notes: data.notes,
    },
  });

  logger.info('Customer created', {
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    name: customer.name,
  });

  // TODO: Log to audit trail

  res.status(201).json({ data: customer });
});

// PATCH /api/admin/customers/:id — Update customer details
const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional().nullable(),
  primaryContact: z.string().optional().nullable(),
  deploymentModel: z.enum(['SAAS', 'HYBRID', 'ON_PREMISES']).optional(),
  notes: z.string().optional().nullable(),
});

router.patch('/:id', async (req: AdminAuthRequest, res: Response) => {
  const id = req.params.id as string;
  const updates = updateCustomerSchema.parse(req.body);

  // Fetch existing customer for audit purposes
  const existingCustomer = await prisma.customer.findUnique({
    where: { id },
  });

  if (!existingCustomer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  // Log deployment model change if applicable
  if (updates.deploymentModel && updates.deploymentModel !== existingCustomer.deploymentModel) {
    logger.warn('Deployment model change requested', {
      customerId: id,
      oldModel: existingCustomer.deploymentModel,
      newModel: updates.deploymentModel,
    });
  }

  // Update customer
  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data: updates as any,
  });

  // Build details object for audit log (only changed fields)
  const changedFields: Record<string, unknown> = {};
  let hasChanges = false;

  if (updates.name && updates.name !== existingCustomer.name) {
    changedFields.name = { old: existingCustomer.name, new: updates.name };
    hasChanges = true;
  }
  if (updates.contactEmail && updates.contactEmail !== existingCustomer.contactEmail) {
    changedFields.contactEmail = { old: existingCustomer.contactEmail, new: updates.contactEmail };
    hasChanges = true;
  }
  if (updates.contactPhone !== undefined && updates.contactPhone !== existingCustomer.contactPhone) {
    changedFields.contactPhone = { old: existingCustomer.contactPhone, new: updates.contactPhone };
    hasChanges = true;
  }
  if (updates.primaryContact !== undefined && updates.primaryContact !== existingCustomer.primaryContact) {
    changedFields.primaryContact = { old: existingCustomer.primaryContact, new: updates.primaryContact };
    hasChanges = true;
  }
  if (updates.deploymentModel && updates.deploymentModel !== existingCustomer.deploymentModel) {
    changedFields.deploymentModel = { old: existingCustomer.deploymentModel, new: updates.deploymentModel };
    hasChanges = true;
  }
  if (updates.notes !== undefined && updates.notes !== existingCustomer.notes) {
    changedFields.notes = { old: existingCustomer.notes, new: updates.notes };
    hasChanges = true;
  }

  // Log to audit trail if there are changes
  if (hasChanges && req.adminUser) {
    await prisma.auditLog.create({
      data: {
        userId: req.adminUser.id,
        action: 'customer.update',
        targetType: 'customer',
        targetId: id,
        details: changedFields as any,
      },
    });
  }

  logger.info('Customer updated', {
    customerId: id,
    changedFields: Object.keys(changedFields),
  });

  res.json({ data: updatedCustomer });
});

export default router;
