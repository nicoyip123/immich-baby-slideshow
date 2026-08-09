# Slideshow Loading, Audio Ducking, and Precise Age Design

## Goal

Make slideshow transitions feel faster on phones, keep the background soundtrack continuous without overpowering video audio, and show Seren's age with calendar-accurate year, month, and day detail.

## Progressive Image Loading

For the active photo, render its authenticated thumbnail immediately as a full-stage preview. Request the original image at the same time and fade it over the preview only after the original fires its successful load event. If the original fails, the thumbnail remains visible instead of leaving a blank stage. The existing contain-fit layout, shade, age label, Ken Burns motion, controls, swipe behavior, analytics, and display counting remain unchanged.

Preload exactly one playlist item ahead, wrapping at the end of the shuffled playlist. For an image, create one off-screen image request for its original media URL. For a video, create an off-screen video request with `preload="metadata"`; this is only a browser hint and must not force a full video download. Cancel and detach the previous preloader whenever the active index or playlist changes. Do not preload multiple originals, so mobile bandwidth and memory stay bounded.

The thumbnail and original continue through the existing same-origin, family-authenticated media endpoints. No Immich permissions, server routes, public cache policy, or Cloudflare configuration change.

## Continuous Soundtrack and Video Audio

The soundtrack starts from the existing user-initiated **Begin the journey** action and uses one persistent audio element for the lifetime of the slideshow. It no longer pauses when a video becomes active.

Route the soundtrack through a small Web Audio gain controller where supported. Smoothly ramp the soundtrack over about 400 milliseconds to these levels:

- photo or welcome state: `1.0`;
- active video: `0.15`;
- muted: `0.0`.

The video keeps its normal audio level. The existing mute button controls both streams: it sets soundtrack gain to zero and keeps the video element muted; unmuting during a video restores the soundtrack only to `0.15`. Moving back to a photo restores the soundtrack to `1.0`. Pausing a video pauses the video picture and audio but leaves the gently ducked soundtrack continuous.

Web Audio initialization and resume happen from the Begin gesture for mobile browser compatibility. If Web Audio is unavailable or initialization fails, use the media element's volume as a best-effort fallback and never prevent the slideshow from starting. Playback promise failures remain non-fatal. Dispose audio nodes and animation work when the slideshow unmounts.

## Calendar-Precise Baby Age

Calculate age using the configured slideshow timezone and calendar anniversaries, not average month lengths. Preserve the current behavior of returning no label for invalid dates or media captured before birth.

Use these formats with correct singular/plural forms:

- less than one month: `29 days old`;
- less than one year: `2 months, 5 days old`;
- one year or older: `1 year, 2 months, 5 days old`.

The day component remains present after the first month, including zero, so an exact anniversary can read `2 months, 0 days old`. After the first year, both remaining months and days remain present. For births near the end of a month, clamp the monthly anniversary to the last valid day of the target month, matching the existing leap-day and month-end policy; residual days are counted from that clamped anniversary.

## Components and Boundaries

- A progressive-image component owns preview/original rendering, successful-load transition state, and fallback behavior.
- A one-item preloader owns bounded browser preload resources and cleanup.
- A soundtrack mixer owns gain targets, smooth ramps, fallback behavior, and cleanup.
- The slideshow coordinates the active item, mute state, and mixer target but does not contain low-level preload or audio graph logic.
- The server age formatter owns calendar arithmetic and presentation of age units.

These units expose small interfaces and can be tested independently without real Immich media or real speakers.

## Error Handling and Accessibility

An original-image error leaves the thumbnail in place. A thumbnail error still allows the original to appear if it succeeds. Preload failures are ignored because the active media request remains authoritative. Audio graph or playback errors do not interrupt navigation. Media URLs and failures are not logged.

Preview images are decorative while the active full image remains the displayed media. Reduced-motion users receive no image fade or Ken Burns animation. Existing accessible control names, focus behavior, safe-area layout, touch gestures, and mute status remain intact.

## Testing and Verification

Add focused tests proving:

- a thumbnail appears before the original and remains after an original error;
- the original becomes visible only after load;
- exactly the next item is preloaded and old preload resources are cleaned up;
- images request originals while videos request metadata only;
- soundtrack gain targets are `1.0`, `0.15`, and `0.0` in the correct states;
- music is never paused merely because a video becomes active;
- video audio remains unmuted unless the user presses mute;
- fallback audio behavior and cleanup are non-fatal;
- year/month/day formatting covers exact anniversaries, singular/plural, leap days, month ends, timezones, invalid dates, and pre-birth media;
- existing swipe, pause, shuffle, display counting, welcome, authentication, and mobile-control tests continue to pass.

Finish with all TypeScript checks, unit/integration tests, production client/server builds, browser gate, dependency audit, and a fresh Dockge deployment archive.
