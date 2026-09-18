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
    return { app, calls, family: await login("family"), admin: await login("admin") };
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
    expect(calls).toContain(`album:${config.immichAlbumId}`);
    expect(body.items.map((item: { type: string }) => item.type).sort()).toEqual(["IMAGE", "IMAGE", "VIDEO"]);
    expect(JSON.stringify(body)).not.toContain("immich:2283");
    expect(body.items.every((item: { impressionToken: string; mediaUrl: string }) => item.impressionToken && item.mediaUrl.startsWith("/api/media/"))).toBe(true);
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
      body: "A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived."
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
});
