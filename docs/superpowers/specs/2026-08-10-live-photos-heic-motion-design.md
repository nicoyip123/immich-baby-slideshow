# Live Photos & HEIC stills — design

**Date:** 2026-08-10
**Status:** Approved (design), pending spec review

## Problem

Immich stores an iOS Live Photo (and an Android/Samsung/Pixel Motion Photo) as a
single **IMAGE** asset with a hidden companion video linked via
`livePhotoVideoId`. The current slideshow:

1. Classifies the asset purely by `type`, so the **motion is never played** — we
   never read `livePhotoVideoId`, and the companion asset is not independently
   likeable, so it is unreachable.
2. Serves the still from `/assets/:id/original` (`fetchOriginal`), which for
   iPhone photos is **HEIC**. Non-Safari browsers (Chrome, Firefox, Android,
   most TV browsers) cannot decode HEIC, so the sharp layer fails to load and
   `ProgressiveImage` is stuck on its blurred preview — the photo looks
   permanently soft. This affects **all** HEIC photos, not only Live Photos.

## Goals

- Render every still crisply in every browser (fix HEIC).
- Play a Live/Motion Photo's motion clip once, then rest on the still — an
  Apple-like "breath of motion" — without disrupting slideshow pacing or the
  soundtrack.
- iOS Live Photos and Android Motion Photos behave identically (Immich
  normalises both to `livePhotoVideoId`).

## Non-goals

- Playing motion audio. Motion is always muted; the soundtrack carries audio.
- Counting the motion clip as a separate impression — the still owns the
  impression for that slide.

## Confirmed against the live Immich (2026-08-10)

A read-only probe of the configured album (via the running container) confirmed:

- The album endpoint (`GET /albums/:id`) does **not** embed assets on this
  Immich version, so the app's `/search/metadata` fallback is the live path.
  `livePhotoVideoId` is present on those assets — a 36-char UUID string — so the
  existing mapping (shared by both paths) needs only to read it.
- Of **136 liked assets**: 23 are Live Photos (`image/jpeg` + `livePhotoVideoId`),
  91 are plain `image/jpeg` stills, 1 is `image/heic`, and 21 are videos
  (17 `video/quicktime`, 4 `video/mp4`).
- Implication: the stills are overwhelmingly **full-resolution JPEG**. Serving a
  fixed `preview` rendition for all images would downgrade 91 full-res photos to
  rescue one HEIC — the wrong trade. See the revised HEIC fix below.

## Design

### 1. Detect Live/Motion Photos (server)

- `SlideshowAsset` (`src/server/immich/types.ts`) gains `livePhotoVideoId: string | null`.
- The album-asset mapping (`src/server/immich/client.ts`, ~line 73) reads
  `item.livePhotoVideoId` (string or null). Liked-asset selection is unchanged.
- `PlaylistItem` (`src/client/api.ts`) gains an optional `motionUrl?: string`.
  In `src/server/routes/playlist.ts`, when `livePhotoVideoId` is present, set
  `motionUrl = /api/media/{livePhotoVideoId}/video`. The item's `type` stays
  `"IMAGE"`.

The motion clip streams through the **existing** media route
(`/api/media/:id/video` → `fetchVideoPlayback` → `/assets/:id/video/playback`),
which is family-guarded and already handles range requests. `livePhotoVideoId`
is a UUID and satisfies the route's `[A-Za-z0-9_-]{1,128}` id check. No new
endpoint, no impression token. The mapping is shared by the embedded and
`/search/metadata` code paths, so reading `item.livePhotoVideoId` covers both.

### 2. Fix HEIC without downgrading web-safe photos (server)

Change the renditions the media route pulls from Immich
(`src/server/immich/client.ts`):

