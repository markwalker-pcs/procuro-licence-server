import { Router, Request, Response } from 'express';
import { prisma } from '../../config/prisma';

const router = Router();

// ─────────────────────────────────────────────
// Admin API — Instance Monitoring
// Reference: Architecture Doc, Sections 5.2, 7.2
// ─────────────────────────────────────────────

// GET /api/admin/instances — List all registered instances with last check-in data
router.get('/', async (_req: Request, res: Response) => {
  const instances = await prisma.instance.findMany({
    include: {
      licence: {
        select: {
          id: true,
          licenceKey: true,
          licensedUsers: true,
          status: true,
          customer: { select: { id: true, name: true } },
        },
      },
      deployment: {
        select: {
          id: true,
          deploymentLabel: true,
          containerAppName: true,
          status: true,
        },
      },
    },
    orderBy: { lastCheckIn: 'desc' },
  });

  res.json({ data: instances, total: instances.length });
});

// GET /api/admin/instances/:id/history — View full check-in history for an instance
router.get('/:id/history', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const checkIns = await prisma.checkIn.findMany({
    where: { instanceId: id },
    orderBy: { timestamp: 'desc' },
    take: 100, // Last 100 check-ins
  });

  res.json({ data: checkIns, total: checkIns.length });
});

export default router;
