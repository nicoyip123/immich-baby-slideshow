# Private Family Link Design

## Goal

Allow older relatives to open the protected family slideshow from a private link without typing the shared password, while keeping password and admin authentication unchanged.

## Link and Configuration

The private link uses this format:

```text
https://baby.starleaf.cc/#family=<64-lowercase-hex-token>
```

The token contains 32 random bytes represented as 64 lowercase hexadecimal characters. The server configuration stores only its SHA-256 digest as an optional `FAMILY_LINK_TOKEN_HASH` value. An empty value disables family-link login. The private token must never be stored in configuration, server logs, analytics, the public client bundle, or API responses.

A compiled command inside the application container generates a fresh token, its configuration hash, and the complete link using `PUBLIC_ORIGIN`. This lets the owner run one `docker exec` command, copy the hash into `.env`, privately save the link, and recreate the container. Generating a new hash revokes the previous link.

## Browser Flow

On initial family-page render, the client synchronously reads a strictly canonical `#family=<token>` fragment and immediately removes the complete fragment with `history.replaceState`, before status checks, public configuration loading, or analytics can run. Unknown or malformed fragments are also removed and treated as normal password visits.

When a valid-looking token is present, the client sends it once in the body of a same-origin POST request. It never places the token in a query string, path, header, local storage, session storage, cookie, error message, or retry UI. Success continues into the existing authenticated welcome flow. Failure quietly falls back to the normal password page without revealing whether family-link login is configured or why it failed.

## Server Authentication

The exchange endpoint accepts only a canonical one-field JSON body containing the 64-character token. It enforces the configured exact Origin, an 8 KiB body limit, generic error responses, explicit `Cache-Control: private, no-store`, and a failure limiter isolated from password-login quotas. Token verification hashes the received token and uses a constant-time comparison against the configured digest. Malformed, absent, disabled, incorrect, oversized, and rate-limited attempts never disclose configuration or token details.

On success, the endpoint sets the existing secure, HTTP-only, same-site-strict `family_session` cookie. Family-link sessions last 30 days. They use a signing key derived from both `SESSION_SECRET` and `FAMILY_LINK_TOKEN_HASH`, while password sessions keep their existing signing key and configured duration. Family session guards and status checks accept either valid family credential. Rotating the family-link hash therefore immediately invalidates all prior link-created sessions without signing out password-authenticated family or admin sessions.

## Operational Behaviour

The existing family password remains the recovery path. Admin authentication and cookies are unaffected. Logout clears either family-session type through the existing family cookie. No Cloudflare change is required because the fragment never reaches Cloudflare and the exchange uses the existing application origin.

The owner must treat the link as a bearer credential: anyone holding it can view the slideshow. Rotation requires generating a replacement, updating `FAMILY_LINK_TOKEN_HASH` in `.env`, recreating the slideshow container, and redistributing the new private link.

## Verification

Tests cover canonical fragment extraction and synchronous removal; no pre-exchange analytics exposure; successful exchange and fallback; malformed request handling; isolated rate limiting; constant-time token verification; secure 30-day cookie attributes; password-session compatibility; immediate old-link session revocation after hash rotation; generator output shape; disabled configuration; and absence of tokens from logs and the production client bundle. The complete typecheck, test suite, production build, browser gate, and secret scan run before delivery.
