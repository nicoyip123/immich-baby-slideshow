import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createFamilyLink,
  deriveFamilyLinkSessionSecret,
  hashFamilyLinkToken,
  isFamilyLinkHash,
  isFamilyLinkToken,
  verifyFamilyLinkToken
} from "../../src/server/security/family-link.js";
import { formatFamilyLink, normalizeFamilyLinkPublicOrigin } from "../../src/server/tools/create-family-link.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const canonicalToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const canonicalHash = "a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e";

describe("family link token primitives", () => {
  it("recognizes only canonical 32-byte lowercase hexadecimal tokens and hashes", () => {
    for (const value of [canonicalToken, canonicalHash]) {
      expect(isFamilyLinkToken(value)).toBe(true);
      expect(isFamilyLinkHash(value)).toBe(true);
    }

    for (const value of ["", canonicalToken.toUpperCase(), ` ${canonicalToken}`, `${canonicalToken} `, canonicalToken.slice(1), `${canonicalToken}0`, "g".repeat(64)]) {
      expect(isFamilyLinkToken(value)).toBe(false);
      expect(isFamilyLinkHash(value)).toBe(false);
    }
  });

  it("hashes canonical tokens and rejects malformed token and hash values during verification", () => {
    expect(hashFamilyLinkToken(canonicalToken)).toBe(canonicalHash);
    expect(verifyFamilyLinkToken(canonicalToken, canonicalHash)).toBe(true);
    expect(verifyFamilyLinkToken(canonicalToken, "0".repeat(64))).toBe(false);

    for (const malformed of ["", canonicalToken.toUpperCase(), `${canonicalToken}0`, "x".repeat(64)]) {
      expect(() => hashFamilyLinkToken(malformed)).toThrow(/canonical/i);
      expect(verifyFamilyLinkToken(malformed, canonicalHash)).toBe(false);
      expect(verifyFamilyLinkToken(canonicalToken, malformed)).toBe(false);
    }
  });

  it("derives a stable domain-separated session secret that rotates with either input", () => {
    const sessionSecret = "a-session-secret-that-is-at-least-32-characters";
    const first = deriveFamilyLinkSessionSecret(sessionSecret, canonicalHash);

    expect(first).toBe(deriveFamilyLinkSessionSecret(sessionSecret, canonicalHash));
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(deriveFamilyLinkSessionSecret(`${sessionSecret}!`, canonicalHash));
    expect(first).not.toBe(deriveFamilyLinkSessionSecret(sessionSecret, "0".repeat(64)));
    expect(() => deriveFamilyLinkSessionSecret(sessionSecret, "not-a-hash")).toThrow(/canonical/i);
  });

  it("creates a deterministic link from exactly 32 random bytes", () => {
    const bytes = Buffer.from(Array.from({ length: 32 }, (_, index) => index));

    expect(createFamilyLink("https://baby.example.com", () => bytes)).toEqual({
      token: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
      tokenHash: "6c86c6aac5fb24bcf5d9939cb7d7d5645ce39418f449e03b262dd4fa14b4b92b",
      url: "https://baby.example.com/#family=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
    });
  });

  it("rejects a random generator that does not return exactly 32 bytes", () => {
    expect(() => createFamilyLink("https://baby.example.com", () => Buffer.alloc(31))).toThrow(/32 bytes/);
    expect(() => createFamilyLink("https://baby.example.com", () => Buffer.alloc(33))).toThrow(/32 bytes/);
  });
});

describe("create-family-link owner tool", () => {
  const deterministicLink = {
    token: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    tokenHash: "6c86c6aac5fb24bcf5d9939cb7d7d5645ce39418f449e03b262dd4fa14b4b92b",
    url: "https://baby.example.com/#family=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
  };

  it("formats deterministic environment output without side effects on import", () => {
    expect(formatFamilyLink(deterministicLink)).toBe(
      "FAMILY_LINK_TOKEN_HASH='6c86c6aac5fb24bcf5d9939cb7d7d5645ce39418f449e03b262dd4fa14b4b92b'\n" +
      "FAMILY_LINK_URL='https://baby.example.com/#family=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'\n"
    );
  });

  it("requires a bare HTTPS public origin", () => {
    expect(normalizeFamilyLinkPublicOrigin("https://baby.example.com/")).toBe("https://baby.example.com");
    for (const value of [
      "http://baby.example.com",
      "https://user:password@baby.example.com",
      "https://baby.example.com?preview=1",
      "https://baby.example.com#family=old",
      "https://baby.example.com/slideshow",
      "not a URL"
    ]) {
      expect(() => normalizeFamilyLinkPublicOrigin(value)).toThrow(/PUBLIC_ORIGIN/);
    }
  });

  it("rejects invalid origins before generating or writing a token", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/server/tools/create-family-link.ts"], {
      cwd: projectRoot,
      env: { ...process.env, PUBLIC_ORIGIN: "http://baby.example.com" },
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/PUBLIC_ORIGIN/);
    expect(result.stderr).not.toMatch(/[a-f0-9]{64}/);
  });
});
