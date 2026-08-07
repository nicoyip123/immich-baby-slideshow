import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type SessionRole = "family" | "admin";

export interface SessionPayload {
  role: SessionRole;
  exp: number;
  nonce: string;
}

export interface SessionCodec {
  issue(role: SessionRole): string;
  verify(token: string, expectedRole: SessionRole): boolean;
}

export interface SessionCodecOptions {
  secret: string;
  durationSeconds: number;
  now?: () => number;
  generateNonce?: () => Buffer;
}

export const SESSION_TOKEN_DOMAIN = "immich-baby-slideshow/session/v1";
const SIGNATURE_BYTES = 32;
const MIN_NONCE_BYTES = 16;
const MAX_NONCE_BYTES = 64;
const MAX_TOKEN_CHARS = 1024;

function isCanonicalBase64Url(value: string, expectedBytes?: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.toString("base64url") === value &&
    (expectedBytes === undefined || decoded.length === expectedBytes)
  );
}

function isReasonableNonce(value: unknown): value is string {
  if (typeof value !== "string" || !isCanonicalBase64Url(value)) return false;
  const bytes = Buffer.from(value, "base64url").length;
  return bytes >= MIN_NONCE_BYTES && bytes <= MAX_NONCE_BYTES;
}

function isSessionRole(value: unknown): value is SessionRole {
  return value === "family" || value === "admin";
}

function parsePayload(encodedPayload: string): SessionPayload | undefined {
  if (!isCanonicalBase64Url(encodedPayload)) return undefined;

  try {
    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const value: unknown = JSON.parse(payloadJson);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 3 ||
      !Object.hasOwn(record, "role") ||
      !Object.hasOwn(record, "exp") ||
      !Object.hasOwn(record, "nonce") ||
      !isSessionRole(record.role) ||
      !Number.isSafeInteger(record.exp) ||
      !isReasonableNonce(record.nonce)
    ) {
      return undefined;
    }

    const payload: SessionPayload = {
      role: record.role,
      exp: record.exp as number,
      nonce: record.nonce
    };
    return JSON.stringify(payload) === payloadJson ? payload : undefined;
  } catch {
    return undefined;
  }
}

function signatureFor(secret: string, encodedPayload: string): Buffer {
  return createHmac("sha256", secret)
    .update(SESSION_TOKEN_DOMAIN)
    .update("\0")
    .update(encodedPayload)
    .digest();
}

export function createSessionCodec(options: SessionCodecOptions): SessionCodec {
  const now = options.now ?? Date.now;
  const generateNonce = options.generateNonce ?? (() => randomBytes(24));

  return {
    issue(role) {
      const nonceBytes = generateNonce();
      if (nonceBytes.length < MIN_NONCE_BYTES || nonceBytes.length > MAX_NONCE_BYTES) {
        throw new Error("Session nonce must contain between 16 and 64 bytes");
      }

      const payload: SessionPayload = {
        role,
        exp: Math.floor(now() / 1000) + options.durationSeconds,
        nonce: nonceBytes.toString("base64url")
      };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = signatureFor(options.secret, encodedPayload).toString("base64url");
      return `${encodedPayload}.${signature}`;
    },

    verify(token, expectedRole) {
      try {
        if (token.length === 0 || token.length > MAX_TOKEN_CHARS) return false;
        const parts = token.split(".");
        if (parts.length !== 2) return false;
        const [encodedPayload, encodedSignature] = parts;
        if (
          !encodedPayload ||
          !encodedSignature ||
          !isCanonicalBase64Url(encodedSignature, SIGNATURE_BYTES)
        ) {
          return false;
        }

        const expectedSignature = signatureFor(options.secret, encodedPayload);
        const actualSignature = Buffer.from(encodedSignature, "base64url");
        if (!timingSafeEqual(actualSignature, expectedSignature)) return false;

        const payload = parsePayload(encodedPayload);
        return (
          payload !== undefined &&
          payload.role === expectedRole &&
          payload.exp > Math.floor(now() / 1000)
        );
      } catch {
        return false;
      }
    }
  };
}
