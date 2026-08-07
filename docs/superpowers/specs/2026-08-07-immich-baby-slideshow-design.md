# Immich Baby Favourites Slideshow — Design Specification

Date: 2026-08-07
Status: Approved design, awaiting written-spec review

## Purpose

Build a password-protected website that presents the owner's favourite Immich photos and videos as a dreamy home movie. The site will be publicly reachable through Cloudflare Tunnel, while Immich itself remains private. It will run as a Dockge-managed Docker Compose stack alongside the existing Immich installation.

## Goals

- Show the current set of assets marked as favourites by the configured Immich user.
- Include both photos and videos.
- Produce a fresh shuffled sequence for each newly started visitor session.
- Present the media as a calm, fullscreen home movie with gentle motion, fades, locally hosted music, and unobtrusive age captions.
- Protect access with one shared family password.
- Keep the Immich API key, Immich address, media URLs, and internal errors out of the browser.
- Make deployment and routine configuration straightforward in Dockge.
- Measure basic consented traffic with GA4 while keeping per-photo viewing statistics local.

## Non-goals

- Editing favourites, metadata, or albums from the slideshow.
- Separate visitor accounts, invitations, password recovery, or administration screens.
- Permanently exporting or duplicating the Immich library.
- Public discovery, social sharing, comments, downloads, advertising analytics, visitor profiling, or cross-site tracking.
- Face recognition or automatic identification of the baby.

## System Architecture

The solution is one full-stack slideshow service running in its own container. Cloudflare Tunnel exposes only this service. The service joins the existing private Immich Docker network and communicates with Immich through its internal service address.

The browser communicates only with the slideshow service. The service owns authentication, queries Immich, constructs shuffled playlists, calculates age labels, and proxies media. The Immich API key never reaches browser JavaScript, HTML, URLs, logs, or client-visible errors.

The service uses a narrowly scoped Immich API key. It needs read access sufficient to search assets and retrieve thumbnails, image content, and video playback content. It must not receive write, delete, administration, or user-management permissions.

## Components and Boundaries

### Web interface

Responsibilities:

- Render the password screen and the `Begin` interaction.
- Render the fullscreen photo/video player.
- Preload only the next small number of media items.
- Provide previous, pause/play, next, fullscreen, and prominent mute/unmute controls.
- Hide controls after inactivity and reveal them on pointer, touch, or keyboard activity.
- Apply the dreamy-home-movie visual treatment without altering source files.

The interface receives an opaque session and slideshow-safe asset descriptions. It does not receive the Immich API key or private Immich URLs.

### Authentication service

Responsibilities:

- Compare the submitted family password with a configured password hash.
- Rate-limit failed attempts by IP and session.
- Issue a signed, secure, HTTP-only, same-site session cookie after successful login.
- Expire sessions after a configurable interval, defaulting to seven days.
- Support logout and reject expired or invalid sessions.

### Immich adapter

Responsibilities:

- Call the configured internal Immich URL with the scoped API key.
- Retrieve all pages of current favourite assets.
- Support image and video asset types.
- Normalize Immich responses into a small internal asset model.
- Fetch or stream thumbnails, display images, and video playback content.
- Apply timeouts and return typed failures without leaking internal details.

All Immich-specific endpoint and response handling stays inside this adapter so future API changes do not spread through the application.

### Playlist service

Responsibilities:

- Build a fresh list when a visitor presses `Begin` or explicitly reshuffles.
- Shuffle the complete retrieved favourite set with an unbiased Fisher–Yates shuffle.
- Avoid mutating Immich data or storing playlist order permanently.
- Preserve one session's order during previous/next navigation.

A normal page refresh may resume the existing authenticated session but starts a fresh playlist when the experience begins again.

### Age-label service

Responsibilities:

- Use the asset capture timestamp supplied by Immich rather than its upload timestamp.
- Calculate age in the configured home timezone from the configured birth date.
- Display a soft label such as `3 months old`, using the largest appropriate unit.
- Use days before one month, months before two years, and years thereafter.
- Omit the label when the capture date is missing, invalid, or earlier than the birth date.

