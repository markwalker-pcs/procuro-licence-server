import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

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

export default router;
