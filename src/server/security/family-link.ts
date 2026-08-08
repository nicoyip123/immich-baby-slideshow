import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const FAMILY_LINK_HEX_PATTERN = /^[a-f0-9]{64}$/;
const FAMILY_LINK_SESSION_DOMAIN = "immich-baby-slideshow/family-link-session/v1";

export interface FamilyLink {
  token: string;
  tokenHash: string;
  url: string;
}

export type FamilyLinkBytesGenerator = () => Uint8Array;

export function isFamilyLinkToken(value: string): boolean {
  return FAMILY_LINK_HEX_PATTERN.test(value);
}

export function isFamilyLinkHash(value: string): boolean {
  return FAMILY_LINK_HEX_PATTERN.test(value);
}

export function hashFamilyLinkToken(token: string): string {
  if (!isFamilyLinkToken(token)) throw new Error("Family link token must be canonical lowercase hexadecimal");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyFamilyLinkToken(token: string, storedHash: string): boolean {
  if (!isFamilyLinkToken(token) || !isFamilyLinkHash(storedHash)) return false;

  const actualHash = Buffer.from(hashFamilyLinkToken(token), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  return timingSafeEqual(actualHash, expectedHash);
}

export function deriveFamilyLinkSessionSecret(sessionSecret: string, tokenHash: string): string {
  if (!isFamilyLinkHash(tokenHash)) throw new Error("Family link token hash must be canonical lowercase hexadecimal");
  return createHmac("sha256", sessionSecret)
    .update(FAMILY_LINK_SESSION_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(tokenHash, "utf8")
    .digest("base64url");
}

export function createFamilyLink(
  publicOrigin: string,
  generateBytes: FamilyLinkBytesGenerator = () => randomBytes(32)
): FamilyLink {
  const bytes = generateBytes();
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
    throw new Error("Family link generator must return exactly 32 bytes");
  }

  const token = Buffer.from(bytes).toString("hex");
  return {
    token,
    tokenHash: hashFamilyLinkToken(token),
    url: `${publicOrigin}/#family=${token}`
  };
}
