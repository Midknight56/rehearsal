---
name: simulation-rules
description: Rules of the Rehearsal event queue simulation. Use when you run the app, read a run or a paired comparison of two staffing plans, or write about its numbers. Covers units, seeded runs, the model limits and what may be claimed.
---

# Rehearsal simulation rules

Rehearsal runs a discrete event simulation of an event hall: attendees arrive, walk a grid path, wait in one line per station and are served. Two plans can be compared over 30 paired runs. Report only what the app shows.

## Units
- Inside the engine every time is an integer count of milliseconds. A position is a grid cell `[x, y]`, with x east and y south.
- Seconds are converted once, where input is checked, and never inside the engine. A service time is never 0 ms.
- To a user, say seconds for service and waiting, minutes for arrival windows, metres for distance and people for counts. Name the unit every time: `30.0 s`, `100.0%`, `2.67 h`.
- A value that cannot be computed shows as n/a. Never write 0 or NaN in its place.
- Staff hours are the sum of servers times the window in hours. No wage and no currency.

## Determinism
- The same scenario, the same seed and the same replication give the same result, byte for byte.
- The engine never reads the wall clock and never calls Math.random. Every random draw comes from a stream keyed by the seed, the replication, the attendee and the station.
- A key holds no scenario title, staffing level or processing order. So in a paired run both plans give the same attendee the same draws, and a difference comes from the change and not from luck.
- Playback speed, scrubbing and the camera never change a result.

## What the model says
These sentences are the app's own. Quote them as they are.
- One station is one service stage: a single FIFO line feeding identical parallel servers.
- A cohort follows its ordered station IDs, each at most once, then exits.
- Staffing is constant through a run.
- Queue capacity is unlimited and nobody leaves early.
- Walking is at one constant speed along the computed grid path.
- Service durations are constant or triangular.
- No personal space, congestion-dependent walking speed, doorway throughput, accessibility clearance, crowd pressure or collisions: queue sprites never block movement.
- The output of a run is a scenario result under these assumptions for one seed and one replication: scenario results, not a forecast.
- Limits: at most 5,000 attendees, 10 stations, 6 station visits per route, 80 × 80 cells, a 360-minute observation window, servers 1 to 20, 10 saved scenarios, a 2 MiB import file.
- Game view legend: Line colour shows simulated waiting, not measured crowd density.
- Not simulated: weather, staff breaks, scheduled staffing changes, emergency evacuation, live ticketing and spreadsheet formulas.

## What you may claim
- Every number is a scenario result under these assumptions. It is not a forecast, a prediction, a crowd density model, a safety finding or a capacity recommendation. Do not recommend a staffing level.
- The Harbor Hall Community Fair, its 120 attendees and its service times are fictional and illustrative. Do not call them measured or typical.
- A paired comparison gives a mean change and a range across the 30 runs, labelled variation across these simulated runs. It is not a confidence interval. Quote the run counts only as the app states them.
- When the two plans admit different people, the app turns off person for person wording. Say that the groups differ.
- A result marked Stale, rerun belongs to an older scenario. Say so and rerun it.
- If a run reports a drain cap, say that the averages come from the people who finished.
- Make no claim about demand or time saved: no user study backs one.
- Say what a tool returned. If a tool did not run, say that.

## Drive the app with the Playwright tools
The server is `playwright`. Ask the user for the address where the app runs. Use these tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_wait_for`, `browser_close`. Take one action per call and wait for each result, because two picks sent at once once left both sides on the same plan.

1. `browser_navigate` to the app address, then `browser_snapshot`.
2. `browser_click` the button Try the community fair. The three example plans open as tabs.
3. `browser_click` the button Simulate. Wait with `browser_wait_for` until the run finishes, then `browser_snapshot` to read the result tables.
4. `browser_click` the Compare tab in the Screens navigation.
5. `browser_click` the toggle named `Use as baseline: Harbor Hall Community Fair: baseline`. When Compare first opens, this plan is the candidate and the extra staff plan is the baseline, so the name starts with Use as.
6. `browser_click` the toggle named `Use as candidate: Harbor Hall Community Fair: extra check-in staff`.
7. `browser_click` Run comparison. It stays inactive while both sides are the same plan.
8. `browser_wait_for` the text `30 of 30 paired runs complete`.
9. `browser_snapshot`, then read the region named Headline: a sentence such as the change in mean queue wait in seconds, and a line with the number of runs in which it was lower, out of 30. Also read the metric cards, which show Baseline, Candidate and n.
10. `browser_close`.

Report the headline and the run counts word for word, with the units, the scenario hash shown on the screen and the line scenario results, not a forecast.