- **`image` kind** (sharp layer): `/assets/:id/original` →
  `/assets/:id/thumbnail?size=fullsize`. For already web-safe images (JPEG/PNG)
  Immich serves the **original full-resolution** bytes (redirecting internally to
  the download endpoint, which the follow-redirects `fetch` handles and which the
  configured API key's `asset.download` scope permits); for HEIC/RAW it returns a
  **transcoded full-resolution web-safe** rendition. This fixes HEIC while
  keeping the 91 full-res JPEGs at full quality — unlike a fixed `preview`.
- **`thumbnail` kind** (blurred placeholder + admin grid): `size=preview` →
  `size=thumbnail` (small webp). Makes the progressive load a proper small→sharp
  blur-up and lightens the admin grid.

The client-facing URLs (`/api/media/:id/image`, `/api/media/:id/thumbnail`) do
**not** change — only the upstream Immich URL — so existing client tests remain
valid.

> **Dependency:** `size=fullsize` requires a recent Immich (the probed instance
> qualifies — it exposes the `visibility` field) and the `asset.download` scope
> (already granted per `docs/DOCKGE_SETUP.md`). If a future/older instance lacks
> `fullsize`, fall back to `size=preview` for the `image` kind.

### 3. Play the motion (client) — "play once, then rest on still"

A new focused component `src/client/LivePhoto.tsx` keeps `ProgressiveImage`
still-only:

- Renders `<ProgressiveImage item={item}/>` as the base still.
- Overlays a `<video>` that is **always muted**, `autoPlay`, `playsInline`,
  `preload="auto"`, and plays **once** (no loop).
- On `ended` **or** any play failure/error → fades the video out (CSS opacity
  transition) to reveal the crisp still beneath.
- Advancing remains governed by the normal image timer (`photoDurationMs` in the
  `App.tsx` display effect for `type === "IMAGE"`), **not** the clip's `ended`.
  A Live Photo behaves like a photo that breathes for its first couple of
  seconds.

`App.tsx` render selection becomes:

- `type === "IMAGE"` and `item.motionUrl` → `<LivePhoto item={item}/>`
- `type === "IMAGE"` → `<ProgressiveImage item={item}/>`
- `type === "VIDEO"` → existing `<video>` path (unchanged)

Because motion is always muted, it autoplays reliably on every platform (same
lesson as the earlier muted-autoplay fix) and needs none of the
`videoAudioUnlocked` gating. The soundtrack is untouched: `item.type` is
`"IMAGE"`, so `soundtrackLevel` keeps it at full — no ducking.

### 4. Error handling

Motion is best-effort. Blocked autoplay, a 404 companion, or a decode error all
resolve to the same outcome: reveal the still. The slide never freezes because
the image timer owns advancing (unlike the `VIDEO` path, which advances on
`onEnded`).

### 5. iOS / Android parity

Immich extracts the embedded video from Android/Samsung/Pixel Motion Photos and
links it via the same `livePhotoVideoId` field iOS Live Photos use (Immich
PR #6337). Keying off `livePhotoVideoId` therefore handles both automatically.
If Immich has not extracted a motion clip for a given asset (`livePhotoVideoId`
null — e.g. some Takeout/external imports), the slide falls back to a crisp
still. For Android *viewers*, the HEIC fix is a strict improvement.

## Components & boundaries

- `ImmichClient` — adds `livePhotoVideoId` to mapped assets; switches image
  rendition to `fullsize` and thumbnail rendition to `thumbnail`. Interface
  (`ImmichPort`) unchanged except the richer `SlideshowAsset`.
- `playlistRoutes` — derives `motionUrl` from `livePhotoVideoId`.
- `LivePhoto` (new) — owns the still + one-shot muted motion overlay and its
  reveal-on-finish behaviour. Depends only on `ProgressiveImage` and the item's
  `motionUrl`/`thumbnailUrl`.
- `App.tsx` — one added branch in render selection.

## Testing

- **Server** — `livePhotoVideoId` is mapped from album assets; `playlist` emits
  `motionUrl` only when `livePhotoVideoId` is present and never for plain
  images/videos; the media route requests `size=fullsize` for `image` and
  `size=thumbnail` for `thumbnail`.
- **Client** — `LivePhoto` autoplays the muted motion, and on `ended` reveals
  the still; on play failure it reveals the still immediately; the slide advances
  on the image timer regardless of the clip; `App.tsx` routes
  IMAGE+motionUrl → `LivePhoto`, plain IMAGE → `ProgressiveImage`, VIDEO →
  video, unchanged.

## Rollout

Ships behind no flag; behaviour is strictly better (crisper stills everywhere,
motion where available). Deploys via the normal `npm run deploy` → Dockge
rebuild. Post-deploy check: a Live Photo shows a brief motion then a sharp
still, and iPhone photos are crisp in a non-Safari browser.
