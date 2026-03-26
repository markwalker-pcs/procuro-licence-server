/**
 * HMAC-SHA256 computation for check-in payload signing.
 *
 * The client computes the HMAC over the check-in fields using a shared
 * secret. The licence server recomputes it to verify the request hasn't
 * been tampered with.
 *
 * Field order must match the server's verifyCheckInHmac() exactly.
 */

import crypto from 'crypto';

export function computeCheckInHmac(
  payload: {
    licenceKey: string;
    instanceId: string;
    activeUsers: number;
    softwareVersion: string;
  },
  hmacSecret: string
): string {
  const data = [
    payload.licenceKey,
    payload.instanceId,
    payload.activeUsers.toString(),
    payload.softwareVersion,
  ].join('|');

  return crypto
    .createHmac('sha256', hmacSecret)
    .update(data)
    .digest('hex');
}
