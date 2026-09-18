import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config.js";
import type { ImmichPort } from "../../src/server/immich/client.js";
import { createStatsDatabase } from "../../src/server/stats/database.js";

const origin = "https://slideshow.example.com";
const config: AppConfig = {
  immichUrl: "http://immich:2283", immichApiKey: "k".repeat(20),
  immichAlbumId: "7f2a70a8-0f37-4b39-9d97-46d26d53f210",
  familyPasswordHash: "family", adminPasswordHash: "admin", babyBirthDate: "2025-01-01",
  timezone: "Australia/Melbourne", sessionSecret: "s".repeat(32), publicOrigin: origin,
  trustedProxyCidrs: [], databasePath: ":memory:", soundtrackPath: "/missing.mp3",
  ga4MeasurementId: "G-TEST123", photoDurationMs: 7000, sessionDurationSeconds: 600
};

describe("slideshow backend routes", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function setup() {
    const calls: string[] = [];
    const immich: ImmichPort = {
      async listLikedAlbumAssets(albumId) { calls.push(`album:${albumId}`); return [
        { id: "photo-1", type: "IMAGE", capturedAt: "2025-04-01T10:00:00", durationMs: null, livePhotoVideoId: null },
        { id: "video-1", type: "VIDEO", capturedAt: "2025-05-01T10:00:00", durationMs: 1200, livePhotoVideoId: null },
        { id: "live-1", type: "IMAGE", capturedAt: "2025-06-01T10:00:00", durationMs: null, livePhotoVideoId: "motion-1" }
      ]; },
      async fetchThumbnail(id) { calls.push(`thumb:${id}`); return { status: 200, headers: new Headers({ "content-type": "image/jpeg" }), body: new Response("thumb").body }; },
      async fetchStill(id, range) { calls.push(`image:${id}:${range}`); return { status: range ? 206 : 200, headers: new Headers({ "content-type": "image/jpeg", "content-range": "bytes 0-1/2" }), body: new Response("ok").body }; },
      async fetchVideoPlayback(id, range) { calls.push(`video:${id}:${range}`); return { status: 206, headers: new Headers({ "content-type": "video/mp4", "content-range": "bytes 0-1/2" }), body: new Response("ok").body }; }
    };
    const database = createStatsDatabase(":memory:", () => new Date("2026-08-07T00:00:00Z"));
    const app = await buildApp({ mode: "test", config, dependencies: {
      verifyPassword: async (password, hash) => password === hash,
      generateNonce: () => Buffer.alloc(24, 2), immich, statsDatabase: database
    }});
    apps.push(app);
    const login = async (role: "family" | "admin") => {
      const response = await app.inject({ method: "POST", url: `/api/auth/${role}`, headers: { origin }, payload: { password: role } });
      return String(response.headers["set-cookie"]).split(";", 1)[0]!;
    };
    return { app, calls, immich, family: await login("family"), admin: await login("admin") };
  }

  it("allows GA4 regional collection while retaining restrictive script rules",async()=>{
    const {app}=await setup();
    const response=await app.inject({url:"/health"});
    const csp=String(response.headers["content-security-policy"]);
    expect(csp).toContain("connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com");
    expect(csp).toContain("img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|doubleclick/);
  });

  it("creates an authenticated mixed playlist with local URLs and age labels", async () => {
    const { app, family, calls } = await setup();
    expect((await app.inject({ method: "POST", url: "/api/playlist", headers: { origin } })).statusCode).toBe(401);
    const response = await app.inject({ method: "POST", url: "/api/playlist", headers: { origin, cookie: family } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(3);
    expect(body.items.find((item: { id: string }) => item.id === "photo-1")).toMatchObject({
      ageLabel: "3 months, 0 days old",
      ageLabels: { en: "3 months, 0 days old", "zh-Hans": "3个月0天", "zh-Hant": "3個月0天" }
    });
    expect(calls).toContain(`album:${config.immichAlbumId}`);
    expect(body.items.map((item: { type: string }) => item.type).sort()).toEqual(["IMAGE", "IMAGE", "VIDEO"]);
    expect(JSON.stringify(body)).not.toContain("immich:2283");
    expect(body.items.every((item: { impressionToken: string; mediaUrl: string }) => item.impressionToken && item.mediaUrl.startsWith("/api/media/"))).toBe(true);
  });

  it("returns null age translations for unknown capture dates", async () => {
    const { app, family, immich } = await setup();
    immich.listLikedAlbumAssets = async () => [
      { id: "undated", type: "IMAGE", capturedAt: "invalid", durationMs: null, livePhotoVideoId: null }
    ];
    const response = await app.inject({ method: "POST", url: "/api/playlist", headers: { origin, cookie: family } });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      ageLabel: null, ageLabels: { en: null, "zh-Hans": null, "zh-Hant": null }
    });
  });

  it("marks Live Photos with a motion URL and leaves plain media without one", async () => {
    const { app, family } = await setup();
    const body = (await app.inject({ method: "POST", url: "/api/playlist", headers: { origin, cookie: family } })).json();
    const find = (id: string) => body.items.find((item: { id: string }) => item.id === id);
    expect(find("live-1").motionUrl).toBe("/api/media/motion-1/video");
    expect(find("photo-1").motionUrl).toBeUndefined();
    expect(find("video-1").motionUrl).toBeUndefined();
  });

  it("keeps the personalized welcome copy behind family authentication", async () => {
    const { app, family } = await setup();
    expect((await app.inject({ url: "/api/welcome" })).statusCode).toBe(401);
    const response = await app.inject({ url: "/api/welcome", headers: { cookie: family } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({
      eyebrow: "Seren’s little story",
      title: "From your very first days…",
      body: "A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.",
      translations: {
        "zh-Hans": { eyebrow: "Seren 的成长故事", title: "从你来到世界的那一天起…", body: "珍藏每个小小的瞬间、日渐灿烂的笑容，还有从你出生起就一直围绕着你的爱。" },
        "zh-Hant": { eyebrow: "Seren 的成長故事", title: "從你來到世界的那一天起…", body: "珍藏每個小小的瞬間、日漸燦爛的笑容，還有從你出生起就一直圍繞著你的愛。" }
      }
    });
  });

  it("proxies family media ranges and keeps public config secret-free", async () => {
    const { app, family, calls } = await setup();
    const denied = await app.inject({ url: "/api/media/video-1/video" });
    expect(denied.statusCode).toBe(401);
    const media = await app.inject({ url: "/api/media/video-1/video", headers: { cookie: family, range: "bytes=0-1" } });
    expect(media.statusCode).toBe(206);
    expect(calls).toContain("video:video-1:bytes=0-1");
    const publicConfig = (await app.inject({ url: "/api/public-config" })).json();
    expect(publicConfig).toEqual({ ga4MeasurementId: "G-TEST123", photoDurationMs: 7000 });
    expect(JSON.stringify(publicConfig)).not.toMatch(/secret|immich/i);
  });

  it("counts signed impressions once and isolates admin reports", async () => {
    const { app, family, admin } = await setup();
    const playlist = (await app.inject({ method: "POST", url: "/api/playlist", headers: { origin, cookie: family } })).json();
    const item = playlist.items[0];
    const count = () => app.inject({ method: "POST", url: "/api/stats/display", headers: { origin, cookie: family }, payload: { impressionToken: item.impressionToken } });
    expect((await count()).json()).toEqual({ counted: true });
    expect((await count()).json()).toEqual({ counted: false });
    expect((await app.inject({ url: "/api/admin/stats", headers: { cookie: family } })).statusCode).toBe(401);
    const report = (await app.inject({ url: "/api/admin/stats?period=all&type=all", headers: { cookie: admin } })).json();
    expect(report.items[0]).toMatchObject({ assetId: item.id, periodCount: 1, totalCount: 1 });
  });
  it("marks shared likes in new playlists and reflects admin removal",async()=>{
    const {app,family,admin}=await setup();
    const playlist=async()=> (await app.inject({method:"POST",url:"/api/playlist",headers:{origin,cookie:family}})).json();
    expect((await playlist()).items.find((item:{id:string})=>item.id==="photo-1").isFavourite).toBe(false);
    await app.inject({method:"POST",url:"/api/favourites",headers:{origin,cookie:family},payload:{assetId:"photo-1"}});
    expect((await playlist()).items.find((item:{id:string})=>item.id==="photo-1").isFavourite).toBe(true);
    await app.inject({method:"DELETE",url:"/api/admin/favourites/photo-1",headers:{origin,cookie:admin}});
    expect((await playlist()).items.find((item:{id:string})=>item.id==="photo-1").isFavourite).toBe(false);
  });

  it("saves shared favourites idempotently with canonical types and admin previews", async () => {
    const { app, family, admin, calls } = await setup();
    const save = () => app.inject({ method: "POST", url: "/api/favourites", headers: { origin, cookie: family }, payload: { assetId: "video-1", mediaType: "IMAGE" } });
    const first = await save();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ saved: true, created: true });
    expect(first.headers["cache-control"]).toBe("private, no-store");
    expect((await save()).json()).toEqual({ saved: true, created: false });
    expect(calls).toContain(`album:${config.immichAlbumId}`);
    const response = await app.inject({ url: "/api/admin/favourites", headers: { cookie: admin } });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().items).toEqual([{ assetId: "video-1", mediaType: "VIDEO", savedAt: "2026-08-07T00:00:00.000Z", thumbnailUrl: "/api/admin/media/video-1/thumbnail", mediaUrl: "/api/admin/media/video-1/video" }]);
    await app.inject({ method: "DELETE", url: "/api/admin/stats", headers: { origin, cookie: admin }, payload: { confirmation: "RESET" } });
    expect((await app.inject({ url: "/api/admin/favourites", headers: { cookie: admin } })).json().items).toHaveLength(1);
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: "DELETE", url: "/api/admin/favourites/video-1", headers: { origin, cookie: admin } })).json()).toEqual({ success: true });
    expect((await app.inject({ url: "/api/admin/favourites", headers: { cookie: admin } })).json().items).toEqual([]);
  });

  it("protects favourites authentication, origin, membership and identifiers", async () => {
    const { app, family, admin } = await setup();
    expect((await app.inject({ method: "POST", url: "/api/favourites", headers: { origin }, payload: { assetId: "photo-1" } })).statusCode).toBe(401);
    for (const invalidOrigin of [undefined, "https://evil.example"]) {
      const headers = { cookie: family, ...(invalidOrigin ? { origin: invalidOrigin } : {}) };
      expect((await app.inject({ method: "POST", url: "/api/favourites", headers, payload: { assetId: "photo-1" } })).statusCode).toBe(403);
      expect((await app.inject({ method: "DELETE", url: "/api/admin/favourites/photo-1", headers: { ...headers, cookie: admin } })).statusCode).toBe(403);
    }
    for (const cookie of [undefined, family]) {
      expect((await app.inject({ url: "/api/admin/favourites", headers: cookie ? { cookie } : {} })).statusCode).toBe(401);
      expect((await app.inject({ method: "DELETE", url: "/api/admin/favourites/photo-1", headers: { origin, ...(cookie ? { cookie } : {}) } })).statusCode).toBe(401);
    }
    for (const assetId of [undefined, 12, "", "../secret", "a".repeat(129)]) expect((await app.inject({ method: "POST", url: "/api/favourites", headers: { origin, cookie: family }, payload: { assetId } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/favourites", headers: { origin, cookie: family }, payload: { assetId: "forged-id" } })).statusCode).toBe(404);
  });

  it("proxies admin previews with ranges and validates kinds and ids", async () => {
    const { app, family, admin, calls } = await setup();
    for (const kind of ["thumbnail", "image", "video"]) {
      expect((await app.inject({ url: `/api/admin/media/photo-1/${kind}`, headers: { cookie: family } })).statusCode).toBe(401);
      const response = await app.inject({ url: `/api/admin/media/photo-1/${kind}`, headers: { cookie: admin, range: "bytes=0-1" } });
      expect(response.statusCode).toBe(kind === "thumbnail" ? 200 : 206);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    expect(calls).toContain("image:photo-1:bytes=0-1");
    expect(calls).toContain("video:photo-1:bytes=0-1");
    expect((await app.inject({ url: "/api/admin/media/a%20b/image", headers: { cookie: admin } })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/admin/media/photo-1/original", headers: { cookie: admin } })).statusCode).toBe(400);
  });

  it("reports upstream save and preview failures without storing a favourite", async () => {
    const { app, family, admin, immich } = await setup();
    immich.listLikedAlbumAssets = async () => { throw new Error("private upstream address"); };
    const response = await app.inject({ method: "POST", url: "/api/favourites", headers: { origin, cookie: family }, payload: { assetId: "photo-1" } });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private upstream");
    expect((await app.inject({ url: "/api/admin/favourites", headers: { cookie: admin } })).json().items).toEqual([]);
    immich.fetchStill = async () => { throw new Error("private upstream address"); };
    expect((await app.inject({ url: "/api/admin/media/photo-1/image", headers: { cookie: admin } })).statusCode).toBe(502);
  });

});
