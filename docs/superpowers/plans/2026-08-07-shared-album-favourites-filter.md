# Shared Album Favourites Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict every generated slideshow playlist to favourite images and videos inside one configured Immich shared album.

**Architecture:** Add a required, startup-validated album UUID to `AppConfig`, then pass it through the playlist boundary into `ImmichPort.listFavourites(albumId)`. The Immich client will apply `isFavorite` and `albumIds` together on every paginated metadata-search request so unrelated assets never enter the application.

**Tech Stack:** TypeScript 7, Zod 4, Fastify 5, Vitest 4, Immich metadata-search API, Docker Compose/Dockge.

---

### Task 1: Validate and expose the shared album ID

**Files:**
- Modify: `tests/unit/config.test.ts`
- Modify: `tests/integration/auth.test.ts`
- Modify: `tests/integration/slideshow-routes.test.ts`
- Modify: `src/server/config.ts`

- [ ] **Step 1: Write failing configuration tests**

Declare a stable test UUID:

```ts
const albumId = "7f2a70a8-0f37-4b39-9d97-46d26d53f210";
```

Insert this property immediately after `IMMICH_API_KEY` in `validEnv`:

```ts
IMMICH_ALBUM_ID: albumId,
```

Add `immichAlbumId: albumId` immediately after `immichApiKey` in the expected normalized object and in the typed `AppConfig` fixtures in both integration test files. Then add this test:

```ts
it("requires a canonical Immich shared album UUID", () => {
  expect(parseConfig(validEnv()).immichAlbumId).toBe(albumId);
  expect(() => parseConfig(validEnv({ IMMICH_ALBUM_ID: "" }))).toThrow(/IMMICH_ALBUM_ID/);
  expect(() => parseConfig(validEnv({ IMMICH_ALBUM_ID: "baby-moments" }))).toThrow(/IMMICH_ALBUM_ID/);
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
npm test -- tests/unit/config.test.ts tests/integration/auth.test.ts tests/integration/slideshow-routes.test.ts
```

Expected: FAIL because `IMMICH_ALBUM_ID` is not parsed and `AppConfig` has no `immichAlbumId` property.

- [ ] **Step 3: Implement the minimal configuration change**

Insert this property immediately after `immichApiKey` in `AppConfig`:

```ts
immichAlbumId: string;
```

Insert this property immediately after `IMMICH_API_KEY` in `envSchema`:

```ts
IMMICH_ALBUM_ID: z.string().uuid(),
```

Insert this property immediately after `immichApiKey` in the object returned by `parseConfig`:

```ts
immichAlbumId: parsed.data.IMMICH_ALBUM_ID,
```

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run the command from Step 2.

Expected: all selected tests PASS.

- [ ] **Step 5: Commit configuration support**

```bash
git add src/server/config.ts tests/unit/config.test.ts tests/integration/auth.test.ts tests/integration/slideshow-routes.test.ts
git commit -m "feat: configure Immich shared album"
```

### Task 2: Apply both filters to every Immich search page

**Files:**
- Modify: `tests/unit/immich-client.test.ts`
- Modify: `src/server/immich/client.ts`
- Modify: `src/server/routes/playlist.ts`

- [ ] **Step 1: Write a failing paginated-query test**

Use one known album ID and assert both request bodies contain the exact compound filter:

```ts
const albumId = "7f2a70a8-0f37-4b39-9d97-46d26d53f210";
const client = new ImmichClient({
  baseUrl: "http://immich:2283",
  apiKey: "secret-key",
  pageSize: 1
});

await client.listFavourites(albumId);

expect(fetchMock).toHaveBeenCalledTimes(2);
for (const [index, call] of fetchMock.mock.calls.entries()) {
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    isFavorite: true,
    albumIds: [albumId],
    withExif: true,
    page: index + 1,
    size: 1
  });
}
```

Update other direct `listFavourites` calls in this test file to pass `albumId`.

- [ ] **Step 2: Run the Immich client test to verify RED**

Run:

```bash
npm test -- tests/unit/immich-client.test.ts
```

Expected: FAIL because `listFavourites` does not accept or send the album ID.

- [ ] **Step 3: Implement album-scoped favourites retrieval**

Replace the `ImmichPort.listFavourites` signature with:

```ts
listFavourites(albumId: string): Promise<SlideshowAsset[]>;
```

Replace the implementation signature with:

```ts
async listFavourites(albumId: string): Promise<SlideshowAsset[]> {
```

Replace the metadata-search request body expression with:

```ts
body: JSON.stringify({
  isFavorite: true,
  albumIds: [albumId],
  withExif: true,
  page,
  size: this.pageSize
})
```

Pass the configured ID at the playlist boundary:

```ts
const assets = await options.immich.listFavourites(options.config.immichAlbumId);
```

- [ ] **Step 4: Run focused and related integration tests**

Run:

```bash
npm test -- tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
```

Expected: both test files PASS and the slideshow integration mock observes the configured album ID.

- [ ] **Step 5: Commit the query change**

```bash
git add src/server/immich/client.ts src/server/routes/playlist.ts tests/unit/immich-client.test.ts tests/integration/slideshow-routes.test.ts
git commit -m "feat: filter favourites by shared album"
```

### Task 3: Update deployment guidance and portable archive

**Files:**
- Modify: `.env.example`
- Modify: `docs/DOCKGE_SETUP.md`
- Recreate: `outputs/immich-baby-slideshow.tar.gz` in the primary workspace after committing

- [ ] **Step 1: Add the required environment example**

Place the album UUID next to the other Immich settings:

```dotenv
IMMICH_URL=http://immich-server:2283
IMMICH_API_KEY=replace-with-scoped-read-only-key
IMMICH_ALBUM_ID=7f2a70a8-0f37-4b39-9d97-46d26d53f210
```

- [ ] **Step 2: Update Dockge instructions**

Document all of the following explicitly:

```markdown
Create the API key under a user who is a member of the shared album and grant only
`asset.read`, `asset.view`, and `asset.download`. Open the album in Immich and copy
its UUID from the URL into `IMMICH_ALBUM_ID`. The slideshow selects only assets that
are both favourites and members of that album.
```

- [ ] **Step 3: Run final verification**

Run:

```bash
npm run verify
npm audit --audit-level=critical
SLIDESHOW_ENV_FILE=.env.example docker compose --env-file .env.example config --quiet
git diff --check
```

Expected: 0 failures, 0 critical vulnerabilities, valid Compose configuration, and no whitespace errors.

- [ ] **Step 4: Commit deployment documentation**

```bash
git add .env.example docs/DOCKGE_SETUP.md
git commit -m "docs: configure shared album deployment"
```

- [ ] **Step 5: Regenerate and inspect the Linux archive**

From the primary workspace, archive the feature-branch HEAD without `.git`, `.env`, dependencies, or build output:

```bash
mkdir -p outputs
git -C /Users/nicoyip/.config/superpowers/worktrees/i/immich-baby-slideshow archive \
  --format=tar.gz \
  --prefix=immich-baby-slideshow/ \
  --output=/Users/nicoyip/Documents/Codex/2026-08-07/i/outputs/immich-baby-slideshow.tar.gz \
  HEAD
shasum -a 256 outputs/immich-baby-slideshow.tar.gz
tar -tzf outputs/immich-baby-slideshow.tar.gz | grep -E 'IMMICH|env.example|DOCKGE_SETUP|client.ts'
```

Expected: checksum is printed and the archive contains `.env.example`, the Dockge guide, and the updated Immich client source.