The precise calculation uses calendar differences, not a fixed number of days per month.

### Media proxy

Responsibilities:

- Authorize every media request using the slideshow session.
- Request content from Immich using the server-side API key.
- Support byte-range requests required for seeking and efficient video playback.
- Preserve safe content type, content length, range, and cache headers.
- Permit short-lived private browser caching but no shared public caching.
- Never expose the upstream Immich URL or credential.

### Analytics services

The browser integration with Google Analytics 4 is limited to consented `page_view` and `slideshow_started` events plus GA4's general device category. The Google tag does not load and no GA4 request is sent until the visitor explicitly selects `Allow analytics`. The equally prominent `No thanks` choice continues without analytics. The choice is stored locally and can be changed later.

The application must not send GA4 any Immich asset ID, derived asset hash, filename, caption, date, baby age, password event, visitor-supplied text, or other library metadata. Advertising storage, advertising user data, and advertising personalization remain denied. GA4 enhanced measurement and advertising integrations are out of scope.

A separate local statistics service records a display after an asset has remained visibly active for at least two continuous seconds. Each playlist entry receives a random, single-use impression token; a transactional uniqueness check prevents retries from counting it twice. A persistent SQLite database stores daily aggregate counts by Immich asset ID, last-displayed time, and short-lived used impression tokens that are purged after 24 hours. It stores no media, filenames, captions, baby ages, or visitor identities. Total, 7-day, and 30-day counts are derived from the daily aggregates.

### Admin interface

The `/admin` area uses a separate configured password hash and separate secure session cookie from the family slideshow login. A family session never grants admin access.

The dashboard resolves asset IDs against Immich at view time and displays ranked thumbnails, media type, total displays, and counts for the last 7 and 30 days. It supports photo/video filtering, CSV export, and a confirmed statistics reset. Deleted assets or assets no longer marked as favourites retain their historical count but appear as unavailable until their statistics are reset.

## User Experience

### Entry

Visitors see a quiet cover screen with a password field. A successful password submission reveals a `Begin` action. The explicit click or tap on `Begin` satisfies browser autoplay policies and starts both the slideshow and locally hosted soundtrack.

Authentication errors remain generic. The page does not reveal whether Immich is reachable or how the system is configured.

### Playback

- Photos remain visible for seven seconds by default.
- Photos receive subtle pan/zoom movement and crossfade transitions. Motion respects the browser's reduced-motion preference.
- Videos play for their full duration and use normal browser playback controls only when explicitly requested; the slideshow's minimal controls remain primary.
- Background music fades down or pauses when a video contains audio and fades back in afterward.
- The prominent mute control affects all site audio. Its state persists for the browser session.
- Videos that are themselves muted do not unnecessarily interrupt the soundtrack.
- At the end of the shuffled list, playback reshuffles the complete current favourites set and continues, avoiding an immediate repeat when more than one asset exists.
- Keyboard controls support space for pause/play, arrow keys for navigation, `m` for mute, and `f` for fullscreen.

### Visual direction

The selected direction is `Dreamy home movie`:

- Edge-to-edge imagery on a near-black background.
- Slow, restrained camera movement and soft crossfades.
- Optional subtle light textures implemented locally, without third-party requests.
- Small, warm, serif age captions with adequate contrast.
- Controls that are readable, touch-friendly, and unobtrusive when idle.
- Responsive layouts for phones, tablets, laptops, and televisions.

The site must not use third-party fonts, unapproved trackers, hosted effects, or remote image assets in production.

The sole permitted third-party browser script is the consent-gated Google tag when a GA4 measurement ID is configured. Without a measurement ID, the analytics choice is hidden and the site performs no third-party requests.

### Analytics consent

On the first eligible visit, a small privacy choice offers `Allow analytics` and `No thanks`. Analytics defaults to denied. The Google tag is loaded only after opt-in, and consent can be withdrawn from an accessible privacy control. Withdrawing consent prevents future GA4 loading and clears analytics storage controlled by the site where technically possible. Declining analytics does not affect authentication, slideshow playback, local aggregate display counting, or any other feature.

