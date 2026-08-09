# Slideshow Loading, Audio Ducking, and Precise Age Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make media transitions feel immediate, keep background music quietly playing under videos, and show calendar-accurate year/month/day baby ages.

**Architecture:** Add three focused client units: a progressive image component, a bounded next-item preloader, and a Web Audio soundtrack mixer with a safe media-element fallback. Keep slideshow orchestration in `App.tsx`, and extend the existing server age formatter with clamped calendar-anniversary arithmetic.

**Tech Stack:** React 19, TypeScript, Web Audio API, HTML media elements, Vitest, Testing Library, Fastify/Vite build pipeline.

---

## File Structure

- Modify `src/server/slideshow/age.ts`: produce precise calendar year/month/day labels.
- Modify `tests/unit/slideshow.test.ts`: cover precise ages, leap days, month ends, timezones, and invalid inputs.
- Create `src/client/ProgressiveImage.tsx`: own thumbnail/original layers and load/error transition state.
- Create `tests/unit/progressive-image.test.tsx`: verify preview, successful reveal, and original failure fallback.
- Create `src/client/media-preload.ts`: preload and clean up exactly one image original or video metadata resource.
- Create `tests/unit/media-preload.test.ts`: verify request type, cleanup, and one-item selection.
- Create `src/client/soundtrack.ts`: own Web Audio gain targets, smooth ramps, fallback, playback, and disposal.
- Create `tests/unit/soundtrack.test.ts`: verify gain behavior, fallback, errors, and cleanup.
- Modify `src/client/App.tsx`: coordinate the active item, preloader, progressive image, video, persistent soundtrack, and mute state.
- Modify `src/client/styles.css`: layer preview/original media and respect reduced motion.
- Create `tests/unit/slideshow-media.test.tsx`: cover integrated preload, audio, video, mute, and navigation behavior.

### Task 1: Calendar-Precise Baby Ages

**Files:**
- Modify: `src/server/slideshow/age.ts`
- Modify: `tests/unit/slideshow.test.ts`

- [ ] **Step 1: Replace coarse age expectations with precise failing cases**

Extend the age table and add focused month-end cases:

```ts
it.each([
  ["2025-01-01", "2025-01-01T12:00:00", "0 days old"],
  ["2025-01-01", "2025-01-02T12:00:00", "1 day old"],
  ["2025-01-01", "2025-02-01T12:00:00", "1 month, 0 days old"],
  ["2025-01-01", "2025-03-06T12:00:00", "2 months, 5 days old"],
  ["2024-01-01", "2025-03-06T12:00:00", "1 year, 2 months, 5 days old"],
  ["2024-02-29", "2025-02-28T12:00:00Z", "1 year, 0 months, 0 days old"],
  ["2025-01-31", "2025-03-01T12:00:00", "1 month, 1 day old"],
  ["2025-01-01", "2024-12-31T12:00:00", null],
  ["2025-02-30", "2025-03-01T12:00:00", null],
  ["2025-01-01", "2025-02-30T12:00:00", null],
  ["2025-01-01", "not-a-date", null]
])("formats %s at %s", (birth, captured, expected) => {
  expect(formatBabyAge(birth!, captured!, "Australia/Melbourne")).toBe(expected);
});

it("uses the configured timezone before calculating the calendar date", () => {
  expect(formatBabyAge("2025-01-01", "2025-02-28T13:30:00Z", "Australia/Melbourne"))
    .toBe("2 months, 0 days old");
});
```

- [ ] **Step 2: Run the focused age test and verify RED**

Run: `npm test -- tests/unit/slideshow.test.ts`

Expected: FAIL because the formatter currently drops residual days and remaining months.

- [ ] **Step 3: Implement clamped calendar-anniversary arithmetic**

Retain `dateParts`, then add helpers and replace the coarse branches:

```ts
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(
  [year, month, day]: [number, number, number],
  months: number
): [number, number, number] {
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return [targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth))];
}

function unit(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}
```

Validate both local captured-date parts and birth-date parts with `month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)` before doing arithmetic. Return `null` for impossible calendar dates rather than allowing `Date.UTC` to normalize them into another month.

After calculating the largest completed `months` value, calculate the clamped anchor and residual whole days:

