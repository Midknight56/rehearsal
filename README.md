# Rehearsal

Rehearsal imports an event's arrivals and stations from a workbook, lays them out on a floor plan, and replays a simulated run in a game view so two staffing or layout choices can be compared before the day.
<!-- criteria block goes here -->

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

Limits: at most 5,000 attendees, 10 stations, 6 station visits per route, 80 × 80 cells, a 360-minute observation window, servers 1–20, 10 saved scenarios, a 2 MiB import file.

Model version 0.1.0

Scenario results, not a forecast.

The model has no abandonment, staff breaks, scheduled staffing changes, weather, evacuation or crowd physics, and it recommends nothing. One replayed replication is an example run, not the average of the 30 paired runs.

## Tests with users

The app was not tested with users. No organizer walkthrough has been logged, so this README makes no claim about demand or time saved.

## Status of claims

Performance figures, accessibility and privacy statements are targets until a recorded check backs them. Measured performance readings, with the machine and browser named, are in `docs/performance.md`. Accessibility is a WCAG 2.2 AA target; conformance is not claimed.

## Licence and notices

Rehearsal is released under the MIT licence: see [LICENSE](LICENSE). Third-party packages and their licences are listed in [docs/third-party-notices.md](docs/third-party-notices.md).
