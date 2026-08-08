# Mobile Slideshow Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dependable touch swiping and phone-safe, thumb-friendly controls to the existing slideshow.

**Architecture:** Keep gesture classification in a pure `swipeDirection` utility, while the slideshow component owns pointer lifecycle, navigation, and click suppression. Restrict the new control-tray layout to the existing phone media query so desktop presentation and all playlist/media behavior remain unchanged.

**Tech Stack:** React 19, TypeScript, Pointer Events, CSS safe-area environment variables, Vitest, Testing Library, jsdom

---

## File Structure

- Create `src/client/swipe.ts`: classify a completed horizontal gesture without any React or DOM dependency.
- Create `tests/unit/swipe.test.ts`: cover threshold, direction, and vertical rejection deterministically.
- Create `tests/unit/slideshow-mobile.test.tsx`: exercise the real slideshow pointer and control interactions.
- Modify `src/client/App.tsx`: connect touch-pointer lifecycle to the existing `move` function and export `Slideshow` for focused interaction testing.
- Modify `src/client/styles.css`: add phone-only control tray, 50-pixel targets, safe-area spacing, and age-label clearance.

### Task 1: Classify horizontal swipes

**Files:**
- Create: `src/client/swipe.ts`
- Create: `tests/unit/swipe.test.ts`

- [ ] **Step 1: Write the failing swipe-classification tests**

Create `tests/unit/swipe.test.ts`:

```ts
import {describe,expect,it} from "vitest";
import {swipeDirection} from "../../src/client/swipe.js";

describe("swipeDirection",()=>{
 it("moves forward for a qualifying left swipe",()=>expect(swipeDirection({x:140,y:40},{x:70,y:45})).toBe(1));
 it("moves backward for a qualifying right swipe",()=>expect(swipeDirection({x:40,y:40},{x:100,y:44})).toBe(-1));
 it("rejects movement below the 50 pixel threshold",()=>expect(swipeDirection({x:100,y:20},{x:51,y:20})).toBe(0));
 it("rejects movement that is more vertical than horizontal",()=>expect(swipeDirection({x:100,y:20},{x:40,y:100})).toBe(0));
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- tests/unit/swipe.test.ts`

Expected: FAIL because `src/client/swipe.ts` does not exist.

- [ ] **Step 3: Implement the pure classifier**

Create `src/client/swipe.ts`:

```ts
export type SwipePoint={x:number;y:number};
export type SwipeDirection=-1|0|1;

export function swipeDirection(start:SwipePoint,end:SwipePoint,minimumDistance=50):SwipeDirection{
 const horizontal=end.x-start.x;
 const vertical=end.y-start.y;
 if(Math.abs(horizontal)<minimumDistance||Math.abs(horizontal)<=Math.abs(vertical))return 0;
 return horizontal<0?1:-1;
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm test -- tests/unit/swipe.test.ts && npm run typecheck`

Expected: 4 focused tests pass and all TypeScript checks exit 0.

- [ ] **Step 5: Commit the classifier**

```bash
git add src/client/swipe.ts tests/unit/swipe.test.ts
git commit -m "feat: classify slideshow swipe gestures"
```

### Task 2: Connect touch gestures and mobile controls

**Files:**
- Create: `tests/unit/slideshow-mobile.test.tsx`
- Modify: `src/client/App.tsx:1,11-19`
- Modify: `src/client/styles.css:4-5`

- [ ] **Step 1: Write failing slideshow interaction tests**

Create `tests/unit/slideshow-mobile.test.tsx` with a jsdom environment. Mock `../../src/client/api.js` so `createPlaylist()` returns two image items with distinct media URLs, and mock analytics tracking. Render the exported `Slideshow` with generic supplied welcome copy, click **Begin the journey**, and assert:

```tsx
const stage=await screen.findByRole("main");
fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
expect(screen.getByRole("img").getAttribute("src")).toBe("/api/assets/second/media");
```

Add a second test that begins on the first item, performs pointer down/up on the **Next** button, then clicks it and verifies only one move to the second item. This proves control-originated pointer events do not also trigger swipe navigation.