```ts
const anchor = addMonthsClamped(birth, months);
const residualDays = Math.floor(
  (Date.UTC(cy, cm - 1, cd) - Date.UTC(anchor[0], anchor[1] - 1, anchor[2])) / 86_400_000
);
if (months < 1) return `${unit(residualDays, "day")} old`;
if (months < 12) return `${unit(months, "month")}, ${unit(residualDays, "day")} old`;
const years = Math.floor(months / 12);
const remainingMonths = months % 12;
return `${unit(years, "year")}, ${unit(remainingMonths, "month")}, ${unit(residualDays, "day")} old`;
```

- [ ] **Step 4: Run the age suite and typecheck**

Run: `npm test -- tests/unit/slideshow.test.ts && npm run typecheck`

Expected: all slideshow unit tests pass and all TypeScript projects report no errors.

- [ ] **Step 5: Commit precise age labels**

```bash
git add src/server/slideshow/age.ts tests/unit/slideshow.test.ts
git commit -m "feat: show precise baby ages"
```

### Task 2: Progressive Images and Bounded Preloading

**Files:**
- Create: `src/client/ProgressiveImage.tsx`
- Create: `src/client/media-preload.ts`
- Create: `tests/unit/progressive-image.test.tsx`
- Create: `tests/unit/media-preload.test.ts`

- [ ] **Step 1: Write failing progressive-image tests**

Use jsdom and Testing Library:

```tsx
// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";
import { ProgressiveImage } from "../../src/client/ProgressiveImage.js";

const item = {
  id: "photo",
  mediaUrl: "/api/media/photo/image",
  thumbnailUrl: "/api/media/photo/thumbnail"
};

test("keeps the thumbnail visible until the original loads", () => {
  const { container } = render(<ProgressiveImage item={item}/>);
  const preview = container.querySelector<HTMLImageElement>(".media-preview")!;
  const original = container.querySelector<HTMLImageElement>(".media-original")!;
  expect(preview.src).toContain(item.thumbnailUrl);
  expect(original.classList.contains("media-original-loaded")).toBe(false);
  fireEvent.load(original);
  expect(original.classList.contains("media-original-loaded")).toBe(true);
  expect(preview.classList.contains("media-preview-hidden")).toBe(true);
});

test("leaves the preview visible when the original fails", () => {
  const { container } = render(<ProgressiveImage item={item}/>);
  fireEvent.error(container.querySelector(".media-original")!);
  expect(container.querySelector(".media-preview-hidden")).toBeNull();
});
```

- [ ] **Step 2: Write failing one-item preload tests**

Define test fakes against the planned factory interface:

```ts
import { expect, test, vi } from "vitest";
import { preloadMediaItem } from "../../src/client/media-preload.js";

test("preloads an image original and removes it on cleanup", () => {
  const image = { src: "", removeAttribute: vi.fn() };
  const video = { src: "", preload: "", load: vi.fn(), removeAttribute: vi.fn() };
  const cleanup = preloadMediaItem(
    { type: "IMAGE", mediaUrl: "/full", thumbnailUrl: "/thumb" },
    { createImage: () => image, createVideo: () => video }
  );
  expect(image.src).toBe("/full");
  expect(video.load).not.toHaveBeenCalled();
  cleanup();
  expect(image.removeAttribute).toHaveBeenCalledWith("src");
});

test("requests metadata only for the next video", () => {
  const video = { src: "", preload: "", load: vi.fn(), removeAttribute: vi.fn() };
  const cleanup = preloadMediaItem(
    { type: "VIDEO", mediaUrl: "/video", thumbnailUrl: "/poster" },
    { createImage: () => ({ src: "", removeAttribute: vi.fn() }), createVideo: () => video }
  );
  expect(video).toMatchObject({ src: "/video", preload: "metadata" });
  expect(video.load).toHaveBeenCalledOnce();
  cleanup();
  expect(video.removeAttribute).toHaveBeenCalledWith("src");
  expect(video.load).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Run both new test files and verify RED**

Run: `npm test -- tests/unit/progressive-image.test.tsx tests/unit/media-preload.test.ts`

Expected: FAIL because both client modules are missing.

- [ ] **Step 4: Implement the progressive image component**

Create `src/client/ProgressiveImage.tsx`:

```tsx
import { useState } from "react";

interface ProgressiveImageItem {
  id: string;
  mediaUrl: string;
  thumbnailUrl: string;
}

