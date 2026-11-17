# Rehearsal

Rehearsal is our Frankenstein entry. It stitches together a chimera of technologies into one app: a spreadsheet import, a grid floor plan editor, a discrete event queue simulation and a 2D game engine replay. Bringing these seemingly incompatible elements together builds something unexpectedly powerful: a dress rehearsal for the line at your event's door, where two staffing or layout choices can be compared before the day. Kiro wrote the code through spec driven development, from three specs, in the Kiro CLI.

Category: Frankenstein.

Video: https://youtu.be/uZS-yUdA6-I

## Judging criteria at a glance

**Potential Impact.** Volunteers who run a community fair, a school open day or a registration desk guess at staffing and find out on the day, with a line out the door. Rehearsal lets them type or import their arrivals and stations, see the line form, and test a change first. On the bundled Harbor Hall example, one more desk at check in cuts the mean queue wait by 297.4 s over 30 paired runs, and all 30 runs improve. It runs in the browser with no account. A keyboard journey test walks the main path with no mouse, the replay has a reduced motion mode, and body text contrast is 10.47:1 (printed by `tests/ui/styles.test.ts`, which needs 4.5:1).

**Technological Implementation.** Kiro wrote the code from three specs (`.kiro/specs/simulation-contract`, `scenario-editor-and-replay`, `paired-comparison-and-release`), each reviewed by Kiro before its tasks ran. Five steering files fix units, determinism, claims and accessibility. Two hooks run the checks (`verify-on-stop`, `model-tests-on-save`). A custom agent, `.kiro/agents/rehearsal-playwright.json`, drove the dev build through the Playwright MCP server and read the comparison result back. The specs name 32 correctness properties, tested with `fast-check` in 13 test files. Every task has a row in `docs/kiro-log.md` (67 rows) with its files and its check result. Tests: 281 model, 494 UI and 150 browser tests pass.

**Design.** A complete product, not a demo: landing page, Plan screen, import with a row by row preview, floor plan with drag, Game view replay with follow and find, Compare screen, saved scenarios, JSON open and save, CSV and workbook export, a printable comparison and a run sheet for the day. Every limit of the model is shown next to the results, in plain words. Screens are in `docs/acceptance/img/`.

**Innovation/Idea.** A queue model usually lives in a spreadsheet or a specialist tool, and a game engine usually draws a game. Here the spreadsheet is the input, the floor plan is the model, and the game engine replays one simulated run person by person, so an organizer sees why a line forms. Paired runs (the same random draws for both choices) make a small change show up clearly.

**Presentation.** Open the app, click `Try the community fair`, press `Simulate`, then `Compare` the baseline with the extra desk at check in. The whole path needs no data of your own. First load to a usable example measured 2,035 ms on a throttled network profile (`docs/performance.md`).


Results are scenario results under the stated assumptions, not a forecast. The Harbor Hall Community Fair example, its 120 attendees and its service times are fictional and illustrative.

## How Kiro was used

**Kiro IDE, CLI, Web, Crew.** Every code task ran in the Kiro CLI 3.4.0 with model Auto: one written prompt per task, with no person at the keyboard during a run. Each run has a row in `docs/kiro-log.md` (67 rows) with the files touched, the check command, its result and the credit pool before and after. We did not use Kiro Web or Crew, and we did not compare the CLI with the IDE in this build.

**Custom agents.** One custom agent, `.kiro/agents/rehearsal-playwright.json`, made in the Kiro CLI (`kiro-cli agent validate` passed, and `kiro-cli agent list` shows it). It may use only the Playwright MCP server. It opened the dev build, ran the comparison with 13 browser tool calls and read the result back: `Station "Check-in desk": servers 1 → 2`, mean change -297.4 s. That gave a check of the whole journey by Kiro itself, apart from our own browser test suite.

**Agent hooks.** Two hooks. `verify-on-stop` runs `npm run verify` (typecheck, engine tests, build) when the agent stops. `model-tests-on-save` runs the engine tests when a file under `src/simulation/` or `src/spatial/` is saved. The log of the first CLI run shows Kiro reading the hook output and naming its 83 expected failures, so each task started from the real test state.

**Spec driven development.** Three specs, each in three files: `requirements.md`, `design.md` and `tasks.md`. `simulation-contract` is the engine: the scenario type, validation, the event heap, grid paths, keyed random streams and the ten metrics. `scenario-editor-and-replay` is every screen, the import, the floor plan and the game view. `paired-comparison-and-release` is the paired runs, the exports and the release checks. Requirements are numbered user stories with acceptance criteria written as THE SYSTEM SHALL statements (182 in all). Each design ends with its correctness properties. Each task names its files and a Verify command, and a task ends only when that check passes. Kiro reviewed each spec before its tasks ran and applied the findings it agreed with. Against vibe coding: we did not build a vibe coded version to compare. The nearest thing we have is the late visual design work, which ran as plain written prompts outside the specs. Two of those four runs were fix runs for faults we found in screenshots, while the spec tasks carried their checks with them.

**Steering docs.** Five files, all always included. `units-and-determinism.md` fixes the units, the one ordering rule and the random keys, and forbids the wall clock in the engine. `model-limits.md` holds the limit sentences the app must show. `claims-policy.md` says what the product may claim. `accessibility.md` holds the keyboard, focus, motion and contrast rules. `revision-2026-11-16.md` holds the version and naming rules. The rule that made the biggest difference was the wall clock ban: a test scans the engine folders for it, and the same run at 1 times and at 16 times speed gives byte identical results.

**MCP.** The Playwright MCP server (`.kiro/settings/mcp.json`, headless and isolated) let Kiro click through the real build and read the screen back, which a text only run cannot do. The custom agent above used it for the comparison journey.

**Property based testing (PBT).** The specs name 32 correctness properties, and 13 test files check them with fast check. A failing seed is saved and replayed first on every later run. On its first run, property P12 found a case where the design text and the engine disagreed about an idle station; the design sentence was narrowed and the seed stays in the file. We enabled PBT for the engine rules (conservation of guests, queue order, the metric bounds) and for the comparison rules (pairing, summary bounds).

**Kiro powers.** Not used in this build.

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

On 2026-11-17 a headless Chromium run (Playwright 1.64.1, this Windows PC) opened the deployed build at https://rehearsal.midknight-ent-llc.workers.dev with no stored site data and no login, clicked `Try the community fair`, ran the baseline against the extra check-in desk for 30 paired runs, and recorded every request the page made. All 28 were GET requests to that same address: the page, its scripts and style sheet, its seven bundled font files, the simulation worker script and the three example scenario files. None went to another address and none sent a request body. The simulation ran in the browser, on that page's own worker. The list is in `docs/acceptance/2026-11-17-release.md`.

What this does not cover: the inspection did not import a workbook or export a file on the deployed address. The site is a static host, which still receives ordinary page requests for its own files. This is one run on one browser, not an audit.

## Tests with users

The app was not tested with users. No organizer walkthrough has been logged, so this README makes no claim about demand or time saved.

## Status of claims

Performance figures, accessibility and privacy statements are targets until a recorded check backs them. Measured performance readings, with the machine and browser named, are in `docs/performance.md`. Accessibility is a WCAG 2.2 AA target; conformance is not claimed.

## Licence and notices

Rehearsal is released under the MIT licence: see [LICENSE](LICENSE). Third-party packages and their licences are listed in [docs/third-party-notices.md](docs/third-party-notices.md).
