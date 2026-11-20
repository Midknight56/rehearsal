# Landing preview: acceptance record

Spec: `.kiro/specs/landing-preview/`. Run by `tests/e2e/landing-preview.spec.ts` in headless Chromium (Playwright 1.64.1) on the test build, on a Windows desktop PC (AMD Ryzen 9 9950X, 93.6 GB memory). These numbers are single measurements on one machine and no performance claim follows from them.

## First moving frame
Measured from navigation start to the first animation frame where the game view reports `playing`, a clock above 0 and frames drawn (`window.__rehearsal.gameView().debug()`).

| Run | Milliseconds |
| --- | --- |
| Run after requirement 6 (seek to 04:00, 4x) | 333, 408 |
| Before requirement 6 (1x from 0) | 313, 383, 472, 515, 648 |

Limit in the test: under 2,000 ms. Since requirement 6 the test waits for a clock above 04:00 while playing. The replay seeks to 04:00 before it first draws, plays at 4x and, when its clock callback reports 16:00 or later, seeks back to 04:00. Harbor Hall's 120 attendees arrive evenly over 20 simulated minutes, so at 1x from 0 the hall was empty for the first minutes.

One second after the first moving frame (one run): clock 244,528 ms (04:04), 22 sprites drawn, 19 attendees waiting at the check-in desk. Limits in the test: at least 8 and at least 5.

Loop: 1x is one simulated second per real second, so 4x needs 180 s of real time to cross 04:00 to 16:00. A 10 s test cannot reach 16:00 by playing, so it moves the clock to 15:55 with the handle's own seek and watches 10 s: 544 to 602 readings, minimum 240,000 ms, maximum about 960,000 ms, one wrap, never below 04:00. The loop code itself is not touched by the test.

## Reduced motion
With `reducedMotion: 'reduce'` the clock stops at 300,000 ms (05:00), `playing` is false, and it still reads 300,000 ms after 1.2 s. The readout says `Simulated time 05:00, paused because motion is reduced`.

## Layout measurements (`getBoundingClientRect`)
| | 360 x 640 | 1920 x 1080 |
| --- | --- | --- |
| Page scroll width | 360 | 1920 |
| Intro part | x 16 to 344, y 96 to 226 | x 336 to 1040, y 138 to 262 |
| Actions part | x 16 to 344, y 250 to 438 | x 336 to 1584, y 286 to 342 |
| Replay part | x 29 to 331, y 540 to 936 | x 361 to 1144, y 460 to 1059 |
| Result part | x 29 to 331, y 948 to 1130 | x 1168 to 1559, y 460 to 730 |
| Try the community fair | 205 x 48 | 227 x 56 |
| Import a spreadsheet or CSV | 229 x 44 | 257 x 44 |
| Open a scenario JSON (file input) | 291 x 44 | 291 x 44 |
| Canvas | 300 x 180 | 781 x 469 |

Checked at both sizes: no horizontal scroll, no two parts overlap, nothing past the left or right viewport edge, every control at least 44 x 44 px, at least 8 px between any two controls, all text at least 12 px. At 360 x 640 the parts stack and the page scrolls vertically.

## Captures
Taken 3 s of real time after the first moving frame, full page (clock 255,398 ms and 255,596 ms at the shot, 04:15; 21 sprites drawn):
- `docs/acceptance/img/landing-preview-1920x1080.png`
- `docs/acceptance/img/landing-preview-360x640.png`

## Not claimed
- What the captures show: dots (attendees) walking on the routes and a line of about 10 to 19 dots at the Check-in desk with the line colour ramp from green to yellow, the clock text Simulated time 04:15, playing at 4×, the result line, the fictional and not a forecast lines. No overlap, nothing clipped by the page. In the 360 wide capture the canvas label Welcome packs touches the right edge of the canvas; that label is drawn by the game view and was not changed here.
- The result line is `One more check-in desk cuts the mean wait by 297.4 s. Lower in 30 of 30 paired runs.` It comes from 30 simulated paired runs of a fictional fair. It is not a forecast, and nothing here is a statement about crowd density, safety or a real event.
- No user test, no audit, no frame rate measurement.
