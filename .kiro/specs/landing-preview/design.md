# Landing preview: design

## Parts
- `src/ui/landing/previewHeadline.ts`: `previewHeadline(comparison)` returns the result line or `null`. It calls `compareHeadline` on the `queueWait.mean` metric, then words the sentence around the number and the count it returns. The desk phrase comes from the scenarios (one station with one more server), else a generic phrase.
- `src/ui/landing/LandingPreview.tsx`: the panel. On mount it creates the view and asks for the examples, runs replication 0 with a trace, loads the view, then starts `runPairedComparison`. On unmount it cancels both, unregisters and destroys the view.
- `src/ui/landing/Landing.tsx`: new optional prop `preview?: { client: SimulationClient; createView: typeof createGameView }`. Without it the landing is unchanged. With it, the landing keeps one `loadExample` promise in a ref; the panel and `Try the community fair` both use it. If that promise failed, activation fetches again and shows the existing failure text.
- `src/app.tsx`: passes the session client and `createGameView`.

## Flow
fetch 3 files (once) -> replay run (trace, replication 0) -> `load`, then `play` (1x) or `seek(300000)` and `pause` (reduced motion) -> paired run (30 runs) -> result line.
The view is created in parallel with the fetch. The replay never waits for the paired run.

## Accessibility
The canvas sits in a `role="img"` box with an accessible name and a visible one sentence description (`aria-describedby`). No tabindex. The simulated time readout is plain text updated once per second of simulated time, not a live region. The status region is untouched.

## Layout
Intro on top (heading, two lines, buttons). Below it one panel: the game view and, beside it on wide screens, the result card. Under 1,000 px the card stacks under the canvas. Parts carry `data-landing-part` so the e2e spec can measure them.

## Tests
`tests/ui/landing-preview.test.tsx` (fake view, fake port, in process client) and `tests/e2e/landing-preview.spec.ts` (first moving frame, reduced motion, headline, layout at two sizes, two captures). Hand checks go in `docs/acceptance/landing-preview.md`.

## Loop (requirement 6)
After `load`, a non-reduced preview calls `seek(240000)`, `setSpeed(4)`, `play()`, in that order, before the next frame. Its `onClock` callback (already registered, one per mount, removed on unmount) shows the clock text once per whole second and calls `seek(240000)` when `ms >= 960000`. A `cancelled` flag and the removed listener mean nothing acts after unmount. The speed text under the canvas is a span updated with the clock. Reduced motion is unchanged: `seek(300000)`, `pause`. The e2e first moving frame now means a clock above 04:00 while playing.