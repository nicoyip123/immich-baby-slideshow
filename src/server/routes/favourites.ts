import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ImmichPort } from "../immich/client.js";
import type { StatsDatabase } from "../stats/database.js";
import { requireConfiguredOrigin } from "../security/origin.js";

const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export async function favouritesRoutes(app: FastifyInstance, options: {
  origin: string; albumId: string; database: StatsDatabase; immich: ImmichPort;
  family: preHandlerHookHandler; admin: preHandlerHookHandler;
}) {
  await app.register(async (routes) => {
    routes.addHook("onRequest", async (_request, reply) => { reply.header("cache-control", "private, no-store"); });
    routes.post("/api/favourites", { onRequest: requireConfiguredOrigin(options.origin), preHandler: options.family }, async (request, reply) => {
      const assetId = (request.body as { assetId?: unknown } | null)?.assetId;
      if (!validId(assetId)) return reply.code(400).send({ error: "Invalid asset" });
      let assets;
      try { assets = await options.immich.listLikedAlbumAssets(options.albumId); }
      catch { return reply.code(503).send({ error: "Photo library unavailable" }); }
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) return reply.code(404).send({ error: "Asset unavailable" });
      return { saved: true, created: options.database.saveFavourite(asset.id, asset.type) };
    });
    routes.get("/api/admin/favourites", { preHandler: options.admin }, async () => ({
      items: options.database.listFavourites().map((row) => ({
        ...row,
        thumbnailUrl: `/api/admin/media/${encodeURIComponent(row.assetId)}/thumbnail`,
        mediaUrl: `/api/admin/media/${encodeURIComponent(row.assetId)}/${row.mediaType === "VIDEO" ? "video" : "image"}`
      }))
    }));
    routes.delete<{ Params: { id: string } }>("/api/admin/favourites/:id", { onRequest: requireConfiguredOrigin(options.origin), preHandler: options.admin }, async (request, reply) => {
      if (!validId(request.params.id)) return reply.code(400).send({ error: "Invalid asset" });
      options.database.deleteFavourite(request.params.id);
      return { success: true };
    });
  });
}
