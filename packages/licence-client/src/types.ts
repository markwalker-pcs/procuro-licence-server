/**
 * @pro-curo/licence-client — Type definitions
 *
 * These types define the contract between Pro-curo V5 instances
 * and the Pro-curo Licence Server.
 *
 * Pro-curo Software Limited
 */

// ─── Licence Types ───

export type LicenceType = 'per_user' | 'concurrent';

export type LicenceStatus = 'valid' | 'warning' | 'expired' | 'invalid';

// ─── Check-in Request/Response ───

export interface CheckInPayload {
  licenceKey: string;
  instanceId: string;
  activeUsers: number;       // Total active user accounts in the V5 instance
  activeSessions?: number;   // Current simultaneous sessions (for concurrent licences)
  softwareVersion: string;
  checksum: string;          // HMAC-SHA256 checksum
  timestamp?: string;
  nonce?: string;
}

export interface CheckInResponse {
  status: LicenceStatus;
  licenceType: LicenceType;
  licensedUsers: number;
  expiryDate: string;         // ISO 8601
  gracePeriodDays: number;
  features: Record<string, unknown>;
  message: string;
  signature: string;          // Ed25519 signature
}

// ─── Cached Licence State ───

export interface CachedLicenceState {
  /** The last successful check-in response */
  lastResponse: CheckInResponse;
  /** When the last successful check-in occurred (ISO 8601) */
  lastCheckInAt: string;
  /** When the cache was written (ISO 8601) */
  cachedAt: string;
  /** Instance ID that performed the check-in */
  instanceId: string;
}

// ─── Client Configuration ───

export interface LicenceClientConfig {
  /** URL of the licence server (e.g. https://licence.pro-curo.com) */
  serverUrl: string;
  /** The licence key for this instance */
  licenceKey: string;
  /** Unique UUID for this V5 instance */
  instanceId: string;
  /** Current V5 software version / build ID */
  softwareVersion: string;
  /** HMAC secret shared between the instance and the licence server */
  hmacSecret: string;
  /** Path to the cache file for persisting licence state between restarts */
  cachePath: string;
  /** Path to the Ed25519 public key for verifying server signatures */
  publicKeyPath?: string;
  /** Path to an offline .lic file (for air-gapped deployments) */
  offlineLicenceFilePath?: string;
  /** How often to check in, in milliseconds (default: 24 hours) */
  checkInIntervalMs?: number;
  /** Callback invoked when licence status changes */
  onStatusChange?: (status: LicenceStatus, message: string) => void;
  /** Callback invoked on check-in errors */
  onCheckInError?: (error: Error) => void;
  /** Logger (defaults to console) */
  logger?: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

// ─── Licence Enforcement ───

/** Result of checking whether a login should be allowed */
export interface LoginCheckResult {
  allowed: boolean;
  reason: string;
  licenceType: LicenceType;
  licensedUsers: number;
  currentUsage: number;      // activeUsers for PER_USER, activeSessions for CONCURRENT
  remainingSlots: number;
}

/** Result of checking overall licence validity */
export interface LicenceValidityResult {
  valid: boolean;
  status: LicenceStatus;
  message: string;
  licenceType: LicenceType;
  licensedUsers: number;
  expiryDate: string;
  gracePeriodDays: number;
  daysUntilExpiry: number;
  daysSinceLastCheckIn: number;
  inGracePeriod: boolean;
  graceExpired: boolean;
}
