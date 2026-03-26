/**
 * @pro-curo/licence-client
 *
 * Licence validation client for Pro-curo V5 instances.
 * Handles check-ins, caching, grace periods, and login enforcement
 * for both per-user and concurrent licence models.
 *
 * Usage:
 *
 *   import { LicenceClient } from '@pro-curo/licence-client';
 *
 *   const client = new LicenceClient({
 *     serverUrl: 'https://licence.pro-curo.com',
 *     licenceKey: 'PCV5-XXXX-XXXX-XXXX-XXXX',
 *     instanceId: '550e8400-e29b-41d4-a716-446655440000',
 *     softwareVersion: 'PCSv5-20260326-1100-24',
 *     hmacSecret: process.env.LICENCE_HMAC_SECRET!,
 *     cachePath: './data/licence-cache.json',
 *   });
 *
 *   await client.start();
 *
 *   // On login:
 *   const result = client.checkLogin(activeUsers, activeSessions, isExistingUser);
 *   if (!result.allowed) {
 *     throw new Error(result.reason);
 *   }
 *
 * Pro-curo Software Limited
 */

export { LicenceClient } from './client';
export { LicenceCache } from './cache';
export { computeCheckInHmac } from './hmac';
export type {
  LicenceClientConfig,
  CheckInPayload,
  CheckInResponse,
  CachedLicenceState,
  LicenceType,
  LicenceStatus,
  LoginCheckResult,
  LicenceValidityResult,
} from './types';
