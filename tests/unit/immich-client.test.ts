import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichClient, ImmichResponseError, ImmichUnavailableError } from "../../src/server/immich/client.js";

const responses = [
  { assets: { items: [{ id: "image-1", type: "IMAGE", localDateTime: "2025-01-03T10:00:00", duration: null }], nextPage: "2" } },
  { assets: { items: [{ id: "video-1", type: "VIDEO", fileCreatedAt: "2025-02-04T10:00:00Z", duration: 4200 }, { id: "other", type: "AUDIO" }], nextPage: null } }
];
const albumId = "7f2a70a8-0f37-4b39-9d97-46d26d53f210";

describe("ImmichClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retrieves and normalizes every favourite image and video page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(responses[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responses[1]), { status: 200 }));
    const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key", pageSize: 1 });

    await expect(client.listFavourites(albumId)).resolves.toEqual([
      { id: "image-1", type: "IMAGE", capturedAt: "2025-01-03T10:00:00", durationMs: null },
      { id: "video-1", type: "VIDEO", capturedAt: "2025-02-04T10:00:00Z", durationMs: 4200 }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json", "x-api-key": "secret-key" } });
    for (const [index, call] of fetchMock.mock.calls.entries()) {
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({
        isFavorite: true,
        albumIds: [albumId],
        withExif: true,
        page: index + 1,
        size: 1
      });
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
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect http://immich:2283 secret-key"));
    const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });
    await expect(client.listFavourites(albumId)).rejects.toBeInstanceOf(ImmichUnavailableError);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private body", { status: 500 }));
    const error = await client.listFavourites(albumId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImmichResponseError);
    expect(String(error)).not.toMatch(/immich:2283|secret-key|private body/i);
  });
});
