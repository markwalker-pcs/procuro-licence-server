import crypto from 'crypto';
import { config } from '../config';

/**
 * HMAC-SHA256 service for check-in payload validation.
 * Reference: Architecture Doc, Section 4.2 — checksum field
 *
 * The V5 instance computes an HMAC-SHA256 over the check-in fields
 * using a shared secret. The licence server recomputes it to verify
 * the request hasn't been tampered with.
 */

/**
 * Compute HMAC-SHA256 checksum over check-in payload fields.
 * Fields are concatenated in a deterministic order.
 */
export function computeCheckInHmac(payload: {
  licenceKey: string;
  instanceId: string;
  activeUsers: number;
  softwareVersion: string;
}): string {
  const data = [
    payload.licenceKey,
    payload.instanceId,
    payload.activeUsers.toString(),
    payload.softwareVersion,
  ].join('|');

  return crypto
    .createHmac('sha256', config.hmacSecret)
    .update(data)
    .digest('hex');
}

/**
 * Verify that the provided checksum matches the expected HMAC.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyCheckInHmac(
  payload: {
    licenceKey: string;
    instanceId: string;
    activeUsers: number;
    softwareVersion: string;
  },
  providedChecksum: string
): boolean {
  const expected = computeCheckInHmac(payload);

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedChecksum, 'hex')
    );
  } catch {
    // If buffers are different lengths, timingSafeEqual throws
    return false;
  }
}