### Owner statistics

The owner signs into `/admin` with the separate admin password. The main view ranks thumbnails by display count and can switch between 7 days, 30 days, and all time. CSV export contains the asset ID, media type, selected-period count, total count, and last-displayed timestamp; it excludes filenames, captions, baby age, and media URLs.

## Data Flow

1. A visitor reaches the slideshow hostname through Cloudflare Tunnel.
2. The slideshow service returns the password screen.
3. The visitor submits the family password over HTTPS.
4. The authentication service verifies the hash and creates a secure session cookie.
5. The visitor presses `Begin`.
6. The server-side Immich adapter requests all current favourites, following pagination.
7. The playlist service filters supported images and videos, shuffles the result, and returns slideshow-safe metadata.
8. The browser requests each media item through authenticated slideshow endpoints.
9. The media proxy obtains the content privately from Immich and streams it to the browser.
10. After an asset remains visible for two continuous seconds, the browser sends an authenticated display event and the local statistics service records it idempotently.
11. If the visitor opted into analytics, the browser sends only the approved GA4 traffic events; otherwise it sends no request to Google.
12. A later `Begin` or reshuffle repeats the favourites query so additions and removals are reflected.

## Failure Handling

- If Immich is unavailable or times out, show: `Our memories are resting—please try again shortly.`
- If there are no favourites, show a gentle empty state explaining that favourite items should be selected in Immich.
- If a single photo fails, retry once and then skip it.
- If a video fails, retry once, display its thumbnail briefly when available, and continue.
- If several consecutive items fail, pause automatic advancement and offer `Try again` to prevent an endless failure loop.
- If an authentication session expires during playback, stop requesting media and return to the password screen without displaying internal errors.
- If SQLite is temporarily unavailable, slideshow playback continues and the display count is omitted; analytics failure must never block the experience.
- If GA4 cannot load, the site continues normally without retry loops or visible errors.
- If an admin thumbnail can no longer be resolved, show an unavailable placeholder while preserving the historical count.
- Log structured error categories and request identifiers, but never passwords, password hashes, API keys, cookie values, private media URLs, filenames, or personal metadata.

## Security and Privacy

- Store the family password only as a modern password hash; never store or compare plaintext at runtime configuration boundaries beyond the initial submitted value.
- Store the Immich API key and session secret as container configuration that is not committed to source control.
- Use HTTPS at the public boundary, secure HTTP-only cookies, same-site protection, CSRF protection on state-changing requests, a restrictive content security policy, and standard security headers.
- Rate-limit login attempts and introduce escalating temporary delays after repeated failures.
- Do not enable a browser-accessible Immich route through the slideshow or Cloudflare configuration.
- Keep family and admin authentication distinct; neither password nor session grants the other role.
- Do not send media, Immich identifiers, metadata, baby age, or per-slide usage events to third parties.
- Load GA4 only after explicit opt-in and keep advertising-related consent denied.
- Keep local display statistics aggregate and anonymous; do not create visitor IDs or associate a count with a family session.
- Do not include a download button. This reduces accidental downloads but is not digital-rights management; an authorized viewer can still capture content displayed in their browser.
- Cloudflare protection may be added in front of the application, but the application-level family password remains the required access control.

## Dockge Deployment

The deliverable will include:

- `compose.yaml`, suitable for creation or import as a Dockge stack.
- `.env.example` with documented, non-secret example values.
- A setup guide written around Dockge's stack editor and controls.
- A local `music/` bind mount containing instructions for adding a user-supplied soundtrack.
- A persistent application-data volume containing the local SQLite statistics database.
- Health check, restart policy, resource limits, and bounded log rotation.

Required configuration:

