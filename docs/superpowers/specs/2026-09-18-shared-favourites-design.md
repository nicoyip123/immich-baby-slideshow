# Shared favourite moments

Family viewers double-tap a photo, Live Photo, or video to save it to one shared collection. Desktop double-click and an accessible Save favourite button provide equivalent actions. Repeated saves are idempotent, and visitors cannot remove favourites. Brief status feedback confirms success or permits retry after a failed save. Swipes, drags, multitouch, and control clicks must not count as double taps.

The owner views favourites in a separate admin section, previews full photos/videos, and removes entries from the shared collection. Removal never deletes Immich media or changes its liked state. Existing statistics remain available and resetting statistics does not delete favourites.

Store asset ID, media type, and first saved timestamp in a new table in the existing persistent SQLite database. Family saves validate membership in the currently allowed album (including after a slideshow has been open for over an hour), rather than accepting arbitrary asset IDs. Admin list and delete routes require admin authentication, mutations require the configured Origin, and responses are private/no-store. No favourite data goes to analytics.

Release v0.2.0. Verify persistence, permissions, duplicates, failed saves, gesture boundaries, admin actions, and existing playback behaviour. Deployment is a separate step after local verification.

## Like feedback

Double-tap starts an outlined heart pulse while saving. A confirmed save triggers a filled heart bounce with a ring and sparkles plus success text. The smaller heart and Liked label stay visible after playback controls fade. Repeated likes replay confirmation without toggling the shared save off. Confirmed likes are remembered when revisiting a slide; new playlists include current shared favourite state. Admin changes are reflected when the slideshow reloads. Reduced-motion mode shows the confirmation without animated motion. Failures do not mark an unsaved moment as liked.
