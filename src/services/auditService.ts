import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

/**
 * Audit logging service.
 * Reference: Architecture Doc, Sections 5.2, 6
 *
 * Records all administrative actions for compliance and security.
 */

export async function logAuditEvent(params: {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : undefined,
      },
    });

    logger.debug('Audit event logged', {
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
    });
  } catch (error) {
    // Audit logging should never crash the application
    logger.error('Failed to log audit event', { error, ...params });
  }
}
