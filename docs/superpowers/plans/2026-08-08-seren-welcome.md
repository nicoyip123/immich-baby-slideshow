# Seren Welcome Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authenticated pre-slideshow prompt with the approved soft keepsake introduction to Seren’s story.

**Architecture:** Extract the welcome presentation into a small client component with one `onBegin` callback, leaving playlist creation and slideshow state in `App.tsx`. Give that component dedicated CSS classes so its cream-and-blush treatment cannot affect the password, slideshow, consent, or admin screens.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, jsdom

---

## File Structure

- Create `src/client/WelcomeScreen.tsx`: render only the approved authenticated welcome content and invoke an injected journey callback.
- Create `tests/unit/welcome-screen.test.tsx`: verify the approved copy and that the primary action invokes the callback.
- Modify `src/client/App.tsx`: render `WelcomeScreen` before playlist creation while retaining the existing playlist, analytics, and soundtrack flow.
- Modify `src/client/styles.css`: add isolated responsive keepsake styling for the welcome component.

### Task 1: Build and connect the Seren welcome screen

**Files:**
- Create: `src/client/WelcomeScreen.tsx`
- Create: `tests/unit/welcome-screen.test.tsx`
- Modify: `src/client/App.tsx:1-16`
- Modify: `src/client/styles.css:1-2,14`

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/welcome-screen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "../../src/client/WelcomeScreen.js";

describe("Seren welcome screen", () => {
  it("shows the approved keepsake copy and begins the journey", async () => {
    const onBegin = vi.fn();
    render(<WelcomeScreen onBegin={onBegin} />);

    expect(screen.getByText("Seren’s little story")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "From your very first days…" })).toBeTruthy();
    expect(screen.getByText("A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Begin the journey" }));
    expect(onBegin).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/unit/welcome-screen.test.tsx`

Expected: FAIL because `src/client/WelcomeScreen.tsx` does not exist.

- [ ] **Step 3: Implement the welcome component**

Create `src/client/WelcomeScreen.tsx`:

```tsx
export function WelcomeScreen({ onBegin }: { onBegin: () => void }) {
  return <main className="welcome-cover">
    <section className="welcome-card" aria-labelledby="welcome-title">
      <span className="welcome-spark welcome-spark-one" aria-hidden="true">✦</span>
      <span className="welcome-spark welcome-spark-two" aria-hidden="true">✦</span>
      <p className="welcome-eyebrow">Seren’s little story</p>
      <h1 id="welcome-title">From your very first days…</h1>
      <p className="welcome-copy">A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.</p>
      <button type="button" onClick={onBegin}>Begin the journey</button>
    </section>
  </main>;
}
```

- [ ] **Step 4: Connect the component without changing slideshow behaviour**

Add this import to `src/client/App.tsx`:

```tsx
import { WelcomeScreen } from "./WelcomeScreen.js";
```

Replace the existing `if(!list)` return in `Slideshow` with:

```tsx
if(!list)return <><WelcomeScreen onBegin={async()=>{const p=await api.createPlaylist();setList(p);track("slideshow_started");setTimeout(()=>void audio.current?.play().catch(()=>{}))}}/><audio ref={audio} src="/api/soundtrack" loop muted={muted}/></>;
```

This preserves the existing API request, playlist assignment, analytics event, delayed soundtrack attempt, audio ref, loop, and mute state.

- [ ] **Step 5: Add isolated soft keepsake styling**

Append these rules to `src/client/styles.css` before the existing media queries:

```css
.welcome-cover{min-height:100vh;display:grid;place-items:center;overflow:hidden;position:relative;padding:24px;background:radial-gradient(circle at 18% 18%,#fff 0,transparent 28%),radial-gradient(circle at 82% 82%,#ead4c9 0,transparent 34%),linear-gradient(145deg,#fffaf5,#f4e6df);color:#694f45}
.welcome-card{width:min(560px,100%);position:relative;text-align:center;padding:64px 54px;border:1px solid #fff9;border-radius:32px;background:#fff9;box-shadow:0 24px 70px #7d594124;backdrop-filter:blur(16px)}
.welcome-eyebrow{margin:0 0 20px;color:#9a7666;font-size:.72rem;font-weight:700;letter-spacing:.2em;line-height:1.4;text-transform:uppercase}
.welcome-card h1{margin:0 0 20px;color:#694f45;font:italic 2.65rem/1.08 Georgia,serif}
.welcome-copy{max-width:430px;margin:0 auto 30px;color:#7d655a;font-size:1.02rem;line-height:1.7}
.welcome-card button{padding:14px 24px;border:0;border-radius:99px;background:#fff;color:#674f41;font-weight:700;cursor:pointer;box-shadow:0 9px 28px #5b3e2b1f}
.welcome-card button:focus-visible{outline:3px solid #a97965;outline-offset:4px}
.welcome-spark{position:absolute;color:#d8ae99;opacity:.55}.welcome-spark-one{top:30px;left:38px;font-size:1.8rem}.welcome-spark-two{right:40px;bottom:34px;font-size:1rem}
```

Add these narrow-screen rules inside the existing `@media(max-width:600px)` block:

```css
.welcome-card{padding:54px 25px;border-radius:26px}.welcome-card h1{font-size:2.15rem}.welcome-copy{font-size:.96rem}
```

No animation is introduced, so reduced-motion behaviour remains unchanged.

- [ ] **Step 6: Run the focused test and typecheck**

Run: `npm test -- tests/unit/welcome-screen.test.tsx && npm run typecheck`

Expected: the welcome-screen test passes and all TypeScript checks exit 0.

- [ ] **Step 7: Run the complete verification gate**

Run: `npm run verify`

Expected: all unit/integration tests pass, client and server builds succeed, and the browser gate exits 0.

- [ ] **Step 8: Inspect the production build at desktop and phone widths**

Run the production server with the existing local environment, authenticate as family, and confirm the approved screen at approximately 1280 px and 390 px widths. Verify that **Begin the journey** loads a shuffled playlist and that no Seren copy appears before authentication.

- [ ] **Step 9: Commit the implementation**

```bash
git add src/client/WelcomeScreen.tsx src/client/App.tsx src/client/styles.css tests/unit/welcome-screen.test.tsx
git commit -m "feat: welcome visitors to Seren's story"
```