- [ ] **Step 2: Run the interaction test to verify RED**

Run: `npm test -- tests/unit/slideshow-mobile.test.tsx`

Expected: FAIL because `Slideshow` is not exported and has no swipe handlers.

- [ ] **Step 3: Add touch-pointer lifecycle to `Slideshow`**

Import the classifier in `src/client/App.tsx`:

```tsx
import {swipeDirection} from "./swipe.js";
```

Export `Slideshow`, and add refs for one active touch plus suppression of the synthetic click that follows a successful swipe:

```tsx
const swipe=useRef<{pointerId:number;x:number;y:number}|null>(null);
const suppressClick=useRef(false);
```

After the existing `move` function, define handlers with these exact rules:

```tsx
const pointerDown=(event:React.PointerEvent<HTMLElement>)=>{
 if(event.pointerType!=="touch"||!event.isPrimary||(event.target as Element).closest(".controls")){swipe.current=null;return}
 swipe.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
};
const pointerUp=(event:React.PointerEvent<HTMLElement>)=>{
 const start=swipe.current;swipe.current=null;
 if(!start||start.pointerId!==event.pointerId)return;
 const direction=swipeDirection(start,{x:event.clientX,y:event.clientY});
 if(direction){suppressClick.current=true;window.setTimeout(()=>{suppressClick.current=false},0);setControls(true);move(direction)}
};
const pointerCancel=()=>{swipe.current=null};
const revealControls=()=>{if(suppressClick.current){suppressClick.current=false;return}setControls(true)};
```

Attach `onPointerDown`, `onPointerUp`, and `onPointerCancel` to the slideshow `<main>`. Keep the existing `onPointerMove={()=>setControls(true)}`. Replace the stage's existing click handler with `onClick={revealControls}`.

The zero-delay reset ensures the immediately synthesized post-swipe click is ignored without causing the visitor's next genuine tap to be lost on browsers that omit that synthetic click.

Add `aria-label={paused?"Play":"Pause"}` to the pause/play button while retaining its visible symbol and behavior. Existing names for previous, next, mute, and fullscreen remain unchanged.

- [ ] **Step 4: Add the phone-only control tray and safe-area rules**

Inside the existing `@media(max-width:600px)` block in `src/client/styles.css`, add:

```css
.controls{bottom:max(12px,env(safe-area-inset-bottom));gap:6px;padding:8px;border:1px solid #ffffff2b;border-radius:999px;background:#11151ad9;backdrop-filter:blur(14px)}
.controls button{width:50px;height:50px;flex:0 0 50px}
.age{bottom:calc(92px + env(safe-area-inset-bottom))}
```

Add `touch-action:pan-y` to the base `.stage` rule. This tells touch browsers to preserve horizontal Pointer Events for the slideshow while continuing to reserve vertical movement for the browser, preventing horizontal drags from being cancelled before `pointerup`.

The resulting tray is 290 pixels wide including buttons, gaps, and padding, so it fits a 320-pixel viewport. Do not change desktop control sizing or the existing three-second auto-hide logic.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/unit/swipe.test.ts tests/unit/slideshow-mobile.test.tsx && npm run typecheck`

Expected: classifier and real interaction tests pass; all TypeScript checks exit 0.

- [ ] **Step 6: Run the complete verification gate**

Run: `npm run verify`

Expected: every unit/integration test passes, client and server builds succeed, and the Playwright browser gate exits 0.

- [ ] **Step 7: Inspect responsive behavior**

Inspect the authenticated slideshow at approximately 320, 390, and 1280 pixels wide. Confirm the tray fits without horizontal clipping, clears the bottom safe area, keeps the age label readable, auto-hides after three seconds, returns on tap, and leaves desktop sizing unchanged. On a touch-capable device or emulation, verify left/right swipes navigate once and vertical gestures do not navigate.

- [ ] **Step 8: Commit the interaction and presentation changes**

```bash
git add src/client/App.tsx src/client/styles.css tests/unit/slideshow-mobile.test.tsx
git commit -m "feat: improve mobile slideshow navigation"
```