- Internal Immich base URL.
- Scoped Immich API key.
- Family password hash.
- Separate admin password hash.
- Baby birth date in ISO `YYYY-MM-DD` format.
- Home timezone, defaulting to `Australia/Melbourne` for this deployment.
- Strong session secret.
- Public origin/hostname for security validation.
- Existing external Docker network name shared with Immich.

Optional configuration includes the GA4 measurement ID, photo duration, session duration, soundtrack filename, age-caption visibility, and log level. When the GA4 measurement ID is absent, GA4 and its consent prompt are disabled.

The Compose file declares the Immich network as `external: true`; it does not create, modify, restart, or take ownership of the Immich stack. Cloudflare Tunnel targets the slideshow service and port only. Secrets and the real `.env` file are excluded from version control.

## Testing Strategy

### Unit tests

- Password verification and session expiry.
- Rate-limit thresholds and recovery.
- Fisher–Yates shuffle correctness at the invariant level.
- Age calculations around birth date, month ends, leap years, DST boundaries, and future/invalid timestamps.
- Playback state transitions for photos, videos, errors, and end-of-list reshuffling.
- Analytics-consent state and withdrawal behavior.
- The two-second display threshold and duplicate-event prevention.

### Integration tests

- Paginated favourite retrieval against a mocked Immich API.
- Mixed image/video normalization.
- Authenticated media proxying, byte ranges, safe headers, and upstream failures.
- Confirmation that browser-facing responses never include the API key or internal Immich URL.
- Empty favourites, partial failures, and unavailable Immich behavior.
- Family/admin authorization isolation, local count persistence, reporting windows, CSV export, and confirmed reset.
- Verification that GA4 events contain only the approved event names and no asset or personal metadata.

### Browser tests

- Password entry, invalid password behavior, logout, and session expiry.
- Begin interaction and browser audio-unlock behavior.
- Photo timing and transition controls.
- Video completion, soundtrack pause/fade, and mute behavior.
- Keyboard, pointer, touch, fullscreen, responsive layout, and reduced motion.
- Graceful continuation after a failed item.
- Consent acceptance, refusal, persistence, withdrawal, and the absence of Google requests before opt-in.
- Admin login, ranked thumbnail report, time filters, media filters, CSV export, and reset confirmation.

### Deployment verification

- Validate the Compose configuration before import.
- Confirm health check status in Dockge.
- Confirm the slideshow can access Immich over the private external network.
- Confirm the public hostname can access the slideshow but cannot access Immich directly.
- Confirm favourites added or removed in Immich appear after starting a fresh slideshow.
- Confirm no secret appears in rendered HTML, browser network URLs, application logs, or committed files.
- Confirm per-asset display counts persist through container restarts and remain accessible only through the admin session.
- Confirm no GA4 request occurs without consent and no GA4 payload contains an asset identifier or baby metadata.

## Acceptance Criteria

The design is successfully implemented when:

1. A visitor at the Cloudflare hostname cannot access media without the shared password.
2. A successful login and `Begin` action starts a newly shuffled sequence of all current favourite images and videos.
3. Photos, videos, soundtrack behavior, controls, and soft age captions work as specified on mobile and desktop browsers.
4. Missing or failed individual assets do not stop the whole experience.
5. Immich remains reachable only on the private Docker network, and its API key never reaches the browser.
6. The stack can be configured, deployed, observed, restarted, and updated through Dockge using the delivered documentation.
7. Automated tests and the deployment verification checklist pass without using the real family library in automated fixtures.
8. Consented GA4 reports basic traffic without receiving per-photo or baby data.
9. The separately authenticated admin dashboard accurately ranks locally counted asset displays across 7-day, 30-day, and all-time views.

## References

- Immich search metadata endpoint: https://api.immich.app/endpoints/search/searchAssets
- Immich asset endpoints: https://api.immich.app/endpoints/assets
- Immich API authentication: https://api.immich.app/authentication
- Google Analytics data collection: https://support.google.com/analytics/answer/11593727
- Google Consent Mode setup: https://developers.google.com/tag-platform/security/guides/consent
- GA4 custom-dimension guidance: https://support.google.com/analytics/answer/14240153
