import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AssetType } from "../immich/types.js";

interface Payload { assetId: string; mediaType: AssetType; exp: number; nonce: string }
export interface ImpressionCodec { issue(assetId: string, mediaType: AssetType): string; verify(token: string): { assetId: string; mediaType: AssetType } | null }

export function createImpressionCodec(options: { secret: string; now?: () => number; nonce?: () => string; durationMs?: number }): ImpressionCodec {
  const now = options.now ?? Date.now;
  const nonce = options.nonce ?? (() => randomBytes(24).toString("base64url"));
  const duration = options.durationMs ?? 60 * 60 * 1000;
  const sign = (body: string) => createHmac("sha256", options.secret).update("baby-slideshow-impression\0").update(body).digest("base64url");
  return {
    issue(assetId, mediaType) {
      const body = Buffer.from(JSON.stringify({ assetId, mediaType, exp: now() + duration, nonce: nonce() } satisfies Payload)).toString("base64url");
      return `${body}.${sign(body)}`;
    },
    verify(token) {
      const [body, signature, extra] = token.split(".");
      if (!body || !signature || extra) return null;
      const expected = Buffer.from(sign(body));
      const actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      try {
        const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
        if (!value || typeof value.assetId !== "string" || !["IMAGE", "VIDEO"].includes(value.mediaType) || !Number.isSafeInteger(value.exp) || value.exp < now() || typeof value.nonce !== "string" || value.nonce.length < 16) return null;
        return { assetId: value.assetId, mediaType: value.mediaType };
      } catch { return null; }
    }
  };
}
