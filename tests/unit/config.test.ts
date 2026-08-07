import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/server/config.js";

const storedHash = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const validEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  IMMICH_URL: "http://immich-server:2283",
  IMMICH_API_KEY: "immich-api-key-with-at-least-20-characters",
  FAMILY_PASSWORD_HASH: storedHash,
  ADMIN_PASSWORD_HASH: storedHash,
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
      familyPasswordHash: storedHash,
      adminPasswordHash: storedHash,
      babyBirthDate: "2025-08-07",
      timezone: "Australia/Melbourne",
      sessionSecret: "a-session-secret-that-is-at-least-32-characters",
      publicOrigin: "https://slideshow.example.com",
      trustedProxyCidrs: [],
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
      "http://134744072:2283",
      "http://0x8080808:2283",
      "http://010.010.010.010:2283",
      "https://photos.example.com.",
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

  it("rejects malformed password hashes that only share the scrypt prefix", () => {
    for (const passwordHash of [
      "scrypt$not-base64$not-base64",
      "scrypt$AA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AA",
      "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB"
    ]) {
      expect(() => parseConfig(validEnv({ FAMILY_PASSWORD_HASH: passwordHash }))).toThrow(/FAMILY_PASSWORD_HASH/);
      expect(() => parseConfig(validEnv({ ADMIN_PASSWORD_HASH: passwordHash }))).toThrow(/ADMIN_PASSWORD_HASH/);
    }
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
    expect(() => parseConfig(validEnv({ SESSION_DURATION_SECONDS: "2592001" }))).toThrow(/SESSION_DURATION_SECONDS/);
  });

  it("parses a bounded list of literal trusted proxy IPs and CIDRs", () => {
    expect(
      parseConfig(validEnv({
        TRUSTED_PROXY_CIDRS: " 10.0.0.0/8,192.0.2.10, fd00::/8,2001:db8::1 "
      })).trustedProxyCidrs
    ).toEqual(["10.0.0.0/8", "192.0.2.10", "fd00::/8", "2001:db8::1"]);

    for (const value of [
      "*",
      "true",
      "0.0.0.0/0",
      "::/0",
      "proxy.internal",
      "10.0.0.0/33",
      "fd00::/129",
      "10.0.0.1/abc",
      "10.0.0.1,",
      Array.from({ length: 65 }, (_, index) => `192.0.2.${index}`).join(",")
    ]) {
      expect(() => parseConfig(validEnv({ TRUSTED_PROXY_CIDRS: value }))).toThrow(/TRUSTED_PROXY_CIDRS/);
    }
  });
});
