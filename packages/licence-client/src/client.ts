/**
 * @pro-curo/licence-client — Main client class
 *
 * The LicenceClient manages the lifecycle of licence validation for a
 * Pro-curo V5 instance:
 *
 *   1. Performs daily check-ins to the licence server
 *   2. Caches responses to disc for grace-period offline operation
 *   3. Validates login attempts against per-user or concurrent limits
 *   4. Provides overall licence validity status for the UI
 *
 * Pro-curo Software Limited
 */

import axios, { AxiosInstance } from 'axios';
import { LicenceCache } from './cache';
import { computeCheckInHmac } from './hmac';
import type {
  LicenceClientConfig,
  CheckInResponse,
  LicenceStatus,
  LicenceType,
  LoginCheckResult,
  LicenceValidityResult,
} from './types';

const DEFAULT_CHECK_IN_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export class LicenceClient {
  private readonly config: Required<
    Pick<LicenceClientConfig, 'serverUrl' | 'licenceKey' | 'instanceId' | 'softwareVersion' | 'hmacSecret' | 'cachePath'>
  > & LicenceClientConfig;

  private readonly cache: LicenceCache;
  private readonly http: AxiosInstance;
  private readonly log: NonNullable<LicenceClientConfig['logger']>;

  private checkInTimer: ReturnType<typeof setInterval> | null = null;
  private lastStatus: LicenceStatus = 'valid';

  constructor(config: LicenceClientConfig) {
    this.config = {
      checkInIntervalMs: DEFAULT_CHECK_IN_INTERVAL,
      ...config,
    };

    this.log = config.logger ?? {
      info: (msg, meta) => console.log(`[licence-client] ${msg}`, meta ?? ''),
      warn: (msg, meta) => console.warn(`[licence-client] ${msg}`, meta ?? ''),
      error: (msg, meta) => console.error(`[licence-client] ${msg}`, meta ?? ''),
    };

    this.cache = new LicenceCache(this.config.cachePath);
    this.cache.load();

    this.http = axios.create({
      baseURL: this.config.serverUrl,
      timeout: 15_000, // 15 seconds
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `pro-curo-licence-client/1.0 (${this.config.softwareVersion})`,
      },
    });
  }

  // ─── Lifecycle ───

  /**
   * Initialise the client: load cache, perform an initial check-in,
   * and start the periodic check-in timer.
   *
   * Call this once at V5 backend startup.
   */
  async start(): Promise<void> {
    this.log.info('Starting licence client', {
      serverUrl: this.config.serverUrl,
      instanceId: this.config.instanceId,
    });

    // Try an immediate check-in
    try {
      await this.checkIn(0, 0);
      this.log.info('Initial check-in successful');
    } catch (err) {
      const cached = this.cache.getState();
      if (cached) {
        this.log.warn('Initial check-in failed — running from cached state', {
          lastCheckIn: cached.lastCheckInAt,
          gracePeriodDays: cached.lastResponse.gracePeriodDays,
        });
      } else {
        this.log.error('Initial check-in failed and no cached state — licence status unknown');
      }
    }

    // Start periodic check-ins
    const interval = this.config.checkInIntervalMs ?? DEFAULT_CHECK_IN_INTERVAL;
    this.checkInTimer = setInterval(() => {
      // The actual activeUsers/activeSessions will be provided by the V5 backend
      // via the periodic check-in callback. For timer-based check-ins, we use
      // the last known values or defaults.
      this.checkIn(0, 0).catch((err) => {
        this.log.warn('Periodic check-in failed', { error: (err as Error).message });
      });
    }, interval);

    this.log.info(`Check-in timer started (every ${Math.round(interval / 60000)} minutes)`);
  }

  /** Stop the periodic check-in timer. */
  stop(): void {
    if (this.checkInTimer) {
      clearInterval(this.checkInTimer);
      this.checkInTimer = null;
      this.log.info('Licence client stopped');
    }
  }

  // ─── Check-in ───

  /**
   * Perform a check-in to the licence server.
   *
   * @param activeUsers - Total active user accounts in the V5 instance
   * @param activeSessions - Current number of logged-in sessions (for concurrent licences)
   */
  async checkIn(activeUsers: number, activeSessions: number): Promise<CheckInResponse> {
    const checksum = computeCheckInHmac(
      {
        licenceKey: this.config.licenceKey,
        instanceId: this.config.instanceId,
        activeUsers,
        softwareVersion: this.config.softwareVersion,
      },
      this.config.hmacSecret
    );

    const response = await this.http.post<CheckInResponse>('/api/v1/check-in', {
      licenceKey: this.config.licenceKey,
      instanceId: this.config.instanceId,
      activeUsers,
      activeSessions,
      softwareVersion: this.config.softwareVersion,
      checksum,
      timestamp: new Date().toISOString(),
    });

    const result = response.data;

    // Cache the successful response
    this.cache.save(result, this.config.instanceId);

    // Notify status change
    const newStatus = result.status as LicenceStatus;
    if (newStatus !== this.lastStatus) {
      this.lastStatus = newStatus;
      this.config.onStatusChange?.(newStatus, result.message);
    }

    this.log.info('Check-in completed', {
      status: result.status,
      licenceType: result.licenceType,
      licensedUsers: result.licensedUsers,
      gracePeriodDays: result.gracePeriodDays,
    });

    return result;
  }

  /**
   * Perform a check-in with current usage data. This is the preferred
   * method for V5 to call, as it provides up-to-date user/session counts.
   */
  async checkInWithUsage(activeUsers: number, activeSessions: number): Promise<CheckInResponse> {
    return this.checkIn(activeUsers, activeSessions);
  }

  // ─── Licence Status ───

  /**
   * Get the current licence validity. This uses the cached state and
   * applies grace period logic — it does NOT make a network call.
   */
  getValidity(): LicenceValidityResult {
    const cached = this.cache.getState();

    if (!cached) {
      return {
        valid: false,
        status: 'invalid',
        message: 'No licence data available. The licence server has never been contacted.',
        licenceType: 'per_user',
        licensedUsers: 0,
        expiryDate: '',
        gracePeriodDays: 0,
        daysUntilExpiry: 0,
        daysSinceLastCheckIn: Infinity,
        inGracePeriod: false,
        graceExpired: true,
      };
    }

    const resp = cached.lastResponse;
    const daysSinceCheckIn = this.cache.daysSinceLastCheckIn();
    const graceExpired = this.cache.isGraceExpired();
    const inGracePeriod = daysSinceCheckIn > 1 && !graceExpired; // More than a day since check-in but within grace

    const expiryDate = new Date(resp.expiryDate);
    const now = new Date();
    const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

    // Determine effective status
    let effectiveStatus = resp.status as LicenceStatus;
    let effectiveMessage = resp.message;

    // If the licence has expired since the last check-in
    if (daysUntilExpiry < 0 && effectiveStatus !== 'expired' && effectiveStatus !== 'invalid') {
      effectiveStatus = 'expired';
      effectiveMessage = 'This licence has expired. Please contact Pro-curo Software to renew.';
    }

    // If grace period has expired, escalate to invalid
    if (graceExpired && effectiveStatus !== 'invalid') {
      effectiveStatus = 'invalid';
      effectiveMessage = `Unable to reach the licence server for ${Math.floor(daysSinceCheckIn)} days (grace period: ${resp.gracePeriodDays} days). Please restore connectivity.`;
    }

    // If in grace period but more than half through, add a warning
    if (inGracePeriod && effectiveStatus === 'valid') {
      const halfGrace = resp.gracePeriodDays / 2;
      if (daysSinceCheckIn > halfGrace) {
        effectiveStatus = 'warning';
        effectiveMessage = `Unable to reach the licence server for ${Math.floor(daysSinceCheckIn)} days. Grace period expires in ${Math.ceil(resp.gracePeriodDays - daysSinceCheckIn)} days.`;
      }
    }

    return {
      valid: effectiveStatus === 'valid' || effectiveStatus === 'warning',
      status: effectiveStatus,
      message: effectiveMessage,
      licenceType: resp.licenceType as LicenceType,
      licensedUsers: resp.licensedUsers,
      expiryDate: resp.expiryDate,
      gracePeriodDays: resp.gracePeriodDays,
      daysUntilExpiry,
      daysSinceLastCheckIn: daysSinceCheckIn,
      inGracePeriod,
      graceExpired,
    };
  }

  // ─── Login Enforcement ───

  /**
   * Check whether a login should be allowed based on the licence type
   * and current usage.
   *
   * For PER_USER: checks total active user accounts against the limit.
   * For CONCURRENT: checks current active sessions against the limit.
   *
   * @param activeUsers - Total active (non-disabled) user accounts in V5
   * @param activeSessions - Current number of active sessions (logged-in users)
   * @param isExistingUser - Whether this is an existing user (already counted in activeUsers)
   */
  checkLogin(activeUsers: number, activeSessions: number, isExistingUser: boolean): LoginCheckResult {
    const validity = this.getValidity();

    // If licence is completely invalid (grace expired, revoked, etc.), deny
    if (!validity.valid) {
      return {
        allowed: false,
        reason: validity.message,
        licenceType: validity.licenceType,
        licensedUsers: validity.licensedUsers,
        currentUsage: validity.licenceType === 'concurrent' ? activeSessions : activeUsers,
        remainingSlots: 0,
      };
    }

    if (validity.licenceType === 'concurrent') {
      // CONCURRENT: check if adding another session would exceed the limit
      const remaining = validity.licensedUsers - activeSessions;
      if (remaining <= 0) {
        return {
          allowed: false,
          reason: `All ${validity.licensedUsers} concurrent licence slots are in use. Please wait for another user to log out or contact Pro-curo Software to increase your concurrent licence.`,
          licenceType: 'concurrent',
          licensedUsers: validity.licensedUsers,
          currentUsage: activeSessions,
          remainingSlots: 0,
        };
      }

      return {
        allowed: true,
        reason: 'Login permitted.',
        licenceType: 'concurrent',
        licensedUsers: validity.licensedUsers,
        currentUsage: activeSessions,
        remainingSlots: remaining,
      };
    } else {
      // PER_USER: check if the total user count is within limits
      // If this is a new user being created, they'd push the count up by 1
      const effectiveUsers = isExistingUser ? activeUsers : activeUsers + 1;
      const remaining = validity.licensedUsers - effectiveUsers;

      if (remaining < 0) {
        return {
          allowed: false,
          reason: `All ${validity.licensedUsers} per-user licence slots are allocated. Please contact Pro-curo Software to increase your licence.`,
          licenceType: 'per_user',
          licensedUsers: validity.licensedUsers,
          currentUsage: activeUsers,
          remainingSlots: 0,
        };
      }

      return {
        allowed: true,
        reason: 'Login permitted.',
        licenceType: 'per_user',
        licensedUsers: validity.licensedUsers,
        currentUsage: activeUsers,
        remainingSlots: remaining,
      };
    }
  }

  // ─── Server Connectivity ───

  /**
   * Test connectivity to the licence server (lightweight — calls /api/v1/status).
   */
  async testConnection(): Promise<{ ok: boolean; serverBuild?: string; error?: string }> {
    try {
      const response = await this.http.get('/api/v1/status');
      return {
        ok: true,
        serverBuild: response.data.build,
      };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message,
      };
    }
  }

  // ─── Accessors ───

  /** Get the current cached licence type. */
  getLicenceType(): LicenceType | null {
    return this.cache.getState()?.lastResponse.licenceType as LicenceType ?? null;
  }

  /** Get the licensed user/session limit. */
  getLicensedUsers(): number {
    return this.cache.getState()?.lastResponse.licensedUsers ?? 0;
  }

  /** Get the last check-in timestamp. */
  getLastCheckInAt(): string | null {
    return this.cache.getState()?.lastCheckInAt ?? null;
  }

  /** Get the raw cached state (for diagnostics/admin display). */
  getCachedState() {
    return this.cache.getState();
  }
}
