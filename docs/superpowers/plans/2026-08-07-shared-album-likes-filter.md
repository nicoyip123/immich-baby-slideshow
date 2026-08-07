# Shared Album Likes Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build each slideshow playlist from current shared-album assets that have at least one asset-level Like from any Immich user.

**Architecture:** Replace the metadata Favourite search with two concurrent stable Immich reads: album details and Like activities. Intersect unique non-null liked asset IDs with the album's current assets, then reuse the existing normalization, proxy, shuffle, age-label, and statistics pipeline.

**Tech Stack:** TypeScript 7, Fastify 5, React 19, Vitest 4, Immich Albums and Activities APIs, Docker Compose/Dockge.

---

### Task 1: Retrieve and intersect album assets with Like activities

**Files:**
- Modify: `tests/unit/immich-client.test.ts`
- Modify: `tests/integration/slideshow-routes.test.ts`
- Modify: `src/server/immich/client.ts`
- Modify: `src/server/routes/playlist.ts`

- [ ] **Step 1: Write failing client and route tests**

Replace the paginated metadata-search fixture with one album response and one activity response:

```ts
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
```

Mock the two responses, call `listLikedAlbumAssets(albumId)`, expect only normalized `image-1` and `video-1`, and assert request URLs are exactly:

```ts
expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
  `http://immich:2283/api/albums/${albumId}`,
  `http://immich:2283/api/activities?albumId=${albumId}&type=like`
]);
```

Update the integration mock to expose `listLikedAlbumAssets(receivedAlbumId)`, record the received UUID, and prove the playlist passes `config.immichAlbumId`.

- [ ] **Step 2: Run tests to verify RED**

```bash
npm test -- tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
```

Expected: FAIL because `listLikedAlbumAssets` does not exist.

- [ ] **Step 3: Implement the two-request intersection**

Replace the port signature with:

```ts
listLikedAlbumAssets(albumId: string): Promise<SlideshowAsset[]>;
```

Implement the method with concurrent requests, strict response-shape checks, a deduplicating ID set, and the existing asset normalization:

```ts
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
      type: item.type,
      capturedAt,
      durationMs: typeof item.duration === "number" ? item.duration : null
    }];
  });
}
```

Change the playlist call to:

```ts
const assets = await options.immich.listLikedAlbumAssets(options.config.immichAlbumId);
```

- [ ] **Step 4: Verify focused tests and type checking**

```bash
npm test -- tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
npm run typecheck
```

Expected: all selected tests and all TypeScript projects PASS.

- [ ] **Step 5: Commit the data-source change**

```bash
git add src/server/immich/client.ts src/server/routes/playlist.ts tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
git commit -m "feat: select shared album likes"
```

### Task 2: Update empty state, permissions, verification, and package

**Files:**
- Modify: `src/client/App.tsx`
- Create: `tests/unit/ui-copy.test.ts`
- Modify: `docs/DOCKGE_SETUP.md`
- Recreate: `/Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow.tar.gz`

- [ ] **Step 1: Write a failing empty-state copy test**

Add:

```ts
import { describe, expect, it } from "vitest";
import { emptyLikedMemoriesCopy } from "../../src/client/App.js";

describe("slideshow copy", () => {
  it("explains how to select shared-album memories", () => {
    expect(emptyLikedMemoriesCopy).toEqual({
      title: "No liked memories yet",
      detail: "Like a few photos or videos in the shared Immich album, then return."
    });
  });
});
```

- [ ] **Step 2: Run the copy test to verify RED**

```bash
npm test -- tests/unit/ui-copy.test.ts
```

Expected: FAIL because `emptyLikedMemoriesCopy` is not exported.

- [ ] **Step 3: Add and use the revised copy**

Export the exact constant from `App.tsx` and use its fields in the empty playlist branch:

```ts
export const emptyLikedMemoriesCopy = {
  title: "No liked memories yet",
  detail: "Like a few photos or videos in the shared Immich album, then return."
} as const;
```

- [ ] **Step 4: Correct Dockge permissions and operating guidance**

Replace the Favourite instructions with:

```markdown
Create the API key under a user who can access the shared album and grant only
`album.read`, `activity.read`, `asset.view`, and `asset.download`. The slideshow
selects current album assets with at least one asset-level Like from any user.
```

Update the deployment verification bullet to say a newly Liked shared-album image/video appears after Begin.

- [ ] **Step 5: Run full verification**

```bash
npm run verify
npm audit --audit-level=critical
SLIDESHOW_ENV_FILE=.env.example docker compose --env-file .env.example config --quiet
git diff --check
```

Expected: all tests and builds PASS, 0 critical vulnerabilities, Compose is valid, and no whitespace errors exist.

- [ ] **Step 6: Commit UI and deployment guidance**

```bash
git add src/client/App.tsx tests/unit/ui-copy.test.ts docs/DOCKGE_SETUP.md
git commit -m "docs: explain shared album likes"
```

- [ ] **Step 7: Regenerate and inspect the Linux archive**

```bash
git -C /Users/nicoyip/.config/superpowers/worktrees/i/immich-baby-slideshow archive --format=tar.gz --prefix=immich-baby-slideshow/ --output=/Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow.tar.gz HEAD
shasum -a 256 /Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow.tar.gz
tar -tzf /Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow.tar.gz | rg 'DOCKGE_SETUP|likes-filter|immich/client.ts|App.tsx'
```

Expected: a checksum prints and all revised implementation and guidance files are present.
