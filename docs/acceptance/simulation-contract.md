# Acceptance record: simulation-contract

This is Kiro's own record of its own work, written on 2026-11-16 in Kiro CLI 3.3.0 (model auto). It is not an independent review. Each line names the matrix row, the test file of the design's unit-fixture table, and the line that `npx vitest run tests/model/<file>` printed when that file was run alone on this working tree. The model's results are scenario results, not a forecast; the Harbor Hall numbers are fictional and illustrative.

| Matrix row | Test file | Vitest line |
| --- | --- | --- |
| 1 (one server, three arrivals) | `tests/model/scheduler.test.ts` | `Tests  3 passed (3)` |
| 1 through `simulate` | `tests/model/simulate.test.ts` | `Tests  9 passed (9)` |
| 2 (two servers) | `tests/model/scheduler.test.ts` | `Tests  3 passed (3)` |
| 2 through `simulate` | `tests/model/simulate.test.ts` | `Tests  9 passed (9)` |
| 3 (equal-time arrivals in id order) | `tests/model/scheduler.test.ts` | `Tests  3 passed (3)` |
| 3 through `simulate` | `tests/model/simulate.test.ts` | `Tests  9 passed (9)` |
| 4 (breadth-first paths, Harbor Hall walking values, path cache key) | `tests/model/spatial.test.ts` | `Tests  6 passed (6)` |
| 5 (triangular sampler, `toDurationMs`, no draw for constant service) | `tests/model/sampler.test.ts` | `Tests  4 passed (4)` |
| 6 (service running at closing) | `tests/model/horizon.test.ts` | `Tests  2 passed (2)` |
| 7 (drain cap) | `tests/model/horizon.test.ts` | `Tests  2 passed (2)` |
| 8 (attendee ids and arrivals) | `tests/model/arrivals.test.ts` | `Tests  4 passed (4)` |
| 9 (common random inputs) | `tests/model/common-random.test.ts` | `Tests  3 passed (3)` |
| 10 (determinism, engine half) | `tests/model/determinism.test.ts` | `Tests  6 passed (6)` |
| 11 (nothing to measure) | `tests/model/empty.test.ts` | `Tests  2 passed (2)` |
| 11 (p95 index, dash and unit formatting) | `tests/model/metrics.test.ts` | `Tests  9 passed (9)` |
| 12 (properties P0 to P16, 200 runs each) | `tests/model/properties.test.ts` | `Tests  18 passed (18)` |
| 17, worker side (handler and adapter with a fake worker, Vite build chunk) | `tests/model/worker.test.ts` | `Tests  16 passed (16)` |

Notes that bear on how far these lines can be read:

- Property P12 was narrowed once: the null rule for `ms` metrics with `n` 0 does not apply to the `closingWindow` population, because `busyMs` of an idle station is a defined 0 ms. The reproducer stays in `tests/model/failing-seeds.json`, and the change is in the log row of task 12.
- The adapter test uses a fake worker. Matrix row 17 on a real browser worker, and the playback half of row 10, belong to `scenario-editor-and-replay` and have not been run.
- The timings in `docs/kiro-log.md` are observations on this PC, not performance claims.
