import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ImmichPort } from "../immich/client.js";

export async function mediaRoutes(app: FastifyInstance, options: { immich: ImmichPort; soundtrackPath: string; family: preHandlerHookHandler; admin: preHandlerHookHandler }) {
  const send = async (kind: "thumbnail"|"image"|"video", id: string, range: string|undefined, reply: FastifyReply) => {
    const media = kind === "thumbnail" ? await options.immich.fetchThumbnail(id) : kind === "image" ? await options.immich.fetchOriginal(id, range) : await options.immich.fetchVideoPlayback(id, range);
    for (const [name, value] of media.headers) reply.header(name, value);
    reply.header("cache-control", "private, max-age=300").code(media.status);
    return reply.send(media.body ? Readable.fromWeb(media.body as unknown as import("node:stream/web").ReadableStream) : undefined);
  };
  app.get<{Params:{id:string;kind:string}}>("/api/media/:id/:kind", { preHandler: options.family }, async (request, reply) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.params.id) || !["thumbnail","image","video"].includes(request.params.kind)) return reply.code(400).send({error:"Invalid media request"});
    try { return await send(request.params.kind as "thumbnail"|"image"|"video", request.params.id, request.headers.range, reply); }
    catch { return reply.code(502).send({error:"Media unavailable"}); }
  });
  app.get<{Params:{id:string}}>("/api/admin/media/:id/thumbnail", { preHandler: options.admin }, async (request, reply) => send("thumbnail", request.params.id, undefined, reply));
  app.get("/api/soundtrack", { preHandler: options.family }, async (request, reply) => {
    try {
      const info = await stat(options.soundtrackPath);
      const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start < 0 || start >= info.size || end < start) return reply.code(416).header("content-range", `bytes */${info.size}`).send();
      reply.header("accept-ranges", "bytes").header("content-type", "audio/mpeg").header("cache-control", "private, max-age=300");
      if (match) reply.code(206).header("content-range", `bytes ${start}-${end}/${info.size}`);
      reply.header("content-length", end - start + 1);
      return reply.send(createReadStream(options.soundtrackPath, { start, end }));
    } catch { return reply.code(404).send({ error: "Soundtrack unavailable" }); }
  });
}
