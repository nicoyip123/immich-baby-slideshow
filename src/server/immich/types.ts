export type AssetType = "IMAGE" | "VIDEO";

export interface SlideshowAsset {
  id: string;
  type: AssetType;
  capturedAt: string;
  durationMs: number | null;
}

export interface UpstreamMedia {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

