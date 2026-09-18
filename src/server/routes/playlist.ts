import type { StatsDatabase } from "../stats/database.js";
import { randomBytes } from "node:crypto";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AppConfig } from "../config.js";
import type { ImmichPort } from "../immich/client.js";
import { formatBabyAge } from "../slideshow/age.js";
import type { ImpressionCodec } from "../slideshow/impressions.js";
import { shuffled } from "../slideshow/shuffle.js";
import { requireConfiguredOrigin } from "../security/origin.js";

export async function playlistRoutes(app: FastifyInstance, options: { config: AppConfig; immich: ImmichPort; database:StatsDatabase; impressions: ImpressionCodec; family: preHandlerHookHandler }) {
  app.post("/api/playlist", { onRequest: requireConfiguredOrigin(options.config.publicOrigin), preHandler: options.family }, async (_request, reply) => {
    try {
      const assets = await options.immich.listLikedAlbumAssets(options.config.immichAlbumId);
      const favourites=new Set(options.database.listFavourites().map(item=>item.assetId));
      reply.header("cache-control","private, no-store");
      return { playlistId: randomBytes(18).toString("base64url"), photoDurationMs: options.config.photoDurationMs, items: shuffled(assets).map((asset) => ({
        id: asset.id, type: asset.type, durationMs: asset.durationMs, isFavourite:favourites.has(asset.id),
        ageLabel: formatBabyAge(options.config.babyBirthDate, asset.capturedAt, options.config.timezone),
        impressionToken: options.impressions.issue(asset.id, asset.type),
        mediaUrl: `/api/media/${encodeURIComponent(asset.id)}/${asset.type === "VIDEO" ? "video" : "image"}`,
        thumbnailUrl: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        ...(asset.livePhotoVideoId ? { motionUrl: `/api/media/${encodeURIComponent(asset.livePhotoVideoId)}/video` } : {})
      })) };
    } catch { return reply.code(503).send({ code: "MEMORIES_RESTING", message: "Our memories are resting—please try again shortly." }); }
  });
}
