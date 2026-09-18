# Shared favourites implementation plan

**Goal:** Save shared favourites by double-tap and manage them in admin.
**Architecture:** Existing SQLite connection gains a favourites table. Dedicated routes expose idempotent family saves and admin listing/removal. Client components handle gesture recognition, feedback, and admin management independently of slideshow playback.
**Tech stack:** React, TypeScript, Fastify, SQLite, Vitest, Playwright.

- [x] Backend: add failing database and integration tests; implement favourites methods on StatsDatabase, new favourites routes, and protected admin image/video previews. POST /api/favourites body {assetId}; response {saved:true,created:boolean}. GET /api/admin/favourites returns {items:[{assetId,mediaType,savedAt,thumbnailUrl,mediaUrl}]}; DELETE /api/admin/favourites/:id returns {success:true}. Validate saves through Immich album membership. Existing stats reset preserves favourites.
- [x] Client: add typed API calls and a reusable double-tap recognizer; test motion, timing, multitouch and cross-slide rejection. Hook into existing pointer handlers without changing swipe navigation. Add accessible save action and asynchronous status feedback with retry.
- [x] Admin: add separate Favourites view with loading/empty/error/retry states, photo/video preview, and removal. Keep stats view and controls intact. Cover failed deletion and successful removal in tests.
- [x] Verification: run npm run verify, inspect mobile/desktop with a browser fixture, review the diff, and bump version to 0.2.0. Do not deploy before successful verification.

Verified: 245 unit/integration tests, 4 browser tests, TypeScript checks and production build pass. Spec and code-quality reviews completed; navigation/save race fixed and covered. Mobile and desktop screenshots inspected. No deployment performed.

Like-feedback follow-up verified: animated success heart, ring and sparkles; pending outline pulse; persistent Liked indicator; shared state in new playlists; repeated animation; reduced-motion mode. Deferred save completion after navigation retains the correct liked state.
