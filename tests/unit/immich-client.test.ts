import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichClient, ImmichResponseError, ImmichUnavailableError } from "../../src/server/immich/client.js";

const albumId = "7f2a70a8-0f37-4b39-9d97-46d26d53f210";
const album = { assets: [
  { id: "image-1", type: "IMAGE", localDateTime: "2025-01-03T10:00:00", duration: null },
  { id: "video-1", type: "VIDEO", fileCreatedAt: "2025-02-04T10:00:00Z", duration: 4200 },
  { id: "unliked", type: "IMAGE", fileCreatedAt: "2025-03-04T10:00:00Z" },
  { id: "audio-1", type: "AUDIO", fileCreatedAt: "2025-04-04T10:00:00Z" }
] };
const activities = [
  { type: "like", assetId: "image-1" },
  { type: "like", assetId: "image-1" },
  { type: "like", assetId: "video-1" },
  { type: "like", assetId: "removed-from-album" },
  { type: "like", assetId: null },
  { type: "comment", assetId: "unliked" }
];

describe("ImmichClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("intersects current album assets with unique asset-level likes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(album), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(activities), { status: 200 }));
    const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });

    await expect(client.listLikedAlbumAssets(albumId)).resolves.toEqual([
      { id: "image-1", type: "IMAGE", capturedAt: "2025-01-03T10:00:00", durationMs: null },
      { id: "video-1", type: "VIDEO", capturedAt: "2025-02-04T10:00:00Z", durationMs: 4200 }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `http://immich:2283/api/albums/${albumId}`,
      `http://immich:2283/api/activities?albumId=${albumId}&type=like`
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => new Headers(init?.headers).get("x-api-key") === "secret-key")).toBe(true);
  });

  it("loads every album asset page when album details omit embedded assets", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ assetCount: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(activities), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assets: {
        items: [album.assets[0], album.assets[2]], nextPage: "2"
      }}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assets: {
        items: [album.assets[1]], nextPage: null
      }}), { status: 200 }));
    const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });

    await expect(client.listLikedAlbumAssets(albumId)).resolves.toEqual([
      { id: "image-1", type: "IMAGE", capturedAt: "2025-01-03T10:00:00", durationMs: null },
      { id: "video-1", type: "VIDEO", capturedAt: "2025-02-04T10:00:00Z", durationMs: 4200 }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [callIndex, page] of [[2, 1], [3, 2]] as const) {
      const [url, init] = fetchMock.mock.calls[callIndex]!;
      expect(String(url)).toBe("http://immich:2283/api/search/metadata");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      expect(JSON.parse(String(init?.body))).toEqual({ albumIds: [albumId], page, size: 1000 });
    }
  });

  it("forwards ranges and exposes only safe media headers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bytes", {
      status: 206,
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-4/5", "x-secret": "no" }
    }));
    const media = await new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" }).fetchVideoPlayback("asset", "bytes=0-4");
    expect(media.status).toBe(206);
    expect(media.headers.get("content-range")).toBe("bytes 0-4/5");
    expect(media.headers.get("x-secret")).toBeNull();
  });

  it("maps network and HTTP failures without exposing private details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect http://immich:2283 secret-key"));
    const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });
    await expect(client.listLikedAlbumAssets(albumId)).rejects.toBeInstanceOf(ImmichUnavailableError);
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response("private body", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(activities), { status: 200 }));
    const error = await client.listLikedAlbumAssets(albumId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImmichResponseError);
    expect(String(error)).not.toMatch(/immich:2283|secret-key|private body/i);
  });
});
