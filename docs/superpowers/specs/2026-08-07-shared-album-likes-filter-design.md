# Shared Album Likes Filter Design

## Goal

Build each slideshow playlist from image and video assets that are currently inside one configured Immich shared album and have at least one asset-level Like from any album member.

Immich models shared-album Likes as activities. They are distinct from an asset's `isFavorite` property, so the previous compound metadata search cannot implement this rule.

## Data Flow

For each new playlist, the Immich client performs two read-only requests concurrently:

1. `GET /api/albums/{IMMICH_ALBUM_ID}` retrieves the album and its current assets.
2. `GET /api/activities?albumId={IMMICH_ALBUM_ID}&type=like` retrieves Like activities from all users.

The client collects non-null `assetId` values from Like activities into a set, then retains album assets whose IDs are in that set. This deduplicates multiple Likes on one asset and excludes album-level Likes, stale activities, and assets removed from the album.

The client normalizes only `IMAGE` and `VIDEO` assets with usable capture timestamps. No per-asset API requests are needed.

## Permissions and Privacy

The API key belongs to a user who can access the shared album and has only:

- `album.read` for the album and its asset list;
- `activity.read` for Like activities;
- `asset.view` for thumbnails and video playback; and
- `asset.download` for original photos.

The website never sends the Immich API key, upstream URLs, activity users, comments, filenames, or Like counts to the browser. It uses activity data only to select asset IDs.

## User Experience

All existing presentation behaviour remains unchanged: a fresh shuffled order is created after each refresh and Begin action, photos and videos are supported, music pauses for videos, age labels use capture timestamps, and anonymous display statistics remain local.

If no current album asset has an asset-level Like, the start screen says "No liked memories yet" and explains that family members can Like media in the shared Immich album. An album-level Like alone does not select every item.

If either Immich request fails or returns an invalid response, the existing gentle unavailable response is used. Neither partial request result is served.

## Deployment

`IMMICH_ALBUM_ID` remains required and validated as a UUID. `.env.example` does not change, but Dockge guidance will replace the previous Favourite permissions and instructions with the Like-based rule.

The portable Linux archive is regenerated after tests and verification pass.

## Verification

Tests will prove that:

- the client requests the configured album and `type=like` activities;
- Likes from multiple users select an asset only once;
- album-level Likes with a null asset ID are ignored;
- liked assets absent from the current album are ignored;
- unliked album assets, unsupported media types, and malformed assets are excluded;
- image/video normalization and playlist shuffling continue to work;
- the UI uses the revised empty-state copy;
- type checking, all tests, production build, dependency audit, and Compose validation pass.
