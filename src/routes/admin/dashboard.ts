import { Router, Request, Response } from 'express';
import { prisma } from '../../config/prisma';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Dashboard & Alerts
// Reference: Architecture Doc, Sections 5.4, 7.2
// ─────────────────────────────────────────────

// GET /api/admin/dashboard — Aggregated statistics for the monitoring dashboard
router.get('/', async (_req: Request, res: Response) => {
  const [
    totalCustomers,
    totalLicences,
    activeLicences,
    totalInstances,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.licence.count(),
    prisma.licence.count({ where: { status: 'ACTIVE' } }),
    prisma.instance.count(),
  ]);

  // Instances that haven't checked in for 7+ days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const offlineInstances = await prisma.instance.count({
    where: {
      lastCheckIn: { lt: sevenDaysAgo },
    },
  });

  // Licences expiring within 30 days
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringLicences = await prisma.licence.count({
    where: {
      status: 'ACTIVE',
      expiryDate: { lte: thirtyDaysFromNow },
    },
  });

  res.json({
    data: {
      totalCustomers,
      totalLicences,
      activeLicences,
      totalInstances,
      offlineInstances,
      expiringLicences,
    },
  });
});

// GET /api/admin/alerts — View active alerts
router.get('/alerts', async (_req: Request, res: Response) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [offlineInstances, expiringLicences] = await Promise.all([
    // Instances offline for 7+ days
    prisma.instance.findMany({
      where: { lastCheckIn: { lt: sevenDaysAgo } },
      include: {
        licence: {
          select: { customer: { select: { name: true } } },
        },
      },
    }),
    // Licences expiring within 30 days
    prisma.licence.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: thirtyDaysFromNow },
      },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  // TODO: Add user-limit-exceeded alerts (activeUsers > licensedUsers)

  res.json({
    data: {
      offlineInstances: offlineInstances.map((i: any) => ({
        instanceId: i.id,
        instanceUuid: i.instanceUuid,
        lastCheckIn: i.lastCheckIn,
        customer: i.licence.customer.name,
        severity: 'warning',
      })),
      expiringLicences: expiringLicences.map((l: any) => ({
        licenceId: l.id,
        expiryDate: l.expiryDate,
        customer: l.customer.name,
        severity: l.expiryDate < new Date() ? 'critical' : 'warning',
      })),
    },
  });
});

// GET /api/admin/audit-log — View audit log with filtering and pagination
router.get('/audit-log', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count(),
  ]);

  res.json({ data: logs, total, page, limit });
});

export default router;
