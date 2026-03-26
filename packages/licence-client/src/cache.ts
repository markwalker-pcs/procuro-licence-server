/**
 * Licence state cache — persists the last successful check-in response
 * to disc so the instance can operate during network outages within
 * the configured grace period.
 *
 * The cache file is a simple JSON file written atomically (write to
 * temp file, then rename) to avoid corruption on power failure.
 */

import fs from 'fs';
import path from 'path';
import type { CachedLicenceState, CheckInResponse } from './types';

export class LicenceCache {
  private readonly cachePath: string;
  private state: CachedLicenceState | null = null;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
  }

  /** Load cached state from disc. Returns null if no cache exists or is corrupt. */
  load(): CachedLicenceState | null {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as CachedLicenceState;

      // Basic validation
      if (!parsed.lastResponse || !parsed.lastCheckInAt || !parsed.instanceId) {
        return null;
      }

      this.state = parsed;
      return parsed;
    } catch {
      // Corrupt or unreadable — treat as no cache
      return null;
    }
  }

  /** Save a new check-in response to the cache. */
  save(response: CheckInResponse, instanceId: string): void {
    const now = new Date().toISOString();
    this.state = {
      lastResponse: response,
      lastCheckInAt: now,
      cachedAt: now,
      instanceId,
    };

    // Atomic write: write to temp file, then rename
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${this.cachePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.cachePath);
  }

  /** Get the current in-memory cached state. */
  getState(): CachedLicenceState | null {
    return this.state;
  }

  /** Calculate days since last successful check-in. Returns Infinity if no cache. */
  daysSinceLastCheckIn(): number {
    if (!this.state) return Infinity;
    const lastCheckIn = new Date(this.state.lastCheckInAt);
    const now = new Date();
    return (now.getTime() - lastCheckIn.getTime()) / (24 * 60 * 60 * 1000);
  }

  /** Check whether the grace period has expired. */
  isGraceExpired(): boolean {
    if (!this.state) return true; // No cache = no grace
    const graceDays = this.state.lastResponse.gracePeriodDays;
    return this.daysSinceLastCheckIn() > graceDays;
  }

  /** Clear the cache (e.g. when licence is revoked). */
  clear(): void {
    this.state = null;
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch {
      // Ignore — file may already be gone
    }
  }
}
