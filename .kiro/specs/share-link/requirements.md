# Share link: requirements

A person who has built or edited a plan can send it as a link, so nobody has to send a file. The link holds the whole scenario in its hash part, compressed and encoded in the browser. No server is involved and opening a link makes no request to any other address.

## 1. Copy a share link
User story: as an organizer on the Plan screen, I want a "Copy share link" button, so that I can paste my plan into a message.

1. THE SYSTEM SHALL show a button named `Copy share link` in the Plan screen toolbar, after `Export JSON` and `Save`.
2. WHEN `Copy share link` is activated and the link is at most 6,000 characters in all, THE SYSTEM SHALL write the link to the clipboard and set the status region to `Share link copied`.
3. THE SYSTEM SHALL build the link as the app address (origin, path and query, no hash), then `#plan=v1.`, then the base64url text (no padding) of the deflate-raw compressed UTF-8 JSON of the current tab's scenario. That scenario is the same one `Export JSON` writes under `scenario`, with no results.
4. IF the link would be over 6,000 characters in all, THEN THE SYSTEM SHALL copy nothing and set the status region to `This plan is too large to share as a link. Save it as a JSON file instead.`
5. IF the browser refuses the clipboard write, THEN THE SYSTEM SHALL set the status region to `The share link could not be copied. Save the plan as a JSON file instead.` and change nothing in the plan.
6. THE SYSTEM SHALL keep focus on the button after the copy, and SHALL write the status region only through `setStatus`.

## 2. Open a share link
User story: as a person who receives a link, I want it to open the plan, so that I can see and run it.

1. WHEN the page loads with a hash that starts with `#plan=`, THE SYSTEM SHALL decode it, validate it with the same parser as `Open JSON` (`parseScenarioExport`), and open the scenario on the Plan screen as one committed edit, as `Open JSON` does. Saved results are not part of a link.
2. WHEN the same kind of hash is set while the page is open (a `hashchange`), THE SYSTEM SHALL do the same.
3. WHEN the parser returns warnings (for example a model version difference), THE SYSTEM SHALL show the same review dialog as `Open JSON` (title, hash, model version, every warning verbatim, `Open` and `Cancel`) and open the plan only after `Open`.
4. WHEN there are no warnings, THE SYSTEM SHALL open the plan at once and set the status region to `Opened "<title>".`.
5. THE SYSTEM SHALL remove the hash from the address bar once it has been read, so a reload does not open the plan again.
6. THE SYSTEM SHALL ignore any other hash.
7. THE SYSTEM SHALL make no network request when it reads a link: no fetch, no script, no image.

## 3. A bad link stops safely
User story: as a person with a broken link, I want to be told why, so that I can ask for a new one.

1. IF the text after `#plan=` is not `v1.` followed by base64url text that inflates to JSON, or inflates to more than 2 MiB, or the hash is over 6,000 characters, THEN THE SYSTEM SHALL stay on the screen it is on and set the status region to `This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.`
2. IF the link has another version tag than `v1`, THEN THE SYSTEM SHALL set the status region to `This share link was made by a different version of Rehearsal, so no plan was opened.`
3. IF the JSON is not a scenario or the scenario is refused, THEN THE SYSTEM SHALL set the status region to `This share link holds a plan Rehearsal cannot open: <the parser message>`, and open nothing.
4. IN every case above THE SYSTEM SHALL not throw, and a fresh load stays on the landing screen.

## 4. Limits of what the link is
1. THE SYSTEM SHALL NOT claim the link is private or secure. Anyone who has the link can read the plan, and the link may stay in message and browser history.
2. THE SYSTEM SHALL NOT use a dash between words in any text a person reads.
