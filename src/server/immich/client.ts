import type { AssetType, SlideshowAsset, UpstreamMedia } from "./types.js";

export class ImmichUnavailableError extends Error {
  constructor() { super("Photo library is unavailable"); this.name = "ImmichUnavailableError"; }
}
export class ImmichResponseError extends Error {
  constructor(readonly status: number) { super("Photo library returned an invalid response"); this.name = "ImmichResponseError"; }
}

interface ClientOptions { baseUrl: string; apiKey: string; timeoutMs?: number }
const SAFE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export interface ImmichPort {
  listLikedAlbumAssets(albumId: string): Promise<SlideshowAsset[]>;
  fetchThumbnail(id: string): Promise<UpstreamMedia>;
  fetchOriginal(id: string, range?: string): Promise<UpstreamMedia>;
  fetchVideoPlayback(id: string, range?: string): Promise<UpstreamMedia>;
}

export class ImmichClient implements ImmichPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  constructor(private readonly options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}/api${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...Object.fromEntries(new Headers(init.headers)), "x-api-key": this.options.apiKey }
      });
    } catch {
      throw new ImmichUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  async listLikedAlbumAssets(albumId: string): Promise<SlideshowAsset[]> {
    const [albumResponse, activityResponse] = await Promise.all([
      this.request(`/albums/${encodeURIComponent(albumId)}`),
      this.request(`/activities?albumId=${encodeURIComponent(albumId)}&type=like`)
    ]);
    if (!albumResponse.ok) throw new ImmichResponseError(albumResponse.status);
    if (!activityResponse.ok) throw new ImmichResponseError(activityResponse.status);

    let albumValue: unknown;
    let activityValue: unknown;
    try {
      [albumValue, activityValue] = await Promise.all([albumResponse.json(), activityResponse.json()]);
    } catch {
      throw new ImmichResponseError(502);
    }
    const assets = (albumValue as { assets?: unknown[] })?.assets;
    if (!Array.isArray(assets) || !Array.isArray(activityValue)) throw new ImmichResponseError(502);

    const likedIds = new Set(activityValue.flatMap((raw) => {
      const activity = raw as Record<string, unknown>;
      return activity.type === "like" && typeof activity.assetId === "string" ? [activity.assetId] : [];
    }));
    return assets.flatMap((raw) => {
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== "string" || !likedIds.has(item.id)) return [];
      if (item.type !== "IMAGE" && item.type !== "VIDEO") return [];
      const capturedAt = typeof item.localDateTime === "string" ? item.localDateTime : item.fileCreatedAt;
      if (typeof capturedAt !== "string") return [];
      return [{
        id: item.id,
        type: item.type as AssetType,
        capturedAt,
        durationMs: typeof item.duration === "number" ? item.duration : null
      }];
    });
  }

  private async media(path: string, range?: string): Promise<UpstreamMedia> {
    const response = await this.request(path, { headers: range ? { range } : undefined });
    if (!response.ok && response.status !== 206) throw new ImmichResponseError(response.status);
    const headers = new Headers();
    for (const name of SAFE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return { status: response.status, headers, body: response.body };
  }

  fetchThumbnail(id: string) { return this.media(`/assets/${encodeURIComponent(id)}/thumbnail?size=preview`); }
  fetchOriginal(id: string, range?: string) { return this.media(`/assets/${encodeURIComponent(id)}/original`, range); }
  fetchVideoPlayback(id: string, range?: string) { return this.media(`/assets/${encodeURIComponent(id)}/video/playback`, range); }
}
