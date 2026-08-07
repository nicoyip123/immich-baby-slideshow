import type { SessionRole } from "./session.js";

export interface FailedLoginLimiter {
  isBlocked(role: SessionRole, clientIp: string): boolean;
  recordFailure(role: SessionRole, clientIp: string): void;
  recordSuccess(role: SessionRole, clientIp: string): void;
  entryCount(): number;
}

export interface FailedLoginLimiterOptions {
  now?: () => number;
  maxFailures?: number;
  windowMs?: number;
  maxEntries?: number;
}

interface FailureEntry {
  timestamps: number[];
  lastSeen: number;
}

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 10_000;

function keyFor(role: SessionRole, clientIp: string): string {
  return `${role}\0${clientIp}`;
}

export function createFailedLoginLimiter(
  options: FailedLoginLimiterOptions = {}
): FailedLoginLimiter {
  const now = options.now ?? Date.now;
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, FailureEntry>();

  if (maxFailures < 1 || windowMs < 1 || maxEntries < 1) {
    throw new Error("Failed-login limiter bounds must be positive");
  }

  function cleanup(currentTime: number): void {
    const cutoff = currentTime - windowMs;
    for (const [key, entry] of entries) {
      entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > cutoff);
      if (entry.timestamps.length === 0) entries.delete(key);
    }
  }

  function evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, entry] of entries) {
      if (entry.lastSeen < oldestTime) {
        oldestKey = key;
        oldestTime = entry.lastSeen;
      }
    }
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }

  return {
    isBlocked(role, clientIp) {
      const currentTime = now();
      cleanup(currentTime);
      return (entries.get(keyFor(role, clientIp))?.timestamps.length ?? 0) >= maxFailures;
    },

    recordFailure(role, clientIp) {
      const currentTime = now();
      cleanup(currentTime);
      const key = keyFor(role, clientIp);
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= maxEntries) evictOldest();
        entry = { timestamps: [], lastSeen: currentTime };
        entries.set(key, entry);
      }
      entry.timestamps.push(currentTime);
      entry.lastSeen = currentTime;
    },

    recordSuccess(role, clientIp) {
      cleanup(now());
      entries.delete(keyFor(role, clientIp));
    },

    entryCount() {
      return entries.size;
    }
  };
}
