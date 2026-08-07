import type { AssetType, SlideshowAsset, UpstreamMedia } from "./types.js";

export class ImmichUnavailableError extends Error {
  constructor() { super("Photo library is unavailable"); this.name = "ImmichUnavailableError"; }
}
export class ImmichResponseError extends Error {
  constructor(readonly status: number) { super("Photo library returned an invalid response"); this.name = "ImmichResponseError"; }
}

interface ClientOptions { baseUrl: string; apiKey: string; timeoutMs?: number; pageSize?: number }
const SAFE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export interface ImmichPort {
  listFavourites(albumId: string): Promise<SlideshowAsset[]>;
  fetchThumbnail(id: string): Promise<UpstreamMedia>;
  fetchOriginal(id: string, range?: string): Promise<UpstreamMedia>;
  fetchVideoPlayback(id: string, range?: string): Promise<UpstreamMedia>;
}

export class ImmichClient implements ImmichPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  constructor(private readonly options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.pageSize = options.pageSize ?? 1000;
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

  async listFavourites(albumId: string): Promise<SlideshowAsset[]> {
    const output: SlideshowAsset[] = [];
    let page = 1;
    while (true) {
      const response = await this.request("/search/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isFavorite: true, albumIds: [albumId], withExif: true, page, size: this.pageSize })
      });
      if (!response.ok) throw new ImmichResponseError(response.status);
      let value: unknown;
      try { value = await response.json(); } catch { throw new ImmichResponseError(response.status); }
      const assets = (value as { assets?: { items?: unknown[]; nextPage?: string | null } })?.assets;
      if (!assets || !Array.isArray(assets.items)) throw new ImmichResponseError(response.status);
      for (const raw of assets.items) {
        const item = raw as Record<string, unknown>;
        if (typeof item.id !== "string" || (item.type !== "IMAGE" && item.type !== "VIDEO")) continue;
        const capturedAt = typeof item.localDateTime === "string" ? item.localDateTime : item.fileCreatedAt;
        if (typeof capturedAt !== "string") continue;
        output.push({
          id: item.id,
          type: item.type as AssetType,
          capturedAt,
          durationMs: typeof item.duration === "number" ? item.duration : null
        });
      }
      if (!assets.nextPage) break;
      const next = Number(assets.nextPage);
      page = Number.isInteger(next) && next > page ? next : page + 1;
    }
    return output;
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
