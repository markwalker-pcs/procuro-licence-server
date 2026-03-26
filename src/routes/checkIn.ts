import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { BUILD_ID } from '../buildInfo';
import { verifyCheckInHmac } from '../services/hmacService';
import { findLicenceByKey, determineLicenceStatus } from '../services/licenceService';
import { signCheckInResponse } from '../services/cryptoService';

const router = Router();

// ─────────────────────────────────────────────
// POST /api/v1/check-in
// Daily licence validation — called by Pro-curo V5 instances
// Reference: Architecture Doc, Section 4.2
// ─────────────────────────────────────────────

const checkInSchema = z.object({
  licenceKey: z.string().min(1, 'Licence key is required'),
  instanceId: z.string().uuid('Instance ID must be a valid UUID'),
  activeUsers: z.number().int().min(0),           // Total active user accounts (used by PER_USER)
  activeSessions: z.number().int().min(0).optional(), // Current simultaneous sessions (used by CONCURRENT)
  softwareVersion: z.string().min(1),
  checksum: z.string().min(1, 'HMAC checksum is required'),
  timestamp: z.string().datetime().optional(),
  nonce: z.string().optional(),
});

router.post('/check-in', async (req: Request, res: Response) => {
  try {
    const payload = checkInSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // 1. Validate HMAC checksum
    const hmacValid = verifyCheckInHmac(
      {
        licenceKey: payload.licenceKey,
        instanceId: payload.instanceId,
        activeUsers: payload.activeUsers,
        softwareVersion: payload.softwareVersion,
      },
      payload.checksum
    );

    if (!hmacValid) {
      logger.warn('Invalid HMAC on check-in', {
        instanceId: payload.instanceId,
        ip: clientIp,
      });

      res.status(401).json({
        status: 'INVALID',
        message: 'Check-in validation failed. HMAC checksum mismatch.',
      });
      return;
    }

    // 2. Look up licence by key (bcrypt compare)
    const licence = await findLicenceByKey(payload.licenceKey);

    if (!licence) {
      logger.warn('Check-in with unknown licence key', {
        instanceId: payload.instanceId,
        ip: clientIp,
      });

      // Log failed check-in attempt
      res.status(404).json({
        status: 'INVALID',
        message: 'Licence key not recognised.',
      });
      return;
    }

    // 3. Determine licence status (type-aware)
    const licenceStatus = determineLicenceStatus(
      {
        status: licence.status,
        expiryDate: licence.expiryDate,
        licensedUsers: licence.licensedUsers,
        licenceType: licence.licenceType,
      },
      payload.activeUsers,
      payload.activeSessions
    );

    // 4. Register or update the instance record
    const instance = await prisma.instance.upsert({
      where: { instanceUuid: payload.instanceId },
      update: {
        softwareVersion: payload.softwareVersion,
        lastCheckIn: new Date(),
        activeUsers: payload.activeUsers,
        ipAddress: clientIp,
      },
      create: {
        licenceId: licence.id,
        instanceUuid: payload.instanceId,
        softwareVersion: payload.softwareVersion,
        lastCheckIn: new Date(),
        activeUsers: payload.activeUsers,
        ipAddress: clientIp,
      },
    });

    // 5. Log the check-in to audit trail
    await prisma.checkIn.create({
      data: {
        instanceId: instance.id,
        activeUsers: payload.activeUsers,
        softwareVersion: payload.softwareVersion,
        responseStatus: licenceStatus.status,
        ipAddress: clientIp,
      },
    });

    logger.info('Check-in processed', {
      instanceId: payload.instanceId,
      customer: licence.customer.name,
      status: licenceStatus.status,
      activeUsers: payload.activeUsers,
      licensedUsers: licence.licensedUsers,
    });

    // 6. Build response
    const responseBody = {
      status: licenceStatus.status.toLowerCase(),
      licenceType: licence.licenceType.toLowerCase(),   // 'per_user' or 'concurrent'
      licensedUsers: licence.licensedUsers,
      expiryDate: licence.expiryDate.toISOString(),
      gracePeriodDays: licence.gracePeriodDays,
      features: {},
      message: licenceStatus.message,
    };

    // 7. Sign the response with Ed25519
    let signature = '';
    try {
      signature = signCheckInResponse(responseBody);
    } catch (error) {
      logger.warn('Failed to sign check-in response — keys may not be initialised', { error });
      signature = 'signing-unavailable';
    }

    res.json({
      ...responseBody,
      signature,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid check-in payload',
        details: error.errors,
      });
      return;
    }
    throw error;
  }
});

// ─────────────────────────────────────────────
// GET /api/v1/status
// Lightweight health check — used by V5 instances to test
// connectivity before attempting a full check-in
// Reference: Architecture Doc, Section 7.1
// ─────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'pro-curo-licence-server',
    build: BUILD_ID,
    timestamp: new Date().toISOString(),
  });
});

export default router;
