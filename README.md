# Immich Baby Slideshow

A private family slideshow built from liked photos and videos in an Immich shared album, with baby age labels, music, shared favourite moments, and a separate admin dashboard.

## Features

- Shuffled photos, videos, and Live Photos, with thumbnail previews and next-slide preloading.
- Playback controls, mobile swipe navigation, fullscreen, and recovery from failed or stalled videos.
- Background music with volume ducking for video playback.
- Baby age at the time each moment was captured, using the configured birth date and timezone.
- Double-tap or double-click to save a shared favourite, with a heart animation and persistent liked indicator.
- Admin favourites preview/removal, display statistics, date/media filters, and CSV export.
- English, Simplified Chinese, and Traditional Chinese. Browser language is detected automatically; manual choices are remembered on that browser.
- Separate family and admin passwords, plus an optional private family sign-in link.
- Optional Google Analytics, loaded only after visitor consent.

The release version appears on the admin dashboard only.

## How photos are selected

The slideshow includes assets from the configured shared Immich album that have at least one **asset-level Like** from any user. Liking the album itself does not select every photo. Start a new slideshow to load updated selections.

Slideshow favourites are a separate shared collection stored by this app. Saving or removing one does not change Immich likes or delete the original media. Favourites-only playback is not currently implemented.

## Requirements

- An existing Immich instance and shared album.
- Docker with Docker Compose for hosting; Dockge is also supported.
- Node.js 22.13 or newer and npm for password generation, local builds, and tests.
- A private network connection to Immich and an HTTPS reverse proxy or tunnel for public access.

## Setup

1. Install dependencies and create your configuration:

   ```bash
   npm ci
   cp .env.example .env
   mkdir -p music
   ```

2. Create an Immich API key for a user with access to the shared album. Grant `album.read`, `activity.read`, `asset.read`, `asset.view`, and `asset.download`. Set the private Immich URL, API key, and album UUID in `.env`.

3. Generate separate family and admin password hashes, running this command once for each:

   ```bash
   npm run hash-password
   ```

   Enter passwords at the interactive prompt. Copy the resulting hashes to `.env`, keeping their single quotes so Docker Compose preserves the `$` characters.

4. Set the birth date, timezone, public HTTPS origin, existing Immich Docker network, and a random session secret of at least 32 characters. You can generate a secret with:

   ```bash
   openssl rand -hex 32
   ```

5. For music, put an MP3 you own or have permission to use at `music/soundtrack.mp3`.

6. Build and start:

   ```bash
   docker compose up -d --build
   docker compose ps
   curl -fsS http://127.0.0.1:3080/health
   ```

   A successful health response is `{"status":"ok"}`. Configure your HTTPS proxy/tunnel to forward to the app, then open the public URL for family access or `/admin` for the owner dashboard.

See [Dockge setup](docs/DOCKGE_SETUP.md) for network/proxy configuration, private family links, and operational details. Keep `.env` and private family links out of source control.

## Configuration

Use [.env.example](.env.example) as the complete template.

| Variable | Purpose |
| --- | --- |
| `IMMICH_URL` | Private Immich origin, such as `http://immich-server:2283`. |
| `IMMICH_API_KEY` | API key for the album-accessible account. |
| `IMMICH_ALBUM_ID` | Shared album UUID. |
| `FAMILY_PASSWORD_HASH` / `ADMIN_PASSWORD_HASH` | Separate scrypt hashes from the password tool. |
| `FAMILY_LINK_TOKEN_HASH` | Optional private family-link hash; see the Dockge guide. |
| `BABY_BIRTH_DATE` / `TZ` | Birth date (`YYYY-MM-DD`) and timezone used for age labels. |
| `SESSION_SECRET` | Random secret of at least 32 characters. |
| `PUBLIC_ORIGIN` | Public origin without a path, query, or fragment. |
| `PHOTO_DURATION_MS` | Photo duration, 3,000–30,000 ms; default 7,000. |
| `SESSION_DURATION_SECONDS` | Password-session lifetime; default seven days. |
| `GA4_MEASUREMENT_ID` | Optional `G-…` ID; blank disables GA and its consent prompt. |
| `DATABASE_PATH` | SQLite path; default `/data/stats.sqlite`. |
| `SOUNDTRACK_PATH` | MP3 path; default `/music/soundtrack.mp3`. |
| `TRUSTED_PROXY_CIDRS` | Comma-separated immediate proxy IPs/CIDRs, if needed. |
| `IMMICH_DOCKER_NETWORK` | Existing external Docker network containing Immich. |
| `SLIDESHOW_BIND_ADDRESS` / `SLIDESHOW_PORT` | Host binding; defaults to `127.0.0.1:3080`. |

## Use and administration

Choose **Begin the journey** to start playback. Swipe on mobile or use previous/next buttons. Double-tap a moment or press its heart to save it for the family. The language selector offers English, 简体中文, and 繁體中文 without restarting the current slide.

Open `/admin` with the admin password to view display counts or shared favourites. Removing a favourite only removes its saved entry. Resetting statistics preserves favourites. Use **Refresh** in favourites to fetch changes from other viewers.

## Build and test

```bash
npm ci
npx playwright install chromium
npm run verify
```

Verification runs TypeScript checks, unit/integration tests, the production build, and browser tests. Browser tests use mocked API/media fixtures rather than private family media. Set `PLAYWRIGHT_BROWSERS_PATH` if using a custom browser installation directory.

Individual commands are `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`. Build before running browser tests. `npm start` runs the production server using configuration already supplied in the process environment; it does not automatically load `.env`.

## Deployment and backups

For a configured installation, rebuild through Dockge or run `docker compose up -d --build` from the stack directory.

The optional [SSH deployment script](scripts/deploy.sh) stages the working tree with rsync, then uses sudo to update and rebuild the remote stack:

```bash
DEPLOY_SERVER=user@your-server \
DEPLOY_STACK_DIR=/opt/stacks/immich-baby-slideshow \
npm run deploy
```

Review the script's defaults before running it. It needs SSH key access, rsync, and remote sudo access. It deploys the current working tree, including uncommitted files, while preserving the server's `.env` and `music/`. It does not create a backup automatically.

Back up the persistent `slideshow_data` Docker volume, `.env`, and `music/` before updates. The volume contains SQLite display statistics and shared favourites. Use a SQLite-consistent backup or stop the app while copying the volume. Keep backups private. Immich remains responsible for original media and its own backups. Avoid `docker compose down -v` unless you intend to remove the app's stored data.

## Troubleshooting

- **No memories:** check the album UUID, API permissions, and asset-level Likes in Immich.
- **Cannot reach Immich:** verify the private URL and external Docker network name.
- **Login or requests fail behind a proxy:** check `PUBLIC_ORIGIN`, HTTPS routing, and the immediate trusted proxy configuration.
- **No analytics:** confirm the GA4 ID is configured and analytics consent was granted; browser blockers may prevent collection.
- **Old interface after an update:** reload the page and check the admin version label.
- **Container fails to start:** inspect `docker compose logs --tail=100 baby-slideshow` for configuration or connectivity errors.
