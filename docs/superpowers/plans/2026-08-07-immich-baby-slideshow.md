# Immich Baby Favourites Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockge-deployable, password-protected dreamy slideshow of favourite Immich photos and videos, with baby-age captions, music, consent-gated minimal GA4, and private local display statistics.

**Architecture:** A single Fastify TypeScript service serves a Vite-built React interface, authenticates family and admin sessions, queries Immich with a server-only scoped key, and proxies media. SQLite persists anonymous daily asset-display aggregates; Cloudflare Tunnel exposes only this service, which joins Immich's existing private Docker network.

**Tech Stack:** Node.js 22, TypeScript, Fastify, React, Vite, better-sqlite3, Node `crypto.scrypt`, Vitest, Testing Library, Playwright, Docker Compose/Dockge

---

## File Map

- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`: build and test toolchain.
- `src/server/index.ts`: process entry point and graceful shutdown.
- `src/server/app.ts`: Fastify composition root; registers routes and shared services.
- `src/server/config.ts`: validated environment configuration.
- `src/server/security/password.ts`: scrypt password hashing and verification.
- `src/server/security/session.ts`: signed, expiring family/admin session tokens.
- `src/server/security/origin.ts`: origin validation for state-changing requests.
- `src/server/immich/client.ts`: all Immich API calls and response normalization.
- `src/server/immich/types.ts`: narrow Immich wire types and internal asset model.
- `src/server/slideshow/age.ts`: calendar-aware baby-age labels.
- `src/server/slideshow/shuffle.ts`: unbiased playlist shuffle.
- `src/server/slideshow/impressions.ts`: single-use impression tokens.
- `src/server/stats/database.ts`: SQLite schema, counts, reports, reset, and token cleanup.
- `src/server/routes/auth.ts`, `playlist.ts`, `media.ts`, `stats.ts`, `health.ts`: HTTP boundaries.
- `src/server/routes/public-config.ts`: safe browser configuration only.
- `src/client/main.tsx`, `App.tsx`: browser entry and route selection.
- `src/client/api.ts`: typed calls to slideshow/admin endpoints.
- `src/client/player/*`: slideshow state, media stage, soundtrack, captions, and controls.
- `src/client/auth/*`: family and admin login forms.
- `src/client/analytics/consent.ts`, `ga4.ts`, `ConsentPrompt.tsx`: consent-gated GA4.
- `src/client/admin/AdminDashboard.tsx`: ranked local statistics UI.
- `src/client/styles.css`: dreamy-home-movie responsive styling.
- `tests/unit/*`, `tests/integration/*`, `tests/browser/*`: unit, service-boundary, and end-to-end tests.
- `Dockerfile`, `compose.yaml`, `.env.example`, `music/.gitkeep`, `docs/DOCKGE_SETUP.md`: deployable Dockge stack.

## Task 1: Scaffold the TypeScript Service and Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/server/routes/health.ts`
- Test: `tests/integration/health.test.ts`

- [ ] **Step 1: Create the package manifest and install the locked dependency set**

Create these scripts: `dev:server` = `tsx watch src/server/index.ts`, `dev:client` = `vite`, `dev` = both through `concurrently`, `build` = `vite build && tsc -p tsconfig.server.json`, `start` = `node dist/server/index.js`, `typecheck` = client and server `tsc --noEmit` checks, `test` = `vitest run`, `test:browser` = `playwright test`, and `verify` = the full typecheck/test/build/browser chain. Configure Vite output as `dist/client` and server TypeScript output as `dist/server`.

Install runtime packages `fastify`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/static`, `better-sqlite3`, `react`, `react-dom`, and `zod`; install TypeScript, Vite, React plugin, Vitest, Testing Library, jsdom, Playwright, YAML parsing, concurrent development scripts, and relevant type packages as development dependencies.

Run:

```bash
npm install fastify @fastify/cookie @fastify/rate-limit @fastify/static better-sqlite3 react react-dom zod
npm install --save-dev typescript tsx vite @vitejs/plugin-react vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @playwright/test yaml concurrently @types/node @types/react @types/react-dom @types/better-sqlite3
```

Expected: `package-lock.json` is created and `npm audit` reports no unresolved critical vulnerability.

- [ ] **Step 2: Write the failing health-route test**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";

describe("GET /health", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.map((app) => app.close())));

  it("returns an uncredentialed liveness response", async () => {
    const app = await buildApp({ mode: "test" });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run the test and verify the red state**

Run: `npm test -- tests/integration/health.test.ts`

Expected: FAIL because `src/server/app.ts` does not exist.

- [ ] **Step 4: Implement the minimal app composition and process entry**

```ts
// src/server/routes/health.ts
import type { FastifyInstance } from "fastify";
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));
}

// src/server/app.ts
import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
export async function buildApp(_options: { mode: "test" | "production" }) {
  const app = Fastify({ logger: _options.mode === "production" });
  await app.register(healthRoutes);
  return app;
}

// src/server/index.ts
import { buildApp } from "./app.js";
const app = await buildApp({ mode: "production" });
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => { await app.close(); process.exit(0); });
}
```

- [ ] **Step 5: Verify health, types, and build**

Run: `npm test -- tests/integration/health.test.ts && npm run typecheck && npm run build`

Expected: one passing test, zero TypeScript errors, and server/client build output.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts src/server tests/integration/health.test.ts
git commit -m "chore: scaffold slideshow service"
```

## Task 2: Validate Configuration and Hash Passwords

**Files:**
- Create: `src/server/config.ts`
- Create: `src/server/security/password.ts`
- Create: `scripts/hash-password.ts`
- Test: `tests/unit/config.test.ts`
- Test: `tests/unit/password.test.ts`

- [ ] **Step 1: Write failing tests for strict configuration and scrypt hashes**

```ts
it("rejects a public Immich URL and malformed birth date", () => {
  expect(() => parseConfig(validEnv({ IMMICH_URL: "https://photos.example.com" }))).toThrow(/private Immich URL/);
  expect(() => parseConfig(validEnv({ BABY_BIRTH_DATE: "07-08-2025" }))).toThrow(/YYYY-MM-DD/);
});

it("round-trips a password without storing plaintext", async () => {
  const hash = await hashPassword("family secret");
  expect(hash).toMatch(/^scrypt\$/);
  expect(hash).not.toContain("family secret");
  await expect(verifyPassword("family secret", hash)).resolves.toBe(true);
  await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify missing-module failures**

Run: `npm test -- tests/unit/config.test.ts tests/unit/password.test.ts`

Expected: FAIL because configuration and password modules are absent.

- [ ] **Step 3: Implement `parseConfig` with Zod and private-network validation**

Define `AppConfig` with `immichUrl`, `immichApiKey`, `familyPasswordHash`, `adminPasswordHash`, `babyBirthDate`, `timezone`, `sessionSecret`, `publicOrigin`, `databasePath`, `soundtrackPath`, optional `ga4MeasurementId`, `photoDurationMs`, and `sessionDurationSeconds`. Accept `http://immich-server:2283`, other single-label Docker service names, RFC1918 addresses, and `.internal` names; reject public hosts so configuration cannot accidentally route Immich through the internet.

```ts
export const envSchema = z.object({
  IMMICH_URL: z.string().url(), IMMICH_API_KEY: z.string().min(20),
  FAMILY_PASSWORD_HASH: z.string().startsWith("scrypt$"),
  ADMIN_PASSWORD_HASH: z.string().startsWith("scrypt$"),
  BABY_BIRTH_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  TZ: z.string().default("Australia/Melbourne"), SESSION_SECRET: z.string().min(32),
  PUBLIC_ORIGIN: z.string().url(), DATABASE_PATH: z.string().default("/data/stats.sqlite"),
  SOUNDTRACK_PATH: z.string().default("/music/soundtrack.mp3"),
  GA4_MEASUREMENT_ID: z.string().regex(/^G-[A-Z0-9]+$/).optional(),
  PHOTO_DURATION_MS: z.coerce.number().int().min(3000).max(30000).default(7000),
  SESSION_DURATION_SECONDS: z.coerce.number().int().min(300).default(604800),
});
```

- [ ] **Step 4: Implement scrypt hashing and the CLI**

Use random 16-byte salts, `scrypt` with a 64-byte derived key, and `timingSafeEqual`. Store `scrypt$<salt-base64url>$<key-base64url>`. `npm run hash-password` prompts without echoing the password, prints only the hash, and exits nonzero for an empty value; it never accepts the password as a command-line argument.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- tests/unit/config.test.ts tests/unit/password.test.ts && npm run typecheck`

Expected: all configuration/password cases pass and TypeScript reports zero errors.

- [ ] **Step 6: Commit configuration and hashing**

```bash
git add src/server/config.ts src/server/security/password.ts scripts/hash-password.ts tests/unit
git commit -m "feat: validate secrets and hash passwords"
```

## Task 3: Implement Separate Family and Admin Sessions

**Files:**
- Create: `src/server/security/session.ts`
- Create: `src/server/security/origin.ts`
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write failing authentication-boundary tests**

Test successful family login, invalid login, rate limit after five failures in fifteen minutes, logout, expiry, CSRF origin rejection, and role isolation. The key isolation assertion is:

```ts
const familyCookie = await login(app, "/api/auth/family", "family secret");
expect((await app.inject({ url: "/api/admin/stats", headers: { cookie: familyCookie } })).statusCode).toBe(401);
const adminCookie = await login(app, "/api/auth/admin", "admin secret");
expect((await app.inject({ url: "/api/playlist", headers: { cookie: adminCookie } })).statusCode).toBe(401);
```

- [ ] **Step 2: Verify the tests fail at route registration**

Run: `npm test -- tests/integration/auth.test.ts`

Expected: FAIL with 404 responses for authentication routes.

- [ ] **Step 3: Implement signed role-specific tokens**

Use a compact payload `{ role: "family" | "admin", exp: unixSeconds, nonce: base64url }`, base64url encoding, and HMAC-SHA256 over the encoded payload. Verify signature with `timingSafeEqual`, reject the wrong role and expired tokens, and use distinct cookies `family_session` and `admin_session`.

- [ ] **Step 4: Implement routes and request protections**

Register cookie and rate-limit plugins. Add `POST /api/auth/family`, `POST /api/auth/admin`, role-specific logout routes, and status routes. Require `Origin === PUBLIC_ORIGIN` for POST/DELETE requests. Cookies use `httpOnly`, `secure`, `sameSite: "strict"`, `path: "/"`, and configured expiry.

- [ ] **Step 5: Run authentication and regression tests**

Run: `npm test -- tests/integration/auth.test.ts tests/integration/health.test.ts`

Expected: authentication cases and public health check all pass.

- [ ] **Step 6: Commit authentication**

```bash
git add src/server/security src/server/routes/auth.ts src/server/app.ts tests/integration/auth.test.ts
git commit -m "feat: isolate family and admin sessions"
```

## Task 4: Build the Immich Adapter and Favourite Search

**Files:**
- Create: `src/server/immich/types.ts`
- Create: `src/server/immich/client.ts`
- Test: `tests/unit/immich-client.test.ts`
- Test fixture: `tests/fixtures/immich-favourites.json`

- [ ] **Step 1: Write failing paginated mixed-media tests**

```ts
it("retrieves every favourite image and video without leaking wire fields", async () => {
  const assets = await client.listFavourites();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]?.body).toContain('"isFavorite":true');
  expect(assets).toEqual([
    { id: "image-1", type: "IMAGE", capturedAt: "2025-01-03T10:00:00", durationMs: null },
    { id: "video-1", type: "VIDEO", capturedAt: "2025-02-04T10:00:00", durationMs: 4200 },
  ]);
});
```

Also test timeouts, non-2xx responses, malformed JSON, unsupported asset types, and the final partial page.

- [ ] **Step 2: Verify the missing adapter fails**

Run: `npm test -- tests/unit/immich-client.test.ts`

Expected: FAIL because `ImmichClient` is undefined.

- [ ] **Step 3: Implement the narrow adapter**

POST `/api/search/metadata` with `{ isFavorite: true, withExif: true, page, size: 1000 }`, header `x-api-key`, and a ten-second abort timeout. Follow pages until fewer than 1000 items are returned. Normalize only `id`, `type`, authoritative local capture time, and duration. Define typed `ImmichUnavailableError` and `ImmichResponseError` without response bodies or internal URLs in their messages.

- [ ] **Step 4: Add adapter methods for thumbnail, image, and video playback**

Expose `fetchThumbnail(id)`, `fetchOriginal(id, range?)`, and `fetchVideoPlayback(id, range?)`. Forward only `Range` upstream and return status plus an allowlist of `content-type`, `content-length`, `content-range`, `accept-ranges`, `etag`, and `last-modified` headers.

- [ ] **Step 5: Run adapter tests**

Run: `npm test -- tests/unit/immich-client.test.ts`

Expected: pagination, normalization, timeout, error, and range tests pass.

- [ ] **Step 6: Commit the Immich boundary**

```bash
git add src/server/immich tests/unit/immich-client.test.ts tests/fixtures/immich-favourites.json
git commit -m "feat: read favourite assets from Immich"
```

## Task 5: Create Age Labels, Shuffling, and Playlists

**Files:**
- Create: `src/server/slideshow/age.ts`
- Create: `src/server/slideshow/shuffle.ts`
- Create: `src/server/slideshow/impressions.ts`
- Create: `src/server/routes/playlist.ts`
- Modify: `src/server/app.ts`
- Test: `tests/unit/age.test.ts`
- Test: `tests/unit/shuffle.test.ts`
- Test: `tests/integration/playlist.test.ts`

- [ ] **Step 1: Write failing age-boundary tests**

Cover birth day (`0 days old`), 29 days, exact month boundary, month-end clamping, 23 months, exact two years, leap-day birth, invalid capture date, and capture before birth. Expected soft labels use days before one completed calendar month, months before two completed years, then years.

- [ ] **Step 2: Write failing shuffle and playlist tests**

Inject a deterministic random function to assert Fisher–Yates swaps without asserting statistical randomness. Verify the route requires a family cookie, queries current favourites on every new playlist, returns both media types, never returns Immich URLs, and includes a unique impression token per entry.

- [ ] **Step 3: Run tests and confirm missing implementations**

Run: `npm test -- tests/unit/age.test.ts tests/unit/shuffle.test.ts tests/integration/playlist.test.ts`

Expected: FAIL because age, shuffle, token, and playlist modules are absent.

- [ ] **Step 4: Implement pure age and shuffle functions**

```ts
export type AgeLabel = string | null;
export function formatBabyAge(birthDate: string, capturedAt: string, timeZone: string): AgeLabel;
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[];
```

Use `Intl.DateTimeFormat(...).formatToParts` to obtain the capture calendar date in the configured timezone, then perform calendar comparisons without converting months to fixed day counts.

- [ ] **Step 5: Implement `POST /api/playlist`**

Return `{ playlistId, photoDurationMs, items: [{ id, type, durationMs, ageLabel, impressionToken, mediaUrl, thumbnailUrl }] }`. URLs point only to `/api/media/...`. The playlist ID uses `randomBytes(24).toString("base64url")`. Each impression token is an HMAC-signed payload containing `{ assetId, mediaType, exp, nonce }`; verification binds the submitted count to that asset, rejects tampering, and limits token lifetime to one hour. Return a typed 503 response for Immich failure and a typed empty state for zero favourites.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/unit/age.test.ts tests/unit/shuffle.test.ts tests/integration/playlist.test.ts`

Expected: all cases pass.

```bash
git add src/server/slideshow src/server/routes/playlist.ts src/server/app.ts tests
git commit -m "feat: build shuffled age-labelled playlists"
```

## Task 6: Proxy Authenticated Media with Range Support

**Files:**
- Create: `src/server/routes/media.ts`
- Create: `src/server/routes/public-config.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/media.test.ts`

- [ ] **Step 1: Write failing media-security and range tests**

Verify unauthenticated requests return 401, valid family sessions can fetch thumbnails/images/videos and `/api/soundtrack`, `Range: bytes=100-199` reaches Immich, upstream 206 and `Content-Range` are preserved, unsafe upstream headers are dropped, responses use `Cache-Control: private, max-age=300`, and errors contain neither API keys nor Immich URLs. Verify `GET /api/public-config` exposes only `{ ga4MeasurementId, photoDurationMs }` and no secret or private URL.

- [ ] **Step 2: Run the test and verify route absence**

Run: `npm test -- tests/integration/media.test.ts`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Implement the three proxy routes**

Add `GET /api/media/:id/thumbnail`, `/image`, and `/video`. Validate IDs as UUIDs or the exact opaque ID format returned by the mocked adapter, require a family session, stream the upstream body without buffering, pass range semantics, and cancel upstream fetches when clients disconnect. Add family-authenticated `GET /api/soundtrack` with range support and an allowlist of local audio MIME types. Add public `GET /api/public-config`, returning only the optional GA4 measurement ID and photo duration.

- [ ] **Step 4: Verify media behavior and regression suite**

Run: `npm test -- tests/integration/media.test.ts tests/integration/auth.test.ts tests/unit/immich-client.test.ts`

Expected: all proxy, authentication, and adapter tests pass.

- [ ] **Step 5: Commit the media proxy**

```bash
git add src/server/routes/media.ts src/server/routes/public-config.ts src/server/app.ts tests/integration/media.test.ts
git commit -m "feat: proxy private Immich media"
```

## Task 7: Persist Anonymous Display Statistics and Admin Reports

**Files:**
- Create: `src/server/stats/database.ts`
- Create: `src/server/routes/stats.ts`
- Modify: `src/server/app.ts`
- Test: `tests/unit/stats-database.test.ts`
- Test: `tests/integration/stats-routes.test.ts`

- [ ] **Step 1: Write failing database tests**

Test schema migration, one count per impression token, two different tokens incrementing the same asset, daily UTC buckets, 7/30/all-time sums, token cleanup after 24 hours, reset, and persistence after closing/reopening the database.

```sql
CREATE TABLE asset_daily_counts (
  asset_id TEXT NOT NULL, day TEXT NOT NULL, media_type TEXT NOT NULL,
  display_count INTEGER NOT NULL DEFAULT 0, last_displayed_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, day)
);
CREATE TABLE used_impressions (
  token_hash TEXT PRIMARY KEY, used_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write failing route tests**

Verify `POST /api/stats/display` requires family auth plus a valid playlist impression token, and `/api/admin/stats`, `/api/admin/stats.csv`, `/api/admin/media/:id/thumbnail`, and `DELETE /api/admin/stats` require admin auth. Verify a family cookie receives 401 for every admin endpoint and reset requires body `{ confirmation: "RESET" }`.

- [ ] **Step 3: Run tests to confirm the red state**

Run: `npm test -- tests/unit/stats-database.test.ts tests/integration/stats-routes.test.ts`

Expected: FAIL because the database and routes do not exist.

- [ ] **Step 4: Implement transactional statistics**

Use WAL mode and prepared statements. Verify the impression token signature, expiry, asset ID, and media type before accessing SQLite. Hash valid tokens with SHA-256 before storage. In one transaction, insert the token with `ON CONFLICT DO NOTHING`; only when inserted, upsert the daily asset count. Return `{ counted: true }` or `{ counted: false }`. Never persist playlist IDs, cookies, IP addresses, or user agents.

- [ ] **Step 5: Implement report, CSV, and reset routes**

Accept `period=7d|30d|all` and `type=IMAGE|VIDEO|all`. Join aggregate rows in application code with batched Immich asset lookups; unresolved items return `available: false`. Return admin thumbnail URLs that target the admin-authenticated local proxy, never the family proxy or Immich. CSV columns are exactly `asset_id,media_type,period_count,total_count,last_displayed_at` and use RFC 4180 escaping.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/unit/stats-database.test.ts tests/integration/stats-routes.test.ts`

Expected: persistence, idempotency, isolation, reports, export, and reset pass.

```bash
git add src/server/stats src/server/routes/stats.ts src/server/app.ts tests
git commit -m "feat: add private display statistics"
```

## Task 8: Build the Dreamy Slideshow Interface

**Files:**
- Create: `index.html`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/api.ts`
- Create: `src/client/auth/FamilyLogin.tsx`
- Create: `src/client/player/usePlayer.ts`
- Create: `src/client/player/MediaStage.tsx`
- Create: `src/client/player/Controls.tsx`
- Create: `src/client/player/Soundtrack.tsx`
- Create: `src/client/styles.css`
- Test: `tests/unit/player.test.tsx`
- Test: `tests/unit/family-login.test.tsx`

- [ ] **Step 1: Write failing login and player-state tests**

Test generic login errors, `Begin` creating a playlist, photo advancement after configured duration, full-duration video advancement, previous/next, pause, mute, fullscreen requests, keyboard shortcuts, control auto-hide, reduced-motion behavior, and recording an impression only after two continuous visible seconds.

- [ ] **Step 2: Run component tests to establish the red state**

Run: `npm test -- tests/unit/family-login.test.tsx tests/unit/player.test.tsx`

Expected: FAIL because client components are absent.

- [ ] **Step 3: Implement typed browser API calls**

Expose `loginFamily`, `logoutFamily`, `createPlaylist`, `recordDisplay`, `loginAdmin`, `fetchStats`, `exportStatsUrl`, and `resetStats`. All state-changing calls send JSON, credentials, and an `Origin`-compatible same-origin request; errors map only known public error codes to friendly copy.

- [ ] **Step 4: Implement the playback state machine**

Represent phases as a discriminated union: `locked`, `ready`, `loading`, `playing`, `paused`, `empty`, and `error`. Cancel photo and impression timers on every item change. Pause/fade soundtrack for videos with audio, restore it after video end, preserve mute state for the browser session, and reshuffle at end while preventing an immediate repeat.

- [ ] **Step 5: Implement the visual layer**

Use two stacked media layers for crossfades, CSS keyframes for restrained pan/zoom, a near-black background, a locally available serif font stack, warm small age labels, 44px minimum touch targets, visible focus rings, and `prefers-reduced-motion` overrides that remove pan/zoom and shorten fades. No remote fonts, images, or effects are allowed.

- [ ] **Step 6: Verify components and production bundle**

Run: `npm test -- tests/unit/family-login.test.tsx tests/unit/player.test.tsx && npm run build`

Expected: tests pass and Vite emits the production browser bundle.

- [ ] **Step 7: Commit the slideshow UI**

```bash
git add index.html src/client tests/unit/family-login.test.tsx tests/unit/player.test.tsx
git commit -m "feat: add dreamy mixed-media slideshow"
```

## Task 9: Add Consent-Gated GA4 and the Admin Dashboard

**Files:**
- Create: `src/client/analytics/consent.ts`
- Create: `src/client/analytics/ga4.ts`
- Create: `src/client/analytics/ConsentPrompt.tsx`
- Create: `src/client/auth/AdminLogin.tsx`
- Create: `src/client/admin/AdminDashboard.tsx`
- Modify: `src/client/App.tsx`
- Test: `tests/unit/analytics.test.tsx`
- Test: `tests/unit/admin-dashboard.test.tsx`

- [ ] **Step 1: Write failing consent tests**

Verify no Google script or request exists before opt-in, refusal persists, acceptance injects exactly `https://www.googletagmanager.com/gtag/js?id=<measurement-id>`, only `page_view` and `slideshow_started` are exposed by the analytics wrapper, event parameters reject keys matching `asset`, `file`, `caption`, `date`, `age`, or `password`, and withdrawal removes site-controlled `_ga*` cookies.

- [ ] **Step 2: Write failing admin-dashboard tests**

Test separate admin login, period/type filters, ranking rows, thumbnails through the local proxy, unavailable placeholders, CSV link, reset confirmation text, and logout. Assert that family authentication alone never renders the dashboard.

- [ ] **Step 3: Verify missing components fail**

Run: `npm test -- tests/unit/analytics.test.tsx tests/unit/admin-dashboard.test.tsx`

Expected: FAIL because analytics and admin components do not exist.

- [ ] **Step 4: Implement analytics with an explicit allowlist**

```ts
type AnalyticsEvent = "page_view" | "slideshow_started";
export function track(event: AnalyticsEvent): void {
  if (readConsent() !== "granted" || !window.gtag) return;
  window.gtag("event", event);
}
```

Do not accept arbitrary parameter objects. Load the Google tag only after granted consent and only when the server-injected public configuration contains a syntactically valid GA4 measurement ID. Set advertising-related consent fields to denied.

- [ ] **Step 5: Implement `/admin` UI and destructive confirmation**

Route by `window.location.pathname`. Render thumbnail, type, selected-period count, total, and last-shown time. Disable reset until the owner types `RESET`; refresh the report after success. Use the separate admin status/login/logout endpoints only.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/unit/analytics.test.tsx tests/unit/admin-dashboard.test.tsx && npm run build`

Expected: consent and admin tests pass; bundle contains no GA measurement ID when unconfigured.

```bash
git add src/client/analytics src/client/admin src/client/auth/AdminLogin.tsx src/client/App.tsx tests/unit
git commit -m "feat: add consented traffic and owner reports"
```

## Task 10: Harden Errors, Headers, Logging, and Static Serving

**Files:**
- Create: `src/server/security/headers.ts`
- Create: `src/server/errors.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`
- Test: `tests/integration/security.test.ts`

- [ ] **Step 1: Write failing security-response tests**

Assert CSP permits only self plus consented `https://www.googletagmanager.com` scripts and `https://www.google-analytics.com` connections, framing is denied, MIME sniffing is disabled, referrer policy is `no-referrer`, media caching is private, SPA fallback does not shadow `/api`, unknown API errors return `{ code: "INTERNAL_ERROR" }`, and captured logs exclude all configured secrets and private URLs.

- [ ] **Step 2: Run tests and verify missing headers/error mapping**

Run: `npm test -- tests/integration/security.test.ts`

Expected: FAIL on missing CSP and public error mapping.

- [ ] **Step 3: Implement centralized public errors and redaction**

Map authentication to 401, rate limiting to 429, validation to 400, missing favourites to 200 typed empty payload, and Immich unavailability to 503 `{ code: "MEMORIES_RESTING", message: "Our memories are resting—please try again shortly." }`. Configure Fastify redaction paths for authorization, cookies, submitted passwords, and API keys; do not log request bodies.

- [ ] **Step 4: Register security headers and production assets**

Serve Vite output with immutable caching for hashed assets and no-cache for `index.html`. Generate CSP from the configured GA4 state: omit Google origins entirely when GA4 is disabled. Add a request ID without including it in browser-visible stack traces.

- [ ] **Step 5: Run complete non-browser verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: zero type errors, all unit/integration tests pass, and build succeeds.

- [ ] **Step 6: Commit hardening**

```bash
git add src/server tests/integration/security.test.ts
git commit -m "feat: harden public slideshow boundary"
```

## Task 11: Package the Dockge Stack

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `.env.example`
- Create: `music/.gitkeep`
- Create: `docs/DOCKGE_SETUP.md`
- Modify: `.gitignore`
- Test: `tests/deployment/compose.test.ts`

- [ ] **Step 1: Write the failing deployment-policy test**

Parse Compose YAML and assert one slideshow service, non-root runtime user, read-only root filesystem, `/tmp` tmpfs, persistent `/data`, read-only `/music`, health check, `unless-stopped`, resource limits, bounded JSON logs, no host Docker socket, no privileged mode, no published Immich port, a loopback-only slideshow port by default, an internal edge network, and one external Immich network named by `IMMICH_DOCKER_NETWORK`.

- [ ] **Step 2: Run the deployment test and verify files are absent**

Run: `npm test -- tests/deployment/compose.test.ts`

Expected: FAIL because `compose.yaml` does not exist.

- [ ] **Step 3: Create the multi-stage image**

Use a Node 22 build stage with `npm ci`, tests/build in CI rather than image build, and `npm prune --omit=dev`. Copy production output and dependencies into a slim Node 22 runtime, create an unprivileged UID/GID 10001, expose 3000, and run `node dist/server/index.js`.

- [ ] **Step 4: Create Dockge-compatible Compose configuration**

```yaml
services:
  baby-slideshow:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "${SLIDESHOW_BIND_ADDRESS:-127.0.0.1}:${SLIDESHOW_PORT:-3080}:3000"
    volumes:
      - slideshow_data:/data
      - ./music:/music:ro
    networks:
      - slideshow_edge
      - immich_private
    read_only: true
    tmpfs: [/tmp]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
networks:
  slideshow_edge:
    internal: true
  immich_private:
    external: true
    name: ${IMMICH_DOCKER_NETWORK}
volumes:
  slideshow_data:
```

- [ ] **Step 5: Write the Dockge setup guide**

Document: create scoped Immich read-only API key; identify the actual Immich network with Dockge; generate family/admin hashes and session secret; copy `.env.example` to `.env`; place a licensed/user-owned audio file in `music/`; deploy in Dockge; verify health; point a host-installed Cloudflare Tunnel to `http://127.0.0.1:3080`, or attach a containerized tunnel to the generated `slideshow_edge` network and target `http://baby-slideshow:3000`; verify Immich is not publicly routed; configure optional GA4 measurement ID and consent settings; update by rebuilding in Dockge; back up only the `/data` volume and local music.

- [ ] **Step 6: Validate configuration and test policy**

Run: `docker compose --env-file .env.example config --quiet && npm test -- tests/deployment/compose.test.ts`

Expected: Compose validation exits zero and all deployment policy assertions pass.

- [ ] **Step 7: Commit deployment artifacts**

```bash
git add Dockerfile .dockerignore compose.yaml .env.example music/.gitkeep docs/DOCKGE_SETUP.md .gitignore tests/deployment
git commit -m "feat: package Dockge deployment"
```

## Task 12: Add Browser Journeys and Final Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/browser/fixtures.ts`
- Create: `tests/browser/family-slideshow.spec.ts`
- Create: `tests/browser/admin-analytics.spec.ts`
- Create: `tests/fixtures/mock-immich-server.ts`
- Create: `tests/fixtures/test-stack.ts`
- Modify: `package.json`
- Modify: `docs/DOCKGE_SETUP.md`

- [ ] **Step 1: Write the complete browser journeys**

Family journey: unauthenticated media denial, wrong/correct password, analytics refusal, Begin, deterministic mixed playlist, age label, two-second count, photo auto-advance, video playback, soundtrack pause/resume, mute, keyboard controls, fullscreen stub, one failed asset skipped, session expiry, and logout.

Admin journey: family/admin isolation, separate login, ranked 7-day/30-day/all-time report, image/video filters, unavailable asset, CSV download content, typed reset confirmation, and logout.

GA4 journey: intercept Google endpoints; assert zero requests before consent and after refusal; after acceptance, assert only approved event names and reject the test if request data contains fixture asset IDs, filenames, dates, captions, or age labels.

- [ ] **Step 2: Run browser tests and capture the red state**

Run: `npm run test:browser`

Expected: FAIL because Playwright has no deterministic mock Immich/test-stack process yet; no test may use the real Immich instance.

- [ ] **Step 3: Implement the deterministic browser-test stack**

Implement `mock-immich-server.ts` with fixed favourite-search pages, one image, one video with range responses, one unavailable asset, and batched asset-detail responses. Implement `test-stack.ts` to start the mock on port 3901 and the application on port 3900 using test-only hashes, a temporary SQLite path, and `IMMICH_URL=http://127.0.0.1:3901`; close both on termination. Configure Playwright `webServer.command` as `tsx tests/fixtures/test-stack.ts`, `url` as `http://127.0.0.1:3900/health`, and `reuseExistingServer: false`.

- [ ] **Step 4: Run browser journeys to verify the green state**

Run: `npm run test:browser`

Expected: all family, admin, media, statistics, and analytics-consent journeys pass against fixtures.

- [ ] **Step 5: Run the full verification gate**

Run:

```bash
npm ci
npm run typecheck
npm test -- --coverage
npm run build
npm run test:browser
docker compose --env-file .env.example config --quiet
docker build -t immich-baby-slideshow:verify .
```

Expected: dependency install succeeds; zero type errors; all unit/integration/deployment tests pass; coverage meets configured thresholds; production build succeeds; all browser journeys pass; Compose validates; Docker image builds.

- [ ] **Step 6: Perform secret and dependency scans**

Run:

```bash
git grep -nE "(IMMICH_API_KEY=.{10,}|SESSION_SECRET=.{10,}|PASSWORD_HASH=scrypt\\$)" -- ':!.env.example'
npm audit --audit-level=high
```

Expected: `git grep` returns no matches and `npm audit` reports no unresolved high or critical vulnerability.

- [ ] **Step 7: Update the guide with verified outputs and commit**

Record the tested Node/Docker versions and exact verification commands in `docs/DOCKGE_SETUP.md`, without credentials, hostnames, or private asset details.

```bash
git add playwright.config.ts tests/browser tests/fixtures package.json package-lock.json docs/DOCKGE_SETUP.md
git commit -m "test: verify slideshow end to end"
```

## Final Manual Acceptance in the Owner's Environment

- [ ] Import or update the stack in Dockge with the real private values.
- [ ] Confirm the container is healthy and reaches Immich only over the existing external Docker network.
- [ ] Confirm Cloudflare Tunnel exposes the slideshow hostname and no Immich hostname or port.
- [ ] Confirm a newly favourited photo and video enter a new shuffled playlist, and an unfavourited item leaves it.
- [ ] Confirm birth-date labels against two known capture dates.
- [ ] Confirm music starts only after `Begin`, mute is obvious, and video audio pauses/fades the soundtrack.
- [ ] Confirm a displayed asset appears in `/admin` after two seconds and is not counted twice after a retry.
- [ ] Confirm the family password cannot open `/admin` and the admin password cannot open the slideshow.
- [ ] Confirm no Google request occurs after analytics refusal; after acceptance, inspect GA4 DebugView for only page view and slideshow-start traffic.
- [ ] Confirm no API key, private Immich URL, filename, baby age, or asset ID appears in public HTML, browser-visible media URLs, GA4 requests, or logs.
