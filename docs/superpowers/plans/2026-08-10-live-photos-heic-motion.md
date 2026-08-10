# Live Photos & HEIC Still Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a Live/Motion Photo's motion clip once then rest on a crisp still, and render every still (including HEIC) sharply in all browsers.

**Architecture:** The server tags each Live Photo asset with its `livePhotoVideoId`, the playlist turns that into a `motionUrl` streamed through the existing media route, and a new `LivePhoto` client component overlays a muted, play-once `<video>` over the still. Stills are pulled from Immich's `fullsize` rendition (web-safe at full resolution) instead of the raw original.

**Tech Stack:** TypeScript, Fastify (server), React 18 (client), Vitest + Testing Library, Immich REST API.

## Global Constraints

- Motion is **always muted**; the soundtrack is never ducked for a Live Photo (its `type` stays `"IMAGE"`).
- Advancing a Live Photo slide is governed by the **image timer** (`photoDurationMs`), never by the motion clip's `ended` — the clip finishing only reveals the still.
- The motion clip carries **no impression token**; the still owns the slide's impression.
- Motion is **best-effort**: any autoplay/decode/404 failure must reveal the still, never freeze.
- The still rendition is `GET /assets/:id/thumbnail?size=fullsize` (needs a recent Immich + `asset.download` scope — both satisfied on the target). If a deployment lacks `fullsize`, the fallback is `size=preview`.
- iOS Live Photos and Android Motion Photos are identical here — both key off `livePhotoVideoId`.
- Follow existing code style: dense single-line modules on the client, conventional multi-line on the server. TDD, one commit per task.

---

## File Structure

- `src/server/immich/types.ts` — add `livePhotoVideoId` to `SlideshowAsset`.
- `src/server/immich/client.ts` — map `livePhotoVideoId`; switch still rendition to `fullsize` and placeholder to `thumbnail`; rename `fetchOriginal` → `fetchStill`.
- `src/server/routes/media.ts` — call `fetchStill` for the `image` kind.
- `src/server/routes/playlist.ts` — emit `motionUrl` for Live Photos.
- `src/client/api.ts` — add optional `motionUrl` to `PlaylistItem`.
- `src/client/LivePhoto.tsx` (new) — still + play-once muted motion overlay.
- `src/client/App.tsx` — route `IMAGE + motionUrl` to `LivePhoto`.
- `src/client/styles.css` — `.media-motion` overlay + fade.
- Tests: `tests/unit/immich-client.test.ts`, `tests/integration/slideshow-routes.test.ts`, `tests/unit/live-photo.test.tsx` (new), `tests/unit/slideshow-media.test.tsx`.

---

### Task 1: Capture `livePhotoVideoId` on the server asset

**Files:**
- Modify: `src/server/immich/types.ts:3-8`
- Modify: `src/server/immich/client.ts:73-78`
- Test: `tests/unit/immich-client.test.ts`
- Modify (type fix): `tests/integration/slideshow-routes.test.ts:24-27`

