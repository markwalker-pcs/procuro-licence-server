import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

/**
 * Licence management service.
 * Reference: Architecture Doc, Sections 4.2, 5.2, 6
 *
 * Handles licence key generation, hashing, lookup, and validation.
 * In production, licence keys are stored as bcrypt hashes — the plaintext
 * key is only returned once at creation time and cannot be recovered.
 */

const BCRYPT_ROUNDS = 12;

/**
 * Generate a licence key in format PCV5-XXXX-XXXX-XXXX-XXXX.
 * Uses characters that avoid visual ambiguity (no I, O, 0, 1).
 * Reference: Architecture Doc, Section 5.3
 */
export function generateLicenceKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PCV5-${segment()}-${segment()}-${segment()}-${segment()}`;
}

/**
 * Hash a licence key using bcrypt for secure storage.
 */
export async function hashLicenceKey(plainKey: string): Promise<string> {
  return bcrypt.hash(plainKey, BCRYPT_ROUNDS);
}

/**
 * Find a licence by comparing the provided plaintext key against
 * all active bcrypt hashes. This is intentionally slow (bcrypt is
 * computationally expensive) but acceptable for daily check-ins.
 *
 * In a high-volume scenario, a key prefix index could be added
 * to reduce the number of bcrypt comparisons needed.
 */
export async function findLicenceByKey(plainKey: string) {
  // Fetch all active/suspended licences (not revoked)
  const licences = await prisma.licence.findMany({
    where: {
      status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] },
    },
    include: {
      customer: true,
    },
  });

  for (const licence of licences) {
    const match = await bcrypt.compare(plainKey, licence.licenceKey);
    if (match) {
      return licence;
    }
  }

  return null;
}

/**
 * Determine the effective licence status based on the licence record,
 * the licence type, and the current date.
 *
 * For PER_USER licences: activeUsers = total active user accounts in the V5 instance.
 * For CONCURRENT licences: activeSessions = current simultaneous logged-in sessions.
 *
 * Reference: Architecture Doc, Section 4.4 — Grace Period and Offline Behaviour
 */
export function determineLicenceStatus(licence: {
  status: string;
  expiryDate: Date;
  licensedUsers: number;
  licenceType: string;
}, activeUsers: number, activeSessions?: number): {
  status: 'VALID' | 'WARNING' | 'EXPIRED' | 'INVALID';
  message: string;
} {
  // Revoked — immediate rejection
  if (licence.status === 'REVOKED') {
    return {
      status: 'INVALID',
      message: 'This licence has been revoked. Please contact Pro-curo Software.',
    };
  }

  // Suspended — warning but still functional
  if (licence.status === 'SUSPENDED') {
    return {
      status: 'WARNING',
      message: 'This licence is suspended. Please contact Pro-curo Software.',
    };
  }

  // Expired
  const now = new Date();
  if (licence.expiryDate < now) {
    return {
      status: 'EXPIRED',
      message: 'This licence has expired. Please contact Pro-curo Software to renew.',
    };
  }

  // Expiring within 30 days — warning
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpiringSoon = licence.expiryDate < thirtyDaysFromNow;

  // Check limits based on licence type
  if (licence.licenceType === 'CONCURRENT') {
    // Concurrent: check active sessions against licensed limit
    const sessions = activeSessions ?? 0;
    if (sessions > licence.licensedUsers) {
      return {
        status: 'WARNING',
        message: `Active sessions (${sessions}) exceeds concurrent licence limit (${licence.licensedUsers}). Please contact Pro-curo Software to increase your licence.`,
      };
    }
  } else {
    // Per-user: check total active user accounts against licensed limit
    if (activeUsers > licence.licensedUsers) {
      return {
        status: 'WARNING',
        message: `Active users (${activeUsers}) exceeds licensed limit (${licence.licensedUsers}). Please contact Pro-curo Software to increase your licence.`,
      };
    }
  }

  if (isExpiringSoon) {
    const daysLeft = Math.ceil((licence.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return {
      status: 'WARNING',
      message: `Licence expires in ${daysLeft} days. Please contact Pro-curo Software to renew.`,
    };
  }

  // All good
  return {
    status: 'VALID',
    message: 'Licence is valid.',
  };
}
