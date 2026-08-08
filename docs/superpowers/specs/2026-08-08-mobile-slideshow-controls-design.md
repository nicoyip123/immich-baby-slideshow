# Mobile Slideshow Controls Design

## Goal

Make the slideshow comfortable to navigate one-handed on iPhone and Android without changing desktop behaviour or interfering with video controls.

## Swipe Navigation

The slideshow stage accepts a single-finger horizontal swipe to move between memories. A left swipe advances and a right swipe returns to the previous item. A gesture qualifies only after moving at least 50 pixels horizontally and farther horizontally than vertically. Vertical, short, multi-touch, cancelled, and control-originated gestures do not navigate.

Each gesture may navigate at most once. Swiping also reveals the controls and must not trigger the stage's tap behaviour a second time when the pointer is released. Existing automatic photo timing, video playback, pause state, and shuffle order remain unchanged.

## Mobile Controls

At phone widths, the five existing controls remain in the same order: previous, pause/play, next, mute, and fullscreen. Their touch targets increase to at least 50 by 50 CSS pixels, use tighter spacing that still fits a 320-pixel viewport, and sit in a translucent rounded control tray.

The tray's bottom position includes `env(safe-area-inset-bottom)` so it clears iPhone home indicators and equivalent inset areas. The age label moves above the taller tray. Controls retain their current three-second auto-hide behaviour and return on a normal tap or pointer movement.

## Accessibility and Input Compatibility

Buttons retain accessible names and keyboard behaviour. Swipe is an additional input method, never the only way to navigate. Pointer handling is limited to the slideshow stage and ignores events originating inside the controls. Desktop mouse clicks, keyboard focus, reduced-motion behaviour, and fullscreen capability remain intact.

## Testing

Extract the gesture decision into a small pure unit so threshold, direction, vertical rejection, and cancellation rules can be tested deterministically. Add a client interaction test that proves a qualifying swipe changes the displayed item once and a control interaction does not swipe. Run the complete typecheck, test suite, production build, and browser gate, then inspect the layout at approximately 320, 390, and 1280 pixels wide.
