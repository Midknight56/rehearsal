# Landing preview: requirements

The landing screen shows the product working. The community fair replay plays in the game view on the landing, with a result line beside it. Both come from the real engine. Nothing is typed in.

## 1. A judge sees the replay at once
User story: as a judge opening the app, I want to see people walk and queue on the first screen, so that I know what the product does before I click.

1. WHEN the landing shows with a preview, THE SYSTEM SHALL load the bundled Harbor Hall files with `loadExample`, run replication 0 of the baseline with a trace on the simulation client, and play it in the game view at 1x from simulated time 0, with no sound.
2. THE SYSTEM SHALL show the first moving frame within 2,000 ms of the landing showing, measured in headless Chromium, and the measured milliseconds SHALL be printed in the test output.
3. WHEN reduced motion applies (`isReducedMotion` over the prefs and the system setting), THE SYSTEM SHALL show one still frame: the clock paused at 05:00 simulated time, with nothing moving.

## 2. A judge sees what changed
User story: as a judge, I want one sentence that says what the second scenario changes, so that the replay has a point.

1. WHEN the replay is loaded, THE SYSTEM SHALL run the existing paired comparison of the baseline against `plus-one-checkin` (30 runs) and build the result line with `compareHeadline`, for example `One more check-in desk cuts the mean wait by 297.4 s. Lower in 30 of 30 paired runs.`
2. THE SYSTEM SHALL take the number and the counts from the run and SHALL NOT type them in.
3. IF the paired run fails or is cancelled, THEN THE SYSTEM SHALL NOT show the result line and SHALL keep the replay playing.
4. THE SYSTEM SHALL show the existing labels `Replay of replication 0, one example run` and `Scenario results, not a forecast.` and the legend `Line colour shows simulated waiting, not measured crowd density.`, and SHALL say the fair is fictional and illustrative. THE SYSTEM SHALL NOT use a dash between words in any text.

## 3. The landing keeps its job
User story: as a keyboard user, I want the landing to work as before, so that the preview costs me nothing.

1. THE SYSTEM SHALL keep the heading `Rehearsal`, the two text lines and the buttons `Try the community fair`, `Import a spreadsheet or CSV`, `Open a scenario JSON`, `Open a saved scenario`, in that order, with `Try the community fair` the first Tab stop.
2. WHEN `Try the community fair` is activated, THE SYSTEM SHALL reuse the files the landing already fetched, so the page makes exactly three requests under `/examples/`.
3. WHEN a fetch fails, THE SYSTEM SHALL show the existing failure status text on activation and keep the landing.
4. THE SYSTEM SHALL give the game canvas an accessible name and a short text alternative, and SHALL NOT make it a focus stop.

## 4. The preview is injectable and leaves nothing behind
User story: as a maintainer, I want to test the landing without an engine or a canvas, so that unit tests stay small.

1. WHEN `Landing` receives no preview prop, THE SYSTEM SHALL fetch nothing, run nothing and draw no preview.
2. THE SYSTEM SHALL accept an optional prop with the simulation client and the view creator, and `App` SHALL pass the real ones.
3. WHEN the landing unmounts, THE SYSTEM SHALL cancel its runs, stop the replay and destroy the view, leaving no worker run, ticker or canvas.

## 5. Layout
User story: as a phone user and a desktop user, I want the landing to fit my screen.

1. AT 360 by 640 and at 1920 by 1080, THE SYSTEM SHALL have no horizontal scroll, no overlap between landing parts, nothing clipped by the viewport edge, every button, link and form control at least 44 by 44 px with at least 8 px between neighbours, and all text at least 12 px.
2. THE SYSTEM SHALL keep the blackboard look, the tokens and a body text contrast of at least 4.5:1.

## 6. The preview shows people and a line at once
User story: as a judge, I want the first screen to show people walking and a line forming, so that the hall is never empty. Harbor Hall's 120 attendees arrive evenly over 20 simulated minutes, so the first minutes are empty. This requirement replaces the start time and speed of requirement 1.1 (simulated time 0 at 1x); everything else in requirement 1 stays.

1. WHEN the replay is loaded and reduced motion does not apply, THE SYSTEM SHALL seek the view to simulated time 04:00 (240,000 ms) before it first draws, set the speed to 4x, and play.
2. WHEN the view's clock callback reports a clock of 16:00 simulated (960,000 ms) or later, THE SYSTEM SHALL seek back to 04:00 and keep playing, so the clock never reads below 04:00 and the screen never ends on an empty or finished hall. The loop SHALL use the handle's own clock callback and SHALL NOT use a timer of its own; after unmount no callback SHALL act.
3. WHEN reduced motion applies, THE SYSTEM SHALL keep the still frame paused at 05:00 (requirement 1.3).
4. THE SYSTEM SHALL show the real clock and speed in the text under the canvas, in the existing wording pattern: `Simulated time 04:12, playing at 4×`. It SHALL keep `paused because motion is reduced` under reduced motion.
5. ONE second after the first moving frame, in headless Chromium, the game view SHALL have drawn at least 8 sprites and at least 5 attendees SHALL be waiting at the check-in desk by the sampler. Over 10 seconds of real time the clock SHALL pass 16:00 at least once without the page's clock reading below 04:00. The first moving frame SHALL stay under 2,000 ms, and the measurement SHALL still be printed.
6. THE SYSTEM SHALL take the two captures after the replay has run 3 seconds, and they SHALL show people as dots, a line at the check-in desk and the result line.