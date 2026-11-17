# Replay test fixtures

The trace fixtures use the engine's own trace vocabulary (`src/simulation/trace.ts`). Each file holds `layout`,
`stations`, `walkSpeedMps`, `completion`, `unfinished` and `trace`.

Events, with the fields each carries beyond `kind`, `timeMs` and `attendeeId`:

| `kind` | Meaning | Extra fields |
| --- | --- | --- |
| `arrive` | external arrival at the entrance | none |
| `depart` | leaves a node on a path | `from`, `to`, `pathId`, `arriveMs` |
| `join` | joins the line at a station after walking | `stationId`, `position` (index in the line before dispatch) |
| `start` | service starts | `stationId`, `server` (0-based), `waitMs` |
| `complete` | service ends | `stationId`, `server` |
| `exit` | reaches the exit | none |
| `cap` | the drain cap was reached (no `attendeeId`) | none |

## `fixtures/three-people.json`

Layout 10 x 3, `cellSizeM` 0.5, entrance (0,1), exit (9,1), one station `desk` ("Desk", cell (4,1), 1 server, constant
3 s), walk speed 1 m/s. `paths`: id 0 entrance to desk (cells (0,1) to (4,1), 4 edges, 2 m, 2,000 ms) and id 3 desk to
exit (cells (4,1) to (9,1), 5 edges, 2.5 m, 2,500 ms). Three attendees `a#0000`, `a#0001`, `a#0002`, 21 events (7 each:
`arrive`, `depart` on path 0, `join`, `start`, `complete`, `depart` on path 3, `exit`) and 6 segments.

| Attendee | arrive | join (position) | start (waitMs) | complete | exit |
| --- | --- | --- | --- | --- | --- |
| `a#0000` | 0 | 2,000 (0) | 2,000 (0) | 5,000 | 7,500 |
| `a#0001` | 1,000 | 3,000 (0) | 5,000 (2,000) | 8,000 | 10,500 |
| `a#0002` | 2,000 | 4,000 (1) | 8,000 (4,000) | 11,000 | 13,500 |

## `fixtures/unfinished.json`

One attendee `a#0000` with `arrive`, `depart`, `join` and `start` events, no later event for it, then a `cap` event at
7,201,000 ms. `completion` is `drain-capped` and `unfinished` is `['a#0000']`.
