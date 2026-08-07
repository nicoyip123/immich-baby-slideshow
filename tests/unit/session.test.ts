import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SESSION_TOKEN_DOMAIN,
  createSessionCodec
} from "../../src/server/security/session.js";

const secret = "test-session-secret-that-is-long-enough";
const nowMs = Date.UTC(2026, 7, 7, 12, 0, 0);
const nonce = Buffer.alloc(24, 7);

function signRawPayload(payloadJson: string): string {
  const encodedPayload = Buffer.from(payloadJson).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(SESSION_TOKEN_DOMAIN)
    .update("\0")
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

describe("session tokens", () => {
  const codec = createSessionCodec({
    secret,
    durationSeconds: 600,
    now: () => nowMs,
    generateNonce: () => nonce
  });

  it("issues a canonical signed role-specific payload", () => {
    const token = codec.issue("family");
    const [encodedPayload] = token.split(".");

    expect(JSON.parse(Buffer.from(encodedPayload!, "base64url").toString("utf8"))).toEqual({
      role: "family",
      exp: Math.floor(nowMs / 1000) + 600,
      nonce: nonce.toString("base64url")
    });
    expect(codec.verify(token, "family")).toBe(true);
    expect(codec.verify(token, "admin")).toBe(false);
  });

  it("rejects expired, tampered, and malformed tokens without throwing", () => {
    const token = codec.issue("admin");
    const [payload, signature] = token.split(".");
    const expiredCodec = createSessionCodec({
      secret,
      durationSeconds: 600,
      now: () => nowMs + 600_000,
      generateNonce: () => nonce
    });

    expect(expiredCodec.verify(token, "admin")).toBe(false);
    expect(codec.verify(`${payload}x.${signature}`, "admin")).toBe(false);
    expect(codec.verify(`${payload}.${signature!.slice(0, -1)}x`, "admin")).toBe(false);
    for (const malformed of ["", "one-part", "a.b.c", ".", "@@.@@", "e30.invalid"]) {
      expect(() => codec.verify(malformed, "admin")).not.toThrow();
      expect(codec.verify(malformed, "admin")).toBe(false);
    }
  });

  it("requires the exact payload schema, integer expiry, known role, and a reasonable nonce", () => {
    const validNonce = nonce.toString("base64url");
    const exp = Math.floor(nowMs / 1000) + 600;
    const invalidPayloads = [
      { role: "visitor", exp, nonce: validNonce },
      { role: "family", exp: exp + 0.5, nonce: validNonce },
      { role: "family", exp: String(exp), nonce: validNonce },
      { role: "family", exp, nonce: "short" },
      { role: "family", exp, nonce: `${validNonce}=` },
      { role: "family", exp, nonce: validNonce, extra: true }
    ];

    for (const payload of invalidPayloads) {
      expect(codec.verify(signRawPayload(JSON.stringify(payload)), "family")).toBe(false);
    }

    expect(
      codec.verify(
        signRawPayload(JSON.stringify({ nonce: validNonce, exp, role: "family" })),
        "family"
      )
    ).toBe(false);
  });

  it("rejects invalid generated nonces rather than issuing weak tokens", () => {
    const weakCodec = createSessionCodec({
      secret,
      durationSeconds: 600,
      now: () => nowMs,
      generateNonce: () => Buffer.alloc(4)
    });

    expect(() => weakCodec.issue("family")).toThrow(/nonce/i);
  });
});
