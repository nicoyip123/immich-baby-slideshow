import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AssetType } from "../immich/types.js";
import type { ImpressionCodec } from "../slideshow/impressions.js";
import type { StatsDatabase } from "../stats/database.js";
import { requireConfiguredOrigin } from "../security/origin.js";

export async function statsRoutes(app: FastifyInstance, options: { origin:string; database:StatsDatabase; impressions:ImpressionCodec; family:preHandlerHookHandler; admin:preHandlerHookHandler }) {
  app.post("/api/stats/display", { onRequest: requireConfiguredOrigin(options.origin), preHandler: options.family }, async (request, reply) => {
    const token = (request.body as {impressionToken?:unknown}|null)?.impressionToken;
    if (typeof token !== "string") return reply.code(400).send({error:"Invalid impression"});
    const value = options.impressions.verify(token);
    if (!value) return reply.code(400).send({error:"Invalid impression"});
    return { counted: options.database.record(token, value.assetId, value.mediaType) };
  });
  app.get("/api/admin/stats", { preHandler: options.admin }, async (request) => {
    const query = request.query as {period?:string;type?:string};
    const period = ["7d","30d","all"].includes(query.period ?? "") ? query.period as "7d"|"30d"|"all" : "all";
    const type = ["IMAGE","VIDEO"].includes(query.type ?? "") ? query.type as AssetType : undefined;
    return { items: options.database.report(period,type).map((row) => ({...row, thumbnailUrl:`/api/admin/media/${encodeURIComponent(row.assetId)}/thumbnail`})) };
  });
  app.get("/api/admin/stats.csv", { preHandler: options.admin }, async (request, reply) => {
    const query = request.query as {period?:string;type?:string};
    const period = ["7d","30d","all"].includes(query.period ?? "") ? query.period as "7d"|"30d"|"all" : "all";
    const type = ["IMAGE","VIDEO"].includes(query.type ?? "") ? query.type as AssetType : undefined;
    const escape = (value: unknown) => `"${String(value).replaceAll('"','""')}"`;
    const lines = ["asset_id,media_type,period_count,total_count,last_displayed_at", ...options.database.report(period,type).map((row) => [row.assetId,row.mediaType,row.periodCount,row.totalCount,row.lastDisplayedAt].map(escape).join(","))];
    return reply.header("content-type","text/csv; charset=utf-8").header("content-disposition","attachment; filename=slideshow-stats.csv").send(lines.join("\r\n"));
  });
  app.delete("/api/admin/stats", { onRequest: requireConfiguredOrigin(options.origin), preHandler: options.admin }, async (request, reply) => {
    if ((request.body as {confirmation?:unknown}|null)?.confirmation !== "RESET") return reply.code(400).send({error:"Confirmation required"});
    options.database.reset(); return {success:true};
  });
}
