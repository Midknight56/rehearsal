# Model contract

This file states what the Rehearsal engine computes and how. It is written from `src/domain`, `src/simulation`, `src/spatial` and `src/workers` and from `.kiro/specs/simulation-contract/`. Where this file and the code differ, the code and its tests are the record and this file is the defect.

Every output of the engine is a scenario result under the assumptions below, for one seed and one replication. It is scenario results, not a forecast. It is not a prediction, a crowd-density model, a capacity recommendation or a safety finding.

What the model does not simulate: personal space, congestion-dependent walking speed, doorway throughput, accessibility clearance, crowd pressure, collisions (queue sprites never block movement), emergency evacuation, weather, abandonment (nobody leaves a line), staff breaks, scheduled staffing changes and spreadsheet formula evaluation.

The Harbor Hall Community Fair, its 120 attendees, the 8/15/22 s and 6/10/14 s service assumptions and every number derived from them are fictional and illustrative. They are not measured, observed or typical.

## Units

- Display units: minutes for arrival windows, seconds for service, metres for distance, people for counts.
- Internal time is integer milliseconds (`horizonMs`, `startMs`, `endMs`, every timestamp and duration in results). Positions are integer grid cells `[x, y]` with `x` east and `y` south, and an explicit `cellSizeM` (default 0.5).
- Seconds become milliseconds in one place, `toDurationMs(seconds) = Math.max(1, Math.round(seconds * 1000))` in `src/domain/validate.ts`, so no service lasts 0 ms. The engine never converts units. A value whose millisecond form is not a safe integer is rejected (`UNSAFE_MS`).
- Distance is `edgeCount * cellSizeM`. Walking duration is `Math.ceil(distanceM / walkSpeedMps * 1000)`. A path from a cell to itself has 0 edges, 0 m and 0 ms.
- Harbor Hall baseline walking segments are 4,167 / 10,000 / 17,500 ms (38 m per attendee) and the shorter route 4,167 / 3,334 / 7,500 ms (18 m). They are hand-calculated and tested directly in `tests/model/spatial.test.ts`.
- Labels name their unit: `30.0 s`, `100.0%`, `2.67 h`, `4,167 ms`. Staff-hours are `sum(servers) * H / 3,600,000` with no wage or currency.

## Scenario schema and limits

`Scenario` (`src/domain/scenario.ts`): `schemaVersion` (1), `id`, `revision`, `title`, `modelVersion`, `baseSeed`, `horizonMs`, `layout` (`cols`, `rows`, `cellSizeM`, `blockedCells`, `entrance`, `exit`), `walkSpeedMps`, `stations` (`id`, `label`, `cell`, `servers`, `service`), `cohorts` (`id`, `startMs`, `endMs`, `count`, `arrivals`, `route`) and `notes`. `service` is `{ kind: 'constant', seconds }` or `{ kind: 'triangular', minS, modeS, maxS }`.

One station is one service stage: a single FIFO line feeding identical parallel servers. A cohort follows its ordered station IDs, each at most once, then exits. Staffing is constant through a run. Queue capacity is unlimited and nobody leaves early. Walking is at one constant speed along the computed grid path.

Limits (`src/domain/limits.ts`): 5,000 attendees, 10 stations, 6 station visits per route, 80 × 80 cells, a 21,600,000 ms (360-minute) observation window, servers 1–20, service at most 86,400 s, IDs and `baseSeed` 1–64 characters.

`validateScenario(input)` never throws and never mutates its input. It returns every issue found, each with a `path`, or `ok: true` with `warnings`. A `modelVersion` that differs from `MODEL_VERSION` is valid and gives one `MODEL_VERSION_MISMATCH` warning. Five passes: shape and finite numbers, identifiers and limits, values and cohorts, geometry, reachability. A shape or `NON_FINITE` defect stops validation after pass 1.

Error messages (`MESSAGES` in `src/domain/validate.ts`; angle brackets are substituted):

| Code | Message |
| --- | --- |
| `SCHEMA_VERSION` | `Unsupported schemaVersion <v>; this build reads version 1.` |
| `MODEL_VERSION_FORMAT` | `modelVersion must look like 0.1.0; got "<v>".` |
| `SEED_FORMAT` | `Base seed must be 1–64 characters and must not contain "\|".` |
| `ID_FORMAT` | `<Station\|Cohort> id "<id>" must be 1–64 characters and must not contain "\|" or "#".` |
| `DUPLICATE_ID` | `Duplicate <station\|cohort> id "<id>".` |
| `HORIZON_RANGE` | `Observation window must be a whole number of milliseconds between 1 and 21,600,000 (6 hours); got <v>.` |
| `GRID_SIZE` | `Grid must be a whole number of cells, between 1 × 1 and 80 × 80; got <cols> × <rows>.` |
| `CELL_SIZE` | `Cell size must be a positive number of meters; got <v>.` |
| `WALK_SPEED` | `Walking speed must be a positive number of meters per second; got <v>.` |
| `CELL_OUT_OF_BOUNDS` | `<Entrance\|Exit\|Station "<id>"\|Blocked> cell (<x>,<y>) is outside the <cols> × <rows> grid or has a coordinate that is not a whole number.` |
| `CELL_BLOCKED` | `<Entrance\|Exit\|Station "<id>"> cell (<x>,<y>) is blocked.` |
| `DUPLICATE_BLOCKED_CELL` | `Blocked cell (<x>,<y>) is listed more than once.` |
| `SERVERS_RANGE` | `Station "<id>": servers must be a whole number from 1 to 20; got <v>.` |
| `SERVICE_RANGE` | `Station "<id>": service seconds must be greater than 0 and at most 86,400; got <v>.` or `Station "<id>": triangular service needs 0 < min ≤ mode ≤ max (seconds, at most 86,400); got <min>/<mode>/<max>.` |
| `COHORT_WINDOW` | `Cohort "<id>": start and end must be whole milliseconds, start at or after 0 and before end, and end at or before the horizon; got start <s> ms, end <e> ms, horizon <h> ms.` |
| `COUNT_RANGE` | `Cohort "<id>": count must be a whole number of 0 or more; got <v>.` |
| `ARRIVAL_PATTERN` | `Cohort "<id>": arrival pattern must be "even" or "uniform"; got "<v>".` |
| `ROUTE_LENGTH` | `Cohort "<id>": route has <n> visits; the limit is 6.` |
| `ROUTE_UNKNOWN_STATION` | `Cohort "<id>": route names unknown station "<sid>".` |
| `ROUTE_REPEAT` | `Cohort "<id>": route visits station "<sid>" more than once.` |
| `ATTENDEE_LIMIT` | `Total attendees <n> exceed the limit of 5,000.` |
| `STATION_LIMIT` | `<n> stations exceed the limit of 10.` |
| `NON_FINITE` | `<path> must be a finite number; got <v>.` |
| `UNSAFE_MS` | `Walking duration between <endpoint> and <endpoint> is <v> ms, beyond the largest safe integer; reduce the cell size or raise the walking speed.` |
| `UNREACHABLE` | `No walkable path between <endpoint> and <endpoint>.` with endpoints such as `entrance (0,12)`, `exit (0,4)`, `station "packs" (34,12)` |
| `SCHEMA_SHAPE` | `<path> is missing or has the wrong type.` (added beyond the design table, for a wrong type or a missing field) |

## Attendee identity and arrivals

- Attendee IDs are `${cohortId}#${ordinal}` with the zero-based ordinal padded to four digits (`doors#0000` to `doors#0119`). IDs are never renumbered after sorting.
- Even arrivals: `startMs + Math.round((j + 0.5) * (endMs - startMs) / count)`, clamped inside `[startMs, endMs - 1]`.
- Uniform arrivals take one draw `u` per attendee: `startMs + Math.floor(u * (endMs - startMs))`.
- All attendees are sorted by `(arrivalMs, attendeeId)` in code-unit order. Every `arrivalMs` lies in `[startMs, endMs)`, and external arrivals are admitted only below `H`.

## Random streams and sampling

- Every draw comes from `createGenerator(key)` in `src/simulation/random.ts`, the only file that imports `seedrandom`. The key is `${baseSeed}|${replication}|${attendeeId}|${stationId}|service` for a service duration and `${baseSeed}|${replication}|${attendeeId}|arrival` for an arrival.
- A key never contains the scenario `id`, `revision`, `title`, hash, a cell position, a `servers` value or the processing order. Corresponding attendees therefore receive corresponding draws when a scenario changes (common random inputs).
- Constant service, or triangular with `minS === maxS`, takes no draw.
- Triangular `(a, c, b)` by inverse sampling: `a + sqrt(u * (b - a) * (c - a))` when `u ≤ (c - a) / (b - a)`, else `b - sqrt((1 - u) * (b - a) * (b - c))`. For `(10, 20, 30)` at `u = 0.125, 0.5, 0.875` this gives 15, 20 and 25 s before conversion. Every duration passes through `toDurationMs`.

## Scheduler order

- Events live in a binary min-heap ordered by `(timeMs, kindPriority, attendeeId, sequence)`. Service completion has priority 0, movement arrival 1 and external arrival 2. `attendeeId` is compared in code-unit order and `sequence` is a per-run counter.
- At each timestamp every equal-time event is applied, including zero-length transfers pushed during the batch, before any queue is dispatched. Then stations are visited in code-unit order of `id`, and each line is served in `(queueJoinMs, attendeeId)` order on the lowest-numbered free server. Because service lasts at least 1 ms, a dispatch never creates an event at the current time.
- Elapsed model time comes only from the event heap. Nothing in `src/domain`, `src/simulation` or `src/spatial` reads a wall clock, `Math.random` or a frame time (`tests/model/purity.test.ts`).

## Horizon and drain

- `H` is `horizonMs`. External arrivals are admitted only below `H`. A service completion at exactly `H` is applied.
- The run drains to `H + DRAIN_CAP_MS`, with `DRAIN_CAP_MS = 7,200,000` (`src/domain/limits.ts`). An event at the cap is applied and a later one is not.
- Past the cap, `completion` is `'drain-capped'`, `unfinished` lists the attendee IDs still in the system in code-unit order, a `cap` event ends the trace, and every completion-conditioned metric carries `conditioned: true` with the note `from <n> of <admitted> admitted attendees; <k> unfinished at the drain cap`. Otherwise `completion` is `'complete'`.

## Grid paths

- Breadth-first search over four-neighbour unblocked in-bounds cells, with neighbours enqueued north, east, south, west and the parent recorded on first discovery, so equal-length ties resolve the same way on every run.
- Paths are computed once per layout by `createPathCache`. Its `key` is the stable JSON of the layout (blocked cells sorted by `x` then `y`), the stations' `(id, cell)` pairs sorted by `id` and `walkSpeedMps`. The same blocked cells in any order give the same key.
- Path ids are assigned in node order: entrance, stations by `id`, exit, then by ordered pair. An unreachable pair is the validation issue `UNREACHABLE`, and `simulate` is never entered with it.

## Metrics

Every metric is a `MetricValue { value, unit, population, n, conditioned, note }`. `unit` is `count`, `ms`, `ratio`, `people` or `hours`. `population` is `admitted`, `completedJourney` or `closingWindow`. An undefined mean, total or percentile has `value: null` and shows `—` (U+2014), never `NaN`, `Infinity`, `undefined` or a fabricated 0. p95 is the ascending-sorted element at index `Math.ceil(0.95 * n) - 1`.

The ten definitions of plan section 7 (verbatim):

