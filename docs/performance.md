# Performance readings

Recorded by Kiro on 2026-11-17 for `paired-comparison-and-release` task 15 (matrix row 29). These are single-machine readings with the targets of plan section 9 written beside them. They are not claims about any other computer, browser or network. The headless Chromium readings are labelled headless; no desktop browser was measured here.

Hardware: AMD Ryzen 9 9950X 16-Core Processor (16 cores, 32 logical processors), 93.6 GiB memory (read from `Win32_Processor` and `Win32_ComputerSystem`; mainboard model string B850M EAGLE WIFI6E ICE; this is a desktop PC, not a laptop). Windows 11 Pro 10.0.26200. Node v24.19.0. Vitest 5.0.5.

## Simulation (Node, no browser)

Command: `$env:MEASURE = '1'; npx vitest run tests/comparison/performance.measure.test.ts; Remove-Item Env:MEASURE`, with `--silent=false` added because this Vitest prints the console output of a passing test only with it. Median of five timed runs after two warm-ups, `simulate` only (validation and hashing are outside the timed part), untraced, `perfScenario(500)` is Harbor Hall `baseline` with 500 attendees in `doors`, its plus-one form adds one server at check-in, and `perfScenario(5000)` has 5,000 attendees with 20 servers at both stations.

| Case | Median ms | Target |
| --- | --- | --- |
| one 500-attendee simulate call | 12.8 | under 500 ms |
| 30 paired 500-attendee replications (60 calls) | 478.6 | within 5,000 ms |
| one 5,000-attendee simulate call | 153.6 | may take longer; must stay cancellable |

All three are inside their targets on this machine. The table is from the last of three runs; the second row read 625.1 ms and 478.6 ms in two of them, so it varies by about a quarter between runs. The cancellable half of the third target is not shown by this table; it is `tests/comparison/runner.test.ts` and `tests/e2e/run-controls.spec.ts`.

## Browser (headless Chromium 156.0.8078.4 through Playwright 1.64.1, test build on port 4273)

Command: `$env:MEASURE = '1'; npx playwright test tests/e2e/measure.spec.ts; Remove-Item Env:MEASURE`. `tests/e2e/measure.spec.ts` is a measurement, not a check: it asserts no timing and is skipped without `MEASURE=1`. The readings below are from one run on 2026-11-17.

- `timing.pairedMs` from the Compare screen (Harbor Hall `baseline` against `plus-one-checkin`, 30 paired runs measured by the runner around the untraced runs of the two scenarios, as the screen reports it; the screen shows it to 0.1 s): 300, 300, 300 ms, median 300 ms. Target: within 5,000 ms. Two earlier runs of the same file read 400, 400, 500 ms and 400, 400, 300 ms.
- First load to a usable example: navigation start, `Try the community fair` clicked, the heading `Harbor Hall Community Fair: baseline` and the `Simulate` button visible. Network throttling profile, named here: Lighthouse mobile values (latency 150 ms, download 209,715 bytes/s which is 1.6 Mbit/s, upload 96,000 bytes/s which is 750 kbit/s) applied with CDP `Network.emulateNetworkConditions`, cold cache, a new browser context for each reading. Readings: 2,030, 2,035 and 2,496 ms, median 2,035 ms. Target: within 3,000 ms on a throttled ordinary connection. Two earlier runs read medians of 2,015 ms and 2,013 ms. The throttling applies to a local preview server, so it models the connection and not the distance to a real host.
- `window.__rehearsal.gameView().debug().framesLast2s`, Harbor Hall `baseline` at 1×, seeked to 05:00 and then playing, three samples 2.1 s apart: 120, 120, 120 frames in 2 s, median 120 (60.0 frames per second), 25 or 26 sprites drawn. Target: 60 frames per second.
- `window.__rehearsal.gameView().debug().framesLast2s`, `tests/e2e/fixtures/large-1200.json` at 4×, seeked to 10:00 and then playing, three samples: 92, 91, 83 frames in 2 s, median 91 (45.5 frames per second), 589 to 604 sprites drawn. Target: 30 frames per second. Earlier runs of the same file read medians of 103, 82 and 74 frames in 2 s (51.5, 41 and 37 frames per second), so the figure varies between runs; all of them are above 30.

Limits of these readings: headless Chromium may draw with a software renderer; a frame counter is not a measure of how smooth the motion looks; the machine ran other work during the readings (other projects share this PC); nothing here is a reading from a desktop browser or from a laptop.
