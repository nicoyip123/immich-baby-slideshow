import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/server/config.js";

const validEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  IMMICH_URL: "http://immich-server:2283",
  IMMICH_API_KEY: "immich-api-key-with-at-least-20-characters",
  FAMILY_PASSWORD_HASH: "scrypt$c2FsdA$aGFzaA",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA$aGFzaA",
  BABY_BIRTH_DATE: "2025-08-07",
  SESSION_SECRET: "a-session-secret-that-is-at-least-32-characters",
  PUBLIC_ORIGIN: "https://slideshow.example.com",
  ...overrides
});

describe("parseConfig", () => {
  it("normalizes a valid environment into an AppConfig", () => {
    expect(parseConfig(validEnv({ IMMICH_URL: "http://immich-server:2283/" }))).toEqual({
      immichUrl: "http://immich-server:2283",
      immichApiKey: "immich-api-key-with-at-least-20-characters",
      familyPasswordHash: "scrypt$c2FsdA$aGFzaA",
      adminPasswordHash: "scrypt$c2FsdA$aGFzaA",
      babyBirthDate: "2025-08-07",
      timezone: "Australia/Melbourne",
      sessionSecret: "a-session-secret-that-is-at-least-32-characters",
      publicOrigin: "https://slideshow.example.com",
      databasePath: "/data/stats.sqlite",
      soundtrackPath: "/music/soundtrack.mp3",
      ga4MeasurementId: undefined,
      photoDurationMs: 7000,
      sessionDurationSeconds: 604800
    });
  });

  it("rejects public Immich targets and URL components outside a private origin", () => {
    for (const url of [
      "https://photos.example.com",
      "https://8.8.8.8",
      "http://user:password@immich-server:2283",
      "http://immich-server:2283?token=secret",
      "http://immich-server:2283#fragment",
      "http://immich-server:2283/library"
    ]) {
      expect(() => parseConfig(validEnv({ IMMICH_URL: url }))).toThrow(/private Immich URL/);
    }
  });

  it("rejects raw empty query strings and fragments before URL normalization", () => {
    expect(() => parseConfig(validEnv({ IMMICH_URL: "http://immich-server:2283?" }))).toThrow(/private Immich URL/);
    expect(() => parseConfig(validEnv({ IMMICH_URL: "http://immich-server:2283#" }))).toThrow(/private Immich URL/);
    expect(() => parseConfig(validEnv({ PUBLIC_ORIGIN: "https://example.com?" }))).toThrow(/PUBLIC_ORIGIN/);
    expect(() => parseConfig(validEnv({ PUBLIC_ORIGIN: "https://example.com#" }))).toThrow(/PUBLIC_ORIGIN/);
  });

  it("accepts private Docker, loopback, RFC1918, IPv6 ULA, and internal Immich targets", () => {
    for (const url of [
      "http://immich-server:2283",
      "http://localhost:2283",
      "http://127.0.0.1:2283",
      "http://10.0.0.4:2283",
      "http://172.16.0.4:2283",
      "http://192.168.1.4:2283",
      "http://[::1]:2283",
      "http://[fd12:3456:789a::1]:2283",
      "http://immich.internal:2283"
    ]) {
      expect(parseConfig(validEnv({ IMMICH_URL: url })).immichUrl).toBe(url);
    }
  });

  it("rejects malformed and calendar-invalid birth dates", () => {
    expect(() => parseConfig(validEnv({ BABY_BIRTH_DATE: "07-08-2025" }))).toThrow(/YYYY-MM-DD/);
    expect(() => parseConfig(validEnv({ BABY_BIRTH_DATE: "2025-02-30" }))).toThrow(/YYYY-MM-DD/);
  });

  it("fails clearly when required secrets are absent or invalid", () => {
    expect(() => parseConfig(validEnv({ IMMICH_API_KEY: "short" }))).toThrow(/IMMICH_API_KEY/);
    expect(() => parseConfig(validEnv({ FAMILY_PASSWORD_HASH: "bcrypt$hash" }))).toThrow(
      /FAMILY_PASSWORD_HASH/
    );
    expect(() => parseConfig(validEnv({ ADMIN_PASSWORD_HASH: "bcrypt$hash" }))).toThrow(
      /ADMIN_PASSWORD_HASH/
    );
    expect(() => parseConfig(validEnv({ SESSION_SECRET: "too short" }))).toThrow(/SESSION_SECRET/);
  });

  it("requires a public origin without credentials, query, fragment, or a path", () => {
    for (const publicOrigin of [
      "https://user:password@slideshow.example.com",
      "https://slideshow.example.com?preview=1",
      "https://slideshow.example.com#hero",
      "https://slideshow.example.com/slideshow"
    ]) {
      expect(() => parseConfig(validEnv({ PUBLIC_ORIGIN: publicOrigin }))).toThrow(/PUBLIC_ORIGIN/);
    }
    expect(parseConfig(validEnv({ PUBLIC_ORIGIN: "https://slideshow.example.com/" })).publicOrigin).toBe(
      "https://slideshow.example.com"
    );
  });

  it("validates optional analytics and numeric settings", () => {
    expect(parseConfig(validEnv({ GA4_MEASUREMENT_ID: "G-ABC123", PHOTO_DURATION_MS: "3000", SESSION_DURATION_SECONDS: "300" }))).toMatchObject({
      ga4MeasurementId: "G-ABC123",
      photoDurationMs: 3000,
      sessionDurationSeconds: 300
    });
    expect(() => parseConfig(validEnv({ GA4_MEASUREMENT_ID: "UA-123" }))).toThrow(/GA4_MEASUREMENT_ID/);
    expect(() => parseConfig(validEnv({ PHOTO_DURATION_MS: "2999" }))).toThrow(/PHOTO_DURATION_MS/);
    expect(() => parseConfig(validEnv({ SESSION_DURATION_SECONDS: "299" }))).toThrow(/SESSION_DURATION_SECONDS/);
  });
});
