import { describe, expect, it } from "vitest";
import { createFailedLoginLimiter } from "../../src/server/security/login-attempts.js";

describe("failure-only login limiting", () => {
  it("blocks only after five failures inside the window and recovers at expiry", () => {
    let now = 1_000;
    const limiter = createFailedLoginLimiter({ now: () => now });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(limiter.isBlocked("family", "192.0.2.1")).toBe(false);
      limiter.recordFailure("family", "192.0.2.1");
    }
    expect(limiter.isBlocked("family", "192.0.2.1")).toBe(true);

    now += 15 * 60 * 1000;
    expect(limiter.isBlocked("family", "192.0.2.1")).toBe(false);
  });

  it("does not count successes and clears earlier failures", () => {
    const limiter = createFailedLoginLimiter({ now: () => 1_000 });
    limiter.recordFailure("family", "192.0.2.1");
    limiter.recordFailure("family", "192.0.2.1");
    limiter.recordSuccess("family", "192.0.2.1");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      limiter.recordFailure("family", "192.0.2.1");
    }
    expect(limiter.isBlocked("family", "192.0.2.1")).toBe(false);
  });

  it("isolates role and client IP counters", () => {
    const limiter = createFailedLoginLimiter({ now: () => 1_000 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure("family", "192.0.2.1");
    }

    expect(limiter.isBlocked("family", "192.0.2.1")).toBe(true);
    expect(limiter.isBlocked("admin", "192.0.2.1")).toBe(false);
    expect(limiter.isBlocked("family", "192.0.2.2")).toBe(false);
  });

  it("bounds retained client keys and removes expired entries during cleanup", () => {
    let now = 1_000;
    const limiter = createFailedLoginLimiter({ now: () => now, maxEntries: 3 });
    for (let client = 1; client <= 10; client += 1) {
      limiter.recordFailure("family", `192.0.2.${client}`);
    }
    expect(limiter.entryCount()).toBeLessThanOrEqual(3);

    now += 15 * 60 * 1000;
    expect(limiter.isBlocked("admin", "198.51.100.1")).toBe(false);
    expect(limiter.entryCount()).toBe(0);
  });
});
