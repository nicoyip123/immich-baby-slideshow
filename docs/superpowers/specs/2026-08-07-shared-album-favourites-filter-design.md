# Shared Album Favourites Filter Design

> Superseded by `2026-08-07-shared-album-likes-filter-design.md`. Immich shared-album Likes are activities, not the asset Favourite flag.

## Goal

Limit the baby slideshow to image and video assets that satisfy both conditions:

- the asset is marked as a favourite in Immich; and
- the asset belongs to one configured shared album.

The shared album may contain assets contributed by multiple Immich users. The API key must belong to a user who can access that album.

## Configuration

Add one required environment variable:

```dotenv
IMMICH_ALBUM_ID=00000000-0000-0000-0000-000000000000
```

The server validates this value as a UUID during startup. The album ID is used instead of the album name so renaming the album cannot break the slideshow and duplicate album names cannot select the wrong collection.

## Immich Query

The Immich client will continue using the stable metadata-search endpoint, but each page request will include both filters:

```json
{
  "isFavorite": true,
  "albumIds": ["7f2a70a8-0f37-4b39-9d97-46d26d53f210"],
  "withExif": true,
  "page": 1,
  "size": 1000
}
```

Filtering happens inside Immich. The application will not download the entire album or retrieve all favourites and intersect the lists locally. This minimizes API calls and avoids processing unrelated private metadata.

The existing API-key permissions remain `asset.read`, `asset.view`, and `asset.download`. No write, delete, upload, user, or administration permission is required. The API-key user must have access to the configured shared album.

## Application Behaviour

All existing behaviour remains unchanged after filtering: images and videos are shuffled on each visit, age labels use capture timestamps, media is proxied through authenticated routes, impressions are counted locally, music pauses for videos, and family/admin passwords remain separate.

If the album is inaccessible or Immich rejects the query, the playlist endpoint returns the existing gentle unavailable response. If the query succeeds with no matching assets, the existing empty-favourites screen is shown.

## Deployment and Migration

`.env.example` and the Dockge setup guide will document `IMMICH_ALBUM_ID` and how to copy it from the Immich album URL. Existing deployments must set the variable before upgrading; startup will fail clearly if it is missing or malformed.

After implementation and verification, the portable Linux archive will be regenerated so it contains the updated application and deployment documentation.

## Verification

Tests will verify:

- startup rejects a missing or malformed album ID;
- valid UUID album IDs are normalized into application configuration;
- every paginated Immich metadata request contains both `isFavorite: true` and the configured `albumIds` value;
- existing image/video normalization and playlist behaviour continue to work;
- full type checking, unit/integration tests, production build, and Compose validation remain green.