| Metric | Definition |
| --- | --- |
| Completed by closing | Attendees whose exit time is ≤ H |
| Still active at closing | Arrived before H but not exited by H; split walking / waiting / in service |
| Total queue wait | Sum of `serviceStart - queueJoin` across an attendee's visits; excludes walking and service |
| Mean / p95 queue wait | Across the defined attendee population; p95 is sorted element `ceil(0.95 * n) - 1`; N shown |
| Total journey time | Exit minus external arrival, when complete |
| Mean walking time | Sum of route walking durations per admitted attendee |
| Station utilization | Busy-server milliseconds clipped to [0, H] / (`servers * H`) |
| Average queue length | Time integral of the settled waiting count over [0, H] / H |
| Maximum queue length | Maximum waiting count after equal-time events and immediate dispatch have settled |
| Staff-hours | `sum(servers) * H / 3,600,000`; no wage or currency assumption |

Additions of this contract: per-station `busyMs` and `served`, and overall `queues.averageLength` and `queues.maxLength` over the sum of all waiting counts. `busyMs` for an idle station is a defined 0 ms (population `closingWindow`), not a dash. When `completion` is `'drain-capped'`, a shorter mean from completed people is not an improvement for everyone.

## Trace

`simulate(scenario, replication, { trace, scenarioHash })` returns a `trace` only when `trace` is `true`. The trace is `{ version: 1, paths, attendees, events, segments }`:

- `paths`: the cached paths referenced by at least one segment, in `id` order.
- `attendees`: sorted by `(arrivalMs, id)`, each with `cohortId`, `arrivalMs` and `exitMs` (`null` when unfinished).
- `events`: in processing order, of kinds `arrive`, `depart`, `join`, `start`, `complete`, `exit` and `cap`.
- `segments`: movement segments `(attendeeId, startMs, endMs, pathId)`. The trace never stores per-millisecond positions.

Bounds per attendee: at most `3 + 4 * visits` events and `visits + 1` segments, so at most 135,000 events and 35,000 segments for 5,000 attendees with 6 visits. The same scenario, seed and replication give byte-identical `JSON.stringify(result)`, also after a JSON round trip.

## Worker protocol

- `ToWorker`: `run { runId, scenario, replications, trace }` and `cancel { runId }`. `FromWorker`: `progress { runId, done, total }`, `result { runId, replication, result }`, `cancelled { runId }` and `error { runId, message }`. Both directions are checked with zod (`src/workers/protocol.ts`); the `FromWorker` check is at envelope level.
- The worker validates the scenario, computes `scenarioHash` once per run, runs the replications in order with a yield to the event loop between them, posts each `result` at once and `progress` at most once per `PROGRESS_INTERVAL_MS = 200`. An invalid scenario gives `error` with the first issue's message plus ` (+<k> more)`. A throw gives `Simulation failed: <message>`. A message without a numeric `runId` gives `error { runId: 0, message: 'Malformed worker message.' }`. The worker never terminates itself.
- A `cancel` for an active run is remembered in a set of run IDs and acknowledged with `cancelled` before the next replication, so a later `run` or `cancel` cannot hide it.
- The adapter (`src/workers/client.ts`) increments `currentRunId` on every `run()` with a non-empty replication list and on every `cancel()`, discards a `progress`, `result` or `error` for any other `runId` and counts it in `discardedMessages` (an `error` with `runId` 0 resolves the current run as `Malformed worker message.`). A `cancel` not acknowledged within `CANCEL_DEADLINE_MS = 250` terminates and recreates the worker. `onerror` and `onmessageerror` resolve the pending run as `The simulation worker stopped unexpectedly: <reason>.`.
- `simulate` runs only inside the worker, never on the main thread.

## Model version history

`MODEL_VERSION` is in `src/simulation/version.ts`. It changes in the same commit as any change to generator keys, the triangular formula, `toDurationMs`, heap order, batch-then-dispatch, line order, server selection, horizon or cap handling, the BFS tie-break, the distance or duration formulas or any metric definition, and `public/examples/harbor-hall/expected.json` and the three scenario files are regenerated in that commit with `UPDATE_EXPECTED=1`.

| Version | Date | Note |
| --- | --- | --- |
| `0.1.0` | 2026-11-16 | R1 acceptance |
