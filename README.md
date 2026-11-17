# Rehearsal

Rehearsal imports an event's arrivals and stations from a workbook, lays them out on a floor plan, and replays a simulated run in a game view so two staffing or layout choices can be compared before the day.

It stitches together a chimera of technologies that do not usually meet: a spreadsheet import, a grid floor plan editor, a discrete event queue simulation and a 2D game engine replay, in one browser app built with Kiro (specs, steering, hooks, a custom agent, the Playwright MCP server and the Kiro CLI).

Category: Frankenstein.

## Judging criteria at a glance

**Potential Impact.** Volunteers who run a community fair, a school open day or a registration desk guess at staffing and find out on the day, with a line out the door. Rehearsal lets them type or import their arrivals and stations, see the line form, and test a change first. On the bundled Harbor Hall example, one more desk at check in cuts the mean queue wait by 297.4 s over 30 paired runs, and all 30 runs improve. It runs in the browser with no account. A keyboard journey test walks the main path with no mouse, the replay has a reduced motion mode, and body text contrast is 16.67:1 (printed by `tests/ui/styles.test.ts`, which needs 4.5:1).

**Technological Implementation.** Kiro wrote the code from three specs (`.kiro/specs/simulation-contract`, `scenario-editor-and-replay`, `paired-comparison-and-release`), each reviewed by Kiro before its tasks ran. Five steering files fix units, determinism, claims and accessibility. Two hooks run the checks (`verify-on-stop`, `model-tests-on-save`). A custom agent, `.kiro/agents/rehearsal-playwright.json`, drove the dev build through the Playwright MCP server and read the comparison result back. The specs name 32 correctness properties, tested with `fast-check` in 13 test files. Every task has a row in `docs/kiro-log.md` (63 rows) with its files and its check result. Tests: 281 model, 406 UI and 106 browser tests pass.

**Design.** A complete product, not a demo: landing page, Plan screen, import with a row by row preview, floor plan with drag, Game view replay with follow and find, Compare screen, saved scenarios, JSON open and save, CSV and workbook export, a printable comparison and a run sheet for the day. Every limit of the model is shown next to the results, in plain words. Screens are in `docs/acceptance/img/`.

**Innovation/Idea.** A queue model usually lives in a spreadsheet or a specialist tool, and a game engine usually draws a game. Here the spreadsheet is the input, the floor plan is the model, and the game engine replays one simulated run person by person, so an organizer sees why a line forms. Paired runs (the same random draws for both choices) make a small change show up clearly.

**Presentation.** Open the app, click `Try the community fair`, press `Simulate`, then `Compare` the baseline with the extra desk at check in. The whole path needs no data of your own. First load to a usable example measured 2,035 ms on a throttled network profile (`docs/performance.md`).


Results are scenario results under the stated assumptions, not a forecast. The Harbor Hall Community Fair example, its 120 attendees and its service times are fictional and illustrative.

## Commands

```
npm ci
npm run verify
npm run test:e2e
```

`npm run verify` runs the type check, the model and UI tests and the build. `npm run test:e2e` runs the browser tests in headless Chromium and starts its own preview servers on ports 4273 and 4274.

## Model limits

Model version 0.1.0 is the engine these lines describe. The sentences below are the ones the app shows beside its results and prints in its exports.

- One station is one service stage: a single FIFO line feeding identical parallel servers.
- A cohort follows its ordered station IDs, each at most once, then exits.
- Staffing is constant through a run.
- Queue capacity is unlimited and nobody leaves early.
- Walking is at one constant speed along the computed grid path.
- Service durations are constant or triangular.
- No personal space, congestion-dependent walking speed, doorway throughput, accessibility clearance, crowd pressure or collisions: queue sprites never block movement.
- The output of a run is a scenario result under these assumptions for one seed and one replication: scenario results, not a forecast.

Limits: at most 5,000 attendees, 10 stations, 6 station visits per route, 80 × 80 cells, a 360-minute observation window, servers 1 to 20, 10 saved scenarios, a 2 MiB import file.

Model version 0.1.0

Scenario results, not a forecast.

The model has no abandonment, staff breaks, scheduled staffing changes, weather, evacuation or crowd physics, and it recommends nothing. One replayed replication is an example run, not the average of the 30 paired runs.

## Privacy

On 2026-11-17 a headless Chromium run (Playwright 1.64.1, this Windows PC) opened the deployed build at https://rehearsal.midknight-ent-llc.workers.dev with no stored site data and no login, clicked `Try the community fair`, ran the baseline against the extra check-in desk for 30 paired runs, and recorded every request the page made. All 21 were GET requests to that same address: the page, its scripts and style sheet, the simulation worker script and the three example scenario files. None went to another address and none sent a request body. The simulation ran in the browser, on that page's own worker. The list is in `docs/acceptance/2026-11-17-release.md`.

What this does not cover: the inspection did not import a workbook or export a file on the deployed address. The site is a static host, which still receives ordinary page requests for its own files. This is one run on one browser, not an audit.

## Tests with users

The app was not tested with users. No organizer walkthrough has been logged, so this README makes no claim about demand or time saved.

## Status of claims

Performance figures, accessibility and privacy statements are targets until a recorded check backs them. Measured performance readings, with the machine and browser named, are in `docs/performance.md`. Accessibility is a WCAG 2.2 AA target; conformance is not claimed.

## Licence and notices

Rehearsal is released under the MIT licence: see [LICENSE](LICENSE). Third-party packages and their licences are listed in [docs/third-party-notices.md](docs/third-party-notices.md).