**Interfaces:**
- Produces: `SlideshowAsset` gains `livePhotoVideoId: string | null`. `listLikedAlbumAssets` returns objects that include this field (value is the companion video's UUID, or `null`).

- [ ] **Step 1: Write the failing test** — add to `tests/unit/immich-client.test.ts` inside the `describe("ImmichClient", …)` block:

```ts
it("maps livePhotoVideoId for live photos and null otherwise", async () => {
  const liveAlbum = { assets: [
    { id: "live-1", type: "IMAGE", localDateTime: "2025-07-01T10:00:00", duration: null, livePhotoVideoId: "motion-uuid-1" },
    { id: "plain-1", type: "IMAGE", localDateTime: "2025-07-02T10:00:00", duration: null }
  ] };
  const liveActivities = [{ type: "like", assetId: "live-1" }, { type: "like", assetId: "plain-1" }];
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(liveAlbum), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(liveActivities), { status: 200 }));
  const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });

  await expect(client.listLikedAlbumAssets(albumId)).resolves.toEqual([
    { id: "live-1", type: "IMAGE", capturedAt: "2025-07-01T10:00:00", durationMs: null, livePhotoVideoId: "motion-uuid-1" },
    { id: "plain-1", type: "IMAGE", capturedAt: "2025-07-02T10:00:00", durationMs: null, livePhotoVideoId: null }
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/immich-client.test.ts -t "maps livePhotoVideoId"`
Expected: FAIL — resolved objects lack `livePhotoVideoId`.

- [ ] **Step 3: Add the field to the type** — in `src/server/immich/types.ts`, extend `SlideshowAsset`:

```ts
export interface SlideshowAsset {
  id: string;
  type: AssetType;
  capturedAt: string;
  durationMs: number | null;
  livePhotoVideoId: string | null;
}
```

- [ ] **Step 4: Map the field** — in `src/server/immich/client.ts`, the returned object in `listLikedAlbumAssets` (currently ending with the `durationMs` line ~77) becomes:

```ts
      return [{
        id: item.id,
        type: item.type as AssetType,
        capturedAt,
        durationMs: typeof item.duration === "number" ? item.duration : null,
        livePhotoVideoId: typeof item.livePhotoVideoId === "string" ? item.livePhotoVideoId : null
      }];
```

- [ ] **Step 5: Fix the two existing `.toEqual` expectations** — in `tests/unit/immich-client.test.ts`, append `, livePhotoVideoId: null` to each object in the two existing expected arrays (the `intersects current album assets…` test at ~line 30-31 and the `loads every album asset page…` test at ~line 54-55). Each of the four objects (`image-1`, `video-1` in both tests) gains `livePhotoVideoId: null`.

- [ ] **Step 6: Fix the integration mock's types** — in `tests/integration/slideshow-routes.test.ts`, the two assets returned by `listLikedAlbumAssets` (lines 25-26) each gain `livePhotoVideoId: null`:

```ts
        { id: "photo-1", type: "IMAGE", capturedAt: "2025-04-01T10:00:00", durationMs: null, livePhotoVideoId: null },
        { id: "video-1", type: "VIDEO", capturedAt: "2025-05-01T10:00:00", durationMs: 1200, livePhotoVideoId: null }
```

- [ ] **Step 7: Run the suites to verify they pass**

Run: `npx vitest run tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/immich/types.ts src/server/immich/client.ts tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
git commit -m "feat: capture livePhotoVideoId on slideshow assets"
```

---

### Task 2: Web-safe still rendition (fix HEIC) + lighter placeholder

**Files:**
- Modify: `src/server/immich/client.ts:13-18` (interface), `:118-119` (methods)
- Modify: `src/server/routes/media.ts:8-9`
- Modify: `tests/integration/slideshow-routes.test.ts:29` (rename mock method)
- Test: `tests/unit/immich-client.test.ts`

**Interfaces:**
- Consumes: `SlideshowAsset` from Task 1.
- Produces: `ImmichPort.fetchStill(id: string, range?: string): Promise<UpstreamMedia>` replaces `fetchOriginal`. `fetchThumbnail` now returns the small `thumbnail` rendition; `fetchStill` returns the `fullsize` rendition.

- [ ] **Step 1: Write the failing test** — add to `tests/unit/immich-client.test.ts`:

```ts
it("requests full-size web-safe stills and lightweight thumbnails", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("x", { status: 200, headers: { "content-type": "image/jpeg" } }));
  const client = new ImmichClient({ baseUrl: "http://immich:2283", apiKey: "secret-key" });
  await client.fetchThumbnail("asset-1");
  await client.fetchStill("asset-2");
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    "http://immich:2283/api/assets/asset-1/thumbnail?size=thumbnail",
    "http://immich:2283/api/assets/asset-2/thumbnail?size=fullsize"
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/immich-client.test.ts -t "full-size web-safe"`
Expected: FAIL — `client.fetchStill` is not a function / thumbnail URL uses `size=preview`.

- [ ] **Step 3: Update the interface** — in `src/server/immich/client.ts`, change the `ImmichPort` member (line ~16):

```ts
  fetchStill(id: string, range?: string): Promise<UpstreamMedia>;
```

- [ ] **Step 4: Update the concrete methods** — replace lines ~118-119:

```ts
  fetchThumbnail(id: string) { return this.media(`/assets/${encodeURIComponent(id)}/thumbnail?size=thumbnail`); }
  fetchStill(id: string, range?: string) { return this.media(`/assets/${encodeURIComponent(id)}/thumbnail?size=fullsize`, range); }
```

(Leave `fetchVideoPlayback` unchanged.)

- [ ] **Step 5: Update the media route** — in `src/server/routes/media.ts`, the `send` helper (line ~9) calls `fetchStill` for the `image` kind:

```ts
    const media = kind === "thumbnail" ? await options.immich.fetchThumbnail(id) : kind === "image" ? await options.immich.fetchStill(id, range) : await options.immich.fetchVideoPlayback(id, range);
```

- [ ] **Step 6: Update the integration mock** — in `tests/integration/slideshow-routes.test.ts` line 29, rename the mocked method and its label:

```ts
      async fetchStill(id, range) { calls.push(`image:${id}:${range}`); return { status: range ? 206 : 200, headers: new Headers({ "content-type": "image/jpeg", "content-range": "bytes 0-1/2" }), body: new Response("ok").body }; },
```

- [ ] **Step 7: Run the suites to verify they pass**

Run: `npx vitest run tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/immich/client.ts src/server/routes/media.ts tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
git commit -m "fix: serve web-safe full-size stills and lighter thumbnails"
```

---

### Task 3: Playlist emits `motionUrl` for Live Photos

**Files:**
- Modify: `src/client/api.ts:1`
- Modify: `src/server/routes/playlist.ts:14-20`
- Test: `tests/integration/slideshow-routes.test.ts`

**Interfaces:**
- Consumes: `SlideshowAsset.livePhotoVideoId` from Task 1.
- Produces: `PlaylistItem` gains `motionUrl?: string`. Present only when the asset is a Live Photo; equals `/api/media/{livePhotoVideoId}/video`.

- [ ] **Step 1: Write the failing test** — in `tests/integration/slideshow-routes.test.ts`, add a Live Photo to the mock and a new test.

First, add a third asset to the mock's `listLikedAlbumAssets` return (after the `video-1` line, ~line 26):

```ts
        { id: "live-1", type: "IMAGE", capturedAt: "2025-06-01T10:00:00", durationMs: null, livePhotoVideoId: "motion-1" }
```

Then update the existing `creates an authenticated mixed playlist…` test's two assertions:

```ts
    expect(body.items).toHaveLength(3);
    expect(body.items.map((item: { type: string }) => item.type).sort()).toEqual(["IMAGE", "IMAGE", "VIDEO"]);
```

Then add the new test:

```ts
  it("marks Live Photos with a motion URL and leaves plain media without one", async () => {
    const { app, family } = await setup();
    const body = (await app.inject({ method: "POST", url: "/api/playlist", headers: { origin, cookie: family } })).json();
    const find = (id: string) => body.items.find((item: { id: string }) => item.id === id);
    expect(find("live-1").motionUrl).toBe("/api/media/motion-1/video");
    expect(find("photo-1").motionUrl).toBeUndefined();
    expect(find("video-1").motionUrl).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/slideshow-routes.test.ts -t "motion URL"`
Expected: FAIL — `find("live-1").motionUrl` is `undefined`.

- [ ] **Step 3: Add the client type** — in `src/client/api.ts`, extend the `PlaylistItem` interface (line 1) with an optional field:

```ts
export interface PlaylistItem { id:string; type:"IMAGE"|"VIDEO"; durationMs:number|null; ageLabel:string|null; impressionToken:string; mediaUrl:string; thumbnailUrl:string; motionUrl?:string }
```

- [ ] **Step 4: Emit `motionUrl`** — in `src/server/routes/playlist.ts`, the per-item object (lines ~15-19) gains a conditional `motionUrl`:

```ts
      return { playlistId: randomBytes(18).toString("base64url"), photoDurationMs: options.config.photoDurationMs, items: shuffled(assets).map((asset) => ({
        id: asset.id, type: asset.type, durationMs: asset.durationMs,
        ageLabel: formatBabyAge(options.config.babyBirthDate, asset.capturedAt, options.config.timezone),
        impressionToken: options.impressions.issue(asset.id, asset.type),
        mediaUrl: `/api/media/${encodeURIComponent(asset.id)}/${asset.type === "VIDEO" ? "video" : "image"}`,
        thumbnailUrl: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        ...(asset.livePhotoVideoId ? { motionUrl: `/api/media/${encodeURIComponent(asset.livePhotoVideoId)}/video` } : {})
      })) };
```

- [ ] **Step 5: Run the suites to verify they pass**

Run: `npx vitest run tests/integration/slideshow-routes.test.ts && npx tsc --noEmit && npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/api.ts src/server/routes/playlist.ts tests/integration/slideshow-routes.test.ts
git commit -m "feat: expose Live Photo motion clips in the playlist"
```

---

### Task 4: `LivePhoto` client component

**Files:**
- Create: `src/client/LivePhoto.tsx`
- Test: `tests/unit/live-photo.test.tsx`

**Interfaces:**
- Consumes: `ProgressiveImage` (existing) — takes `{ id, mediaUrl, thumbnailUrl }`.
- Produces: `LivePhoto({ item, motionUrl }: { item: { id: string; mediaUrl: string; thumbnailUrl: string }; motionUrl: string })` — renders the still plus a muted, `autoPlay`, `playsInline`, play-once `<video class="media media-motion">` that gains `media-motion-done` on `ended` or `error`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/live-photo.test.tsx`:

```tsx
// @vitest-environment jsdom
import {cleanup,fireEvent,render} from "@testing-library/react";
import {afterEach,describe,expect,test} from "vitest";
import {LivePhoto} from "../../src/client/LivePhoto.js";

afterEach(cleanup);

const item={id:"lp",mediaUrl:"/api/media/lp/image",thumbnailUrl:"/api/media/lp/thumbnail"};

describe("LivePhoto",()=>{
 test("overlays a muted autoplaying motion clip above the still",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/api/media/motion/video"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  expect(container.querySelector(".media-original")).toBeTruthy();
  expect(video.muted).toBe(true);
  expect(video.hasAttribute("autoplay")).toBe(true);
  expect(video.hasAttribute("playsinline")).toBe(true);
  expect(video.getAttribute("src")).toBe("/api/media/motion/video");
  expect(video.getAttribute("poster")).toBe("/api/media/lp/thumbnail");
  expect(video.classList.contains("media-motion-done")).toBe(false);
 });

 test("reveals the still when the motion ends",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/m"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  fireEvent.ended(video);
  expect(video.classList.contains("media-motion-done")).toBe(true);
 });

 test("reveals the still when the motion fails",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/m"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  fireEvent.error(video);
  expect(video.classList.contains("media-motion-done")).toBe(true);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/live-photo.test.tsx`
Expected: FAIL — cannot import `LivePhoto` (module does not exist).

- [ ] **Step 3: Create the component** — write `src/client/LivePhoto.tsx`:

```tsx
import {useState} from "react";
import {ProgressiveImage} from "./ProgressiveImage.js";

interface LivePhotoItem{id:string;mediaUrl:string;thumbnailUrl:string}

export function LivePhoto({item,motionUrl}:{item:LivePhotoItem;motionUrl:string}){
 const [done,setDone]=useState(false);
 return <div className="media-stack">
  <ProgressiveImage item={item}/>
  <video
   className={`media media-motion${done?" media-motion-done":""}`}
   src={motionUrl}
   poster={item.thumbnailUrl}
   muted
   autoPlay
   playsInline
   preload="auto"
   onEnded={()=>setDone(true)}
   onError={()=>setDone(true)}
  />
 </div>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/live-photo.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/LivePhoto.tsx tests/unit/live-photo.test.tsx
git commit -m "feat: add LivePhoto motion-over-still component"
```

---

### Task 5: Wire `LivePhoto` into the slideshow + styles

**Files:**
- Modify: `src/client/App.tsx:9` (import), `:28` (render branch)
- Modify: `src/client/styles.css:4` (add `.media-motion` rules), `:5` (reduced-motion)
- Test: `tests/unit/slideshow-media.test.tsx`

**Interfaces:**
- Consumes: `LivePhoto` (Task 4), `PlaylistItem.motionUrl` (Task 3).
- Produces: `App` renders `IMAGE + motionUrl` → `<LivePhoto>`, plain `IMAGE` → `<ProgressiveImage>`, `VIDEO` → existing `<video>` (unchanged).

- [ ] **Step 1: Write the failing test** — add to `tests/unit/slideshow-media.test.tsx` inside the `describe("slideshow media integration", …)` block:

```tsx
 test("renders a Live Photo as a motion overlay and never advances when the clip ends",async()=>{
  const livePhoto={...first,id:"lp",motionUrl:"/api/media/motion-1/video"};
  clientApi.createPlaylist.mockResolvedValue({...playlist,items:[livePhoto,second]});
  mixerHarness();
  const {container}=await begin();
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;

  expect(container.querySelector(".media-original")).toBeTruthy();
  expect(video.getAttribute("src")).toBe("/api/media/motion-1/video");
  expect(video.muted).toBe(true);

  fireEvent.ended(video);
  expect(video.classList.contains("media-motion-done")).toBe(true);
  // still on the same (image) slide — the VIDEO item has not been mounted
  expect(container.querySelector(".media-original")).toBeTruthy();
  expect(container.querySelector("video.media:not(.media-motion)")).toBeNull();
 });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/slideshow-media.test.tsx -t "motion overlay"`
Expected: FAIL — no `video.media-motion` element (App still renders `ProgressiveImage` for the image).

- [ ] **Step 3: Import the component** — in `src/client/App.tsx`, add to the imports (near line 9, alongside the other client imports):

```tsx
import {LivePhoto} from "./LivePhoto.js";
```

- [ ] **Step 4: Add the render branch** — in `src/client/App.tsx`, replace the still/video selection in `content` (currently `item.type==="IMAGE"?<ProgressiveImage key={item.id} item={item}/>:<video …/>`) with:

```tsx
{item.type==="IMAGE"?(item.motionUrl?<LivePhoto key={item.id} item={item} motionUrl={item.motionUrl}/>:<ProgressiveImage key={item.id} item={item}/>):<video ref={video} key={item.id} className="media" src={item.mediaUrl} poster={item.thumbnailUrl} preload="auto" autoPlay={!paused} muted={muted||!videoAudioUnlocked} onEnded={()=>move(1)} playsInline/>}
```

- [ ] **Step 5: Add the styles** — in `src/client/styles.css`, on the `.stage` line (line 4), add two rules next to the existing `.media` rules (e.g. immediately after `.media{object-fit:contain}`):

```css
.media-motion{opacity:1;transition:opacity .4s ease}.media-motion-done{opacity:0}
```

Then in the reduced-motion block (line 5, `@media(prefers-reduced-motion:reduce){…}`), add `.media-motion` to the `transition:none` selector list so it reads:

```css
.controls,.media-preview,.media-original,.media-motion{transition:none}
```

- [ ] **Step 6: Run the suites to verify they pass**

Run: `npx vitest run tests/unit/slideshow-media.test.tsx tests/unit/slideshow-mobile.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green (unit + integration), production build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/client/App.tsx src/client/styles.css tests/unit/slideshow-media.test.tsx
git commit -m "feat: play Live Photo motion in the slideshow"
```

---

## Self-Review

**Spec coverage:**
- Detect Live/Motion Photos (`livePhotoVideoId`) → Task 1. ✓
- `motionUrl` via existing media route, no new endpoint, no impression → Task 3. ✓
- HEIC fix without downgrading web-safe photos (`fullsize`) + lighter placeholder (`thumbnail`) → Task 2. ✓
- Play-once muted motion, reveal still, image-timer advancing → Tasks 4 & 5. ✓
- Best-effort error handling (ended/error → reveal still; advancing owned by image timer) → Tasks 4 & 5. ✓
- iOS/Android parity → automatic via `livePhotoVideoId` (no code branch needed). ✓

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type consistency:** `SlideshowAsset.livePhotoVideoId: string | null` (Task 1) is read in Task 3; `fetchStill(id, range?)` (Task 2) is called in Task 2 media route and mocked in the integration test; `PlaylistItem.motionUrl?: string` (Task 3) is consumed by `LivePhoto`'s `motionUrl: string` prop via the `item.motionUrl` truthiness narrowing in Task 5; `LivePhoto({item, motionUrl})` signature (Task 4) matches its call site (Task 5).