export function ProgressiveImage({ item }: { item: ProgressiveImageItem }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="media-stack">
    <img
      className={`media media-preview${loaded ? " media-preview-hidden" : ""}`}
      src={item.thumbnailUrl}
      alt=""
      aria-hidden="true"
    />
    <img
      className={`media kenburns media-original${loaded ? " media-original-loaded" : ""}`}
      src={item.mediaUrl}
      alt=""
      onLoad={() => setLoaded(true)}
    />
  </div>;
}
```

The parent must render it with `key={item.id}` so state resets for every memory.

- [ ] **Step 5: Implement the bounded preloader**

Create `src/client/media-preload.ts`:

```ts
export interface PreloadItem {
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  thumbnailUrl: string;
}

interface PreloadResource {
  src: string;
  removeAttribute(name: string): void;
}

interface VideoPreloadResource extends PreloadResource {
  preload: string;
  load(): void;
}

export interface MediaPreloadFactory {
  createImage(): PreloadResource;
  createVideo(): VideoPreloadResource;
}

const browserFactory: MediaPreloadFactory = {
  createImage: () => new Image(),
  createVideo: () => document.createElement("video")
};

export function preloadMediaItem(
  item: PreloadItem,
  factory: MediaPreloadFactory = browserFactory
): () => void {
  if (item.type === "IMAGE") {
    const image = factory.createImage();
    image.src = item.mediaUrl;
    return () => image.removeAttribute("src");
  }
  const video = factory.createVideo();
  video.preload = "metadata";
  video.src = item.mediaUrl;
  video.load();
  return () => {
    video.removeAttribute("src");
    video.load();
  };
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/unit/progressive-image.test.tsx tests/unit/media-preload.test.ts && npm run typecheck`

Expected: both files pass and TypeScript reports no errors.

- [ ] **Step 7: Commit media-loading units**

```bash
git add src/client/ProgressiveImage.tsx src/client/media-preload.ts tests/unit/progressive-image.test.tsx tests/unit/media-preload.test.ts
git commit -m "feat: load slideshow media progressively"
```

### Task 3: Mobile-Compatible Soundtrack Mixer

**Files:**
- Create: `src/client/soundtrack.ts`
- Create: `tests/unit/soundtrack.test.ts`

- [ ] **Step 1: Write failing mixer tests with explicit audio fakes**

Cover target selection and a Web Audio graph without using real sound:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSoundtrackMixer, soundtrackLevel } from "../../src/client/soundtrack.js";

it.each([
  ["IMAGE", false, 1],
  ["VIDEO", false, 0.15],
  ["IMAGE", true, 0],
  ["VIDEO", true, 0]
] as const)("uses %s muted=%s level %s", (type, muted, expected) => {
  expect(soundtrackLevel(type, muted)).toBe(expected);
});

it("ramps gain, starts from a user gesture, and disposes the graph", async () => {
  const parameter = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn()
  };
  const gain = { gain: parameter, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(() => gain), disconnect: vi.fn() };
  const context = {
    currentTime: 4,
    destination: {},
    createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  };
  const audio = { play: vi.fn().mockResolvedValue(undefined), volume: 1 };
  const mixer = createSoundtrackMixer(audio, () => context);
  mixer.setTarget(0.15);
  expect(parameter.linearRampToValueAtTime).toHaveBeenCalledWith(0.15, 4.4);
  await mixer.start();
  expect(context.resume).toHaveBeenCalledOnce();
  expect(audio.play).toHaveBeenCalledOnce();
  mixer.dispose();
  expect(source.disconnect).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  expect(context.close).toHaveBeenCalledOnce();
});
```

Add tests where context creation throws, `volume` assignment throws, `resume()` rejects, and `play()` rejects. Each public method must remain non-throwing; fallback `setTarget(0.15)` should set `audio.volume` when possible.

- [ ] **Step 2: Run the mixer suite and verify RED**

Run: `npm test -- tests/unit/soundtrack.test.ts`

Expected: FAIL because `src/client/soundtrack.ts` does not exist.

- [ ] **Step 3: Implement gain automation with safe fallback**

Create `src/client/soundtrack.ts` with structural interfaces so tests need no unsafe DOM assertions:

```ts
export interface SoundtrackMixer {
  start(): Promise<void>;
  setTarget(level: number): void;
  dispose(): void;
}

export function soundtrackLevel(type: "IMAGE" | "VIDEO" | undefined, muted: boolean): number {
  if (muted) return 0;
  return type === "VIDEO" ? 0.15 : 1;
}
```

`createSoundtrackMixer(audio, createContext = browserContextFactory)` must:

1. create one media-element source and one gain node;
2. connect source → gain → destination;
3. on `setTarget`, clamp to `[0,1]`, cancel prior automation at `currentTime`, capture current gain with `setValueAtTime`, and linearly ramp to the target at `currentTime + 0.4`;
4. on `start`, independently catch failures from `context.resume()` and `audio.play()` so one cannot prevent the other;
5. on `dispose`, idempotently disconnect both nodes and close the context, catching all failures;
6. if graph creation fails, return a fallback whose `setTarget` safely assigns `audio.volume`, whose `start` catches `audio.play()`, and whose `dispose` is a no-op.

Use `window.AudioContext`; augment the local window type with optional `webkitAudioContext` only inside the default factory. Do not add global declarations.

- [ ] **Step 4: Run the mixer tests and typecheck**

Run: `npm test -- tests/unit/soundtrack.test.ts && npm run typecheck`

Expected: all mixer tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the mixer**

```bash
git add src/client/soundtrack.ts tests/unit/soundtrack.test.ts
git commit -m "feat: duck music beneath videos"
```

### Task 4: Integrate Loading and Sound into the Slideshow

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`
- Create: `tests/unit/slideshow-media.test.tsx`
- Verify: `tests/unit/slideshow-mobile.test.tsx`

- [ ] **Step 1: Write a failing integrated slideshow test**

Mock the new boundaries and use a two-item image/video playlist:

```tsx
// @vitest-environment jsdom
const mixer = vi.hoisted(() => ({ start: vi.fn(), setTarget: vi.fn(), dispose: vi.fn() }));
const preloadMediaItem = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("../../src/client/soundtrack.js", () => ({
  createSoundtrackMixer: vi.fn(() => mixer),
  soundtrackLevel: (type: string | undefined, muted: boolean) => muted ? 0 : type === "VIDEO" ? 0.15 : 1
}));
vi.mock("../../src/client/media-preload.js", () => ({ preloadMediaItem }));
```

After clicking Begin, assert:

- the first image's thumbnail and original are both rendered;
- only the second item is passed to `preloadMediaItem`;
- the soundtrack starts and receives level `1`;
- clicking Next renders a video with `preload="auto"`, `poster` equal to its thumbnail, and `muted === false`;
- the old preload cleanup runs and the mixer receives `0.15` without an audio `pause()` call;
- clicking Mute sets the video's `muted` property and mixer target `0`;
- clicking Previous while muted keeps target `0`;
- unmuting on the image restores target `1`;
- unmounting calls preload cleanup and mixer disposal.

- [ ] **Step 2: Run the integration and existing mobile tests to verify RED**

Run: `npm test -- tests/unit/slideshow-media.test.tsx tests/unit/slideshow-mobile.test.tsx`

Expected: the new test fails because `Slideshow` still pauses music, renders no progressive image, and does not preload the next item; existing mobile tests remain green.

- [ ] **Step 3: Integrate the focused units in `Slideshow`**

Import `ProgressiveImage`, `preloadMediaItem`, `createSoundtrackMixer`, `soundtrackLevel`, and the mixer type.

Add one mixer ref and keep one keyed soundtrack element rendered in every Slideshow branch:

```tsx
const mixer = useRef<SoundtrackMixer>();
const soundtrack = <audio key="soundtrack" ref={audio} src="/api/soundtrack" loop/>;

useEffect(() => () => mixer.current?.dispose(), []);
useEffect(() => {
  mixer.current?.setTarget(soundtrackLevel(item?.type, muted));
}, [item?.type, muted]);
```

In the Begin handler, create and start the mixer before the playlist network request so mobile browsers receive `resume()` and `play()` directly from the user gesture. Begin at normal soundtrack level, then update the target after the playlist arrives:

```ts
if (audio.current && !mixer.current) mixer.current = createSoundtrackMixer(audio.current);
mixer.current?.setTarget(soundtrackLevel(undefined, muted));
void mixer.current?.start();
const p = await api.createPlaylist();
mixer.current?.setTarget(soundtrackLevel(p.items[0]?.type, muted));
setList(p);
```

Delete the effect that pauses soundtrack audio for videos. Keep the existing video pause/play effect.

Add exactly one next-item preload effect:

```ts
useEffect(() => {
  if (!list || list.items.length < 2) return;
  return preloadMediaItem(list.items[(index + 1) % list.items.length]!);
}, [index, list]);
```

Render active media as:

```tsx
{item.type === "IMAGE"
  ? <ProgressiveImage key={item.id} item={item}/>
  : <video
      ref={video}
      key={item.id}
      className="media"
      src={item.mediaUrl}
      poster={item.thumbnailUrl}
      preload="auto"
      autoPlay={!paused}
      muted={muted}
      onEnded={() => move(1)}
      playsInline
    />}
```

Each early return must include the same `soundtrack` element. Do not create a second audio element.

- [ ] **Step 4: Add progressive layering and reduced-motion CSS**

Extend the media rules:

```css
.media,.media-stack{position:absolute;inset:0;width:100%;height:100%}
.media{object-fit:contain}
.media-preview{filter:blur(8px);transform:scale(1.03);opacity:1;transition:opacity .3s ease}
.media-preview-hidden{opacity:0}
.media-original{opacity:0;transition:opacity .3s ease}
.media-original-loaded{opacity:1}
```

Inside the existing reduced-motion query, disable both new transitions and retain the existing disabled Ken Burns animation:

```css
@media(prefers-reduced-motion:reduce){
  .kenburns{animation:none}
  .controls,.media-preview,.media-original{transition:none}
}
```

- [ ] **Step 5: Run focused integration, component, and mobile tests**

Run: `npm test -- tests/unit/slideshow-media.test.tsx tests/unit/progressive-image.test.tsx tests/unit/media-preload.test.ts tests/unit/soundtrack.test.ts tests/unit/slideshow-mobile.test.tsx`

Expected: every focused client test passes.

- [ ] **Step 6: Run typecheck and inspect both viewport classes**

Run: `npm run typecheck && npm run build`

Expected: client/server/tool typechecks and production builds pass. Confirm the generated CSS contains the mobile safe-area rules and the new progressive-media rules; no control dimensions change.

- [ ] **Step 7: Commit the slideshow integration**

```bash
git add src/client/App.tsx src/client/styles.css tests/unit/slideshow-media.test.tsx
git commit -m "feat: smooth slideshow media transitions"
```

### Task 5: Complete Verification and Deployment Archive

**Files:**
- Verify: complete repository
- Create outside git: `outputs/immich-baby-slideshow-fast-media.tar.gz`

- [ ] **Step 1: Run the complete verification gate**

Run: `npm run verify`

Expected: all TypeScript checks, Vitest unit/integration tests, production client/server build, and Playwright browser gate exit 0.

- [ ] **Step 2: Run dependency and source-quality checks**

Run: `npm audit --audit-level=critical && git diff --check && git status --short --branch`

Expected: zero critical vulnerabilities, no whitespace errors, and a clean `feature/immich-baby-slideshow` worktree.

- [ ] **Step 3: Inspect the production bundle for intended behavior**

Run:

```bash
rg -n "media-preview|media-original|safe-area-inset-bottom" dist/client
rg -n "FAMILY_LINK_TOKEN_HASH|IMMICH_API_KEY|SESSION_SECRET" dist/client || true
```

Expected: media CSS is present and no server secret names or values appear in the client bundle.

- [ ] **Step 4: Create and checksum a clean full-source archive**

Run:

```bash
git archive --format=tar.gz \
  --output=/Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow-fast-media.tar.gz \
  HEAD
shasum -a 256 /Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow-fast-media.tar.gz
```

Expected: the archive is created from tracked `HEAD`, excluding `.env`, `node_modules`, `dist`, statistics, and the user's soundtrack.

- [ ] **Step 5: Inspect archive contents and hand off deployment commands**

Run: `tar -tzf /Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow-fast-media.tar.gz | sed -n '1,30p'`

Expected: the archive begins with tracked deployment files such as `.dockerignore`, `.env.example`, `Dockerfile`, `compose.yaml`, docs, package manifests, source, and tests. Tell the user to extract it over `/opt/stacks/immich-baby-slideshow` and run `sudo docker compose up -d --build --force-recreate`; their untracked `.env`, soundtrack, and named statistics volume remain untouched.
