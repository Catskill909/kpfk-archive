# Design system — one look for the main side and the Discovery plugin

Started 2026-09-28, integration step 2 ([INTEGRATION-PLAN.md](INTEGRATION-PLAN.md)).
Every rule here applies to both sides of the app (main site `/` and Discovery `/discover`).

## Where the styles live

- **`public/styles.css`** — the one stylesheet: colours, type, spacing, buttons, popups,
  player. Both sides load it (Discovery via `/discover/styles.css`, same file).
- **`plugins/discovery/public/app.css`** — only what Discovery alone has (its `rv-*` classes).
  Shrinks as Discovery's sections move onto the main components (step 4).
- Until 2026-09-28 Discovery shipped `base.css`, an older copy of `styles.css` (every line was
  also in it). Removed in step 2a.

## Rule 1 — the player bar is always visible and usable (Paul, 2026-09-28)

While something is playing, the bottom player bar stays on screen and clickable on every page,
sheet and popup. Popups open **above** it and their dark overlay stops at its top edge. No
popup carries its own copy of the player. Every popup has a clear way back (close, or Back
for an inner page) and survives play, pause and changing episodes.

## Rule 2 — popups use their width (Paul, 2026-09-28)

No single column of stacked blocks with the right side empty. Buttons are sized to their
label. What the listener came for (Play) is near the top, never last.

- **Phone:** a compact header row — small artwork left; title, host and Play beside it —
  then the content.
- **Desktop (wide enough for two columns):** two columns — the show on the left, the
  broadcast or episode list and Play on the right. The live player already works this way
  and is the model.

## The popup audit (repeatable proof)

`tools/popup-audit/audit.cjs` opens every popup at phone (390 px) and desktop (1280 px) with
an episode playing, saves a screenshot of each, and measures whether the player bar is on
screen and clickable. How to run is in the file's header. Screenshots are the real evidence
for layout; the script's "empty right" number counts divider lines as content, so it misses
empty space beside short blocks.

### Baseline, 2026-09-28 (before step 2b)

Test copy with Discovery on, real feed and QIR, an episode playing.

| Popup | Player bar (phone / desktop) | Layout (from the screenshots) |
|---|---|---|
| Show sheet | covered by the sheet's own copy of the player / covered by the dark overlay | Desktop: art and title in the left 40%; links, "selected broadcast" and Play each stack full width, right 60% empty. Phone: large centred art takes half the sheet; **Play last and partly cut off** |
| Past episodes (inside the show sheet) | same as show sheet | list; fine |
| Schedule | ✅ visible and usable | list rows; fine |
| Live player | covered | ✅ two columns on desktop (the model); right third empty |
| Live "about this show" | covered | short text card |
| Side menu | covered | full-height panel |
| Donate / privacy | covered | framed page |
| Artwork lightbox | covered | full screen |
| Discovery show popup | covered (browser's built-in modal blocks the whole page) | five blocks stack before the episode list (label bar, description, big Play, heading, subheading); empty beside the title |
| Discovery episode popup | covered (same) | as show popup |
| Discovery transcript panel | ✅ visible and usable | side panel |

Result: **the player is usable in 2 of 11 popups.**

Not a bug, noted so it is not chased again: one audit run reported the live player open after
pressing the menu button. In isolation the menu opens correctly, playing or not; it was left
over from the script's run order.

### After step 2b, 2026-09-28

Same audit, same test copy: **the player bar is visible and clickable in all 22 checks** (11
popups × phone and desktop), up from 4 of 22. Checked by eye on the phone show sheet and the
Discovery show popup: the real bar sits at the bottom and each popup ends right above it.

Left for step 2c at the time: the show sheet's large centred artwork and low Play button; the
Discovery popup's stacked blocks before the episode list; the "Resumed at … / Start over"
notice floating over the bottom of the show sheet. All three addressed in 2c below.

Also confirmed on the live site after Paul's redeploy (podcasts.kpfk.org, 2026-09-28): all 8
main-side popups keep the player visible and clickable at phone and desktop (16 of 16).

### How rule 1 is built (step 2b)

- **Main side** — one block at the end of `public/styles.css` ("PLAYER FRAME"). While
  `body.has-player` is set (app.js, while the bar is up) and with `--player-h` (the bar's
  measured height): the bar sits above every overlay layer; every backdrop stops at the bar;
  phone bottom sheets end where the bar begins; desktop cards centre in the space above it.
  This generalises what the schedule already did.
- **The show sheet's copy of the player** is hidden (`.sheet-player-dock`). Its markup and
  app.js wiring are removed in step 3, which reworks the player code.
- **Discovery** — its detail popup opens with `dialog.show()` instead of `showModal()`: a
  modal dialog sits in the browser's top layer, above everything including the player, and
  nothing can go over it. `refreshScrollLock()` in `plugins/discovery/public/app.js` now does
  what the modal did (dim the page via `body.detail-open`, make the page behind inert);
  Escape closes it; `app.css` positions it above `--player-h`. Side effect, wanted: keyboard
  users can Tab to the player while this popup is open.
- **Offline guard** — `test/pacifica/player-frame.test.js` (in `npm test`) fails if any
  backdrop or popup on the page is missing from the player-frame rule, if the bar is not
  the top layer, or if Discovery uses `showModal()` again. Shown to fail against the code
  before 2b (4 of 4 failing) and pass after.

### How rule 2 is built (step 2c: show sheet and Discovery popup)

> **Superseded for the show sheet on 2026-09-29** by the Show view (next section). The Discovery
> popup notes below still apply.

- **Show sheet, desktop** (`styles.css`, "POPUP LAYOUT" block): two columns. The body (art,
  title, host, Past episodes, description, links; still the one scroll area) on the left; the
  selected broadcast and Play/Pause become a 280 px right-hand column instead of a strip
  under everything. The "Past episodes" view empties the footer, so `:has()` keeps that view
  one column. The scroll hint is centred under the left column. Card height 382 → ~270 px.
- **Show sheet, phone:** compact header row, 88 px art left and the titles left-aligned
  beside it (was a ~184 px centred tile). Card height 571 → ~390 px: the selected broadcast and
  Pause are on screen above the player bar instead of cut off.
- **Discovery popup** (`plugins/discovery/public/app.js` paintDetail + `app.css`): Play
  moves into the header under the title; the two headings over the list become one line
  ("10 episodes · newest first"). Desktop: 960 px wide, two columns, the show side (art,
  title, Play, description) kept in view while the episode list or episode notes scroll
  beside it. Phone: one column, Play in the header row, the list right after it.

**Bug found and fixed in 2c (introduced in 2b).** The show sheet's own Play/Pause hid itself
whenever the in-sheet player copy held that episode (`btn.hidden = loadedInDock`, app.js).
Hiding the copy in 2b left the sheet with no Pause of its own while that episode played. Swept
every other dependent on the copy (the "instead" hint follows the real bar and is right; the
`has-sheet-player` class only sets padding): this was the only one. The line and its helper are
removed. The popup audit now also reports **play control**: every popup showing an episode must
have its own Play/Pause that is *tappable* (drawn, and what a tap at its centre reaches).

**Also fixed:** the "Resumed at … / Start over" notice above the player bar covered the
bottom row of an open popup (the show sheet's Pause on phones). It waits while a popup is
open; every popup showing an episode has its own Start over and position. The "Past episodes"
button's label no longer wraps in the narrower left column.

### Step 2d: the remaining popups reviewed (2026-09-28)

Every remaining popup screenshotted at phone and desktop with an episode playing and judged
against rule 2. Only one needed a change.

| Popup | Verdict |
|---|---|
| Live player | Desktop card narrowed 760 → 680 px (content needs ~650; ~150 px sat empty on the right). Changed in its one definition, not overridden. Phone: a full "now playing" screen with large art, which suits a live stream; unchanged |
| Past episodes (in the show sheet) | Clear list, playing episode marked, Back link; unchanged |
| Schedule | Day tabs and a list, live show marked; unchanged |
| Schedule week grid (2026-09-29) | 1024 px and up only. Opens over the schedule, player bar stays visible and usable (it is in the player-frame rule); show info card beside the clicked show. See [schedule-grid-plan.md](schedule-grid-plan.md) |
| Live "about this show" | Compact card sized to its text; unchanged |
| Side menu | List that scrolls, ends above the player bar; unchanged |
| Donate / privacy | Pacifica's own page in a frame, not ours to restyle; sits above the player bar |
| Artwork lightbox | Art centred, close top right, player bar below; unchanged |

**Audit fix:** the menu screenshot twice showed the live player instead. Not a site bug: the
site reopens what the saved history entry says was open (a reload with the live player open
reopens it, by design), and the audit reloaded the same address between cases, carrying the
previous case's live player into the menu case. Each case now starts from a blank page.

### Step 3a–3b (2026-09-28): the sheet's player copy removed; the keyboard reaches the player

- **3a — the show sheet's copy of the player is gone** (markup, ~120 lines of app.js wiring,
  ~70 lines of CSS). Its update function also refreshed two things the sheet still needs (the
  "Playing now / Paused" line and the scroll fade); those stay, as `syncSheetSelected()`.
  Comments that described the copy now describe the real bar, which is what they refer to:
  tapping the bar's title while a sheet is open still hands back to the Live Player.
- **3b — Tab reaches the player bar from every popup.** Each of the nine main-side popups had
  its own copy of a "keep Tab inside" loop. They now share one helper, `cycleTab()` in app.js:
  the popup's visible controls, then the bar's, then back. Discovery's popup got the same loop
  (a non-modal dialog has none of its own, and Tab past the player fell onto the empty page).
- **Bug found by the check, fixed in the helper:** focus stuck on the show sheet's close
  button. The helper moves focus to the next control itself, and the sheet's list includes
  controls that are hidden at that moment (the past-episodes Back button, the scroll hint);
  focusing a hidden element silently does nothing. The helper now steps only through controls
  that are on screen — a fix for every popup, not just the sheet.
- **The popup audit now presses Tab for real** (DevTools key events) from inside each popup and
  reports whether focus reaches the player bar and comes back without wandering elsewhere.
  Limit: Discovery's transcript panel lists hundreds of lines, so 40 presses never leave it; it
  is a side panel, not a popup that traps focus, and the bar is reachable with Shift-Tab.
- **Process note (2026-09-28):** the first attempt at 3b used a text pattern that was too loose
  and damaged app.js in two places. It was caught at once by the syntax check, never committed
  or deployed; app.js was rebuilt from the last commit plus the 3a steps, and a line-by-line
  comparison showed no other differences before 3b was applied again, one loop at a time.

### The Show view (2026-09-29) — the show sheet, redesigned

Plan, decisions and build order: [kpfk/show-view-plan.md](kpfk/show-view-plan.md). One panel,
the Spotify / Apple Podcasts model; replaces the tabs, the "Selected broadcast" footer and the
separate "Past episodes" screen.

- **Show view:** compact header (art, category, name, host, **Play latest** / Resume latest /
  Pause, Share), description (2 lines, More), link pills, then the **episodes right there**:
  rows with the round play button on the left, date · time · length · status, topic (2 lines),
  notes (1 line), progress. First 20, then "Show 20 more" in the flow of the list.
- **Episode view** in the same panel: back link to the show, title (topic, else the date),
  meta, Play · Start over · Transcript / Songs (Discovery) · Share, notes, "More from this show"
  (3 rows) and All episodes.
- **Phone:** one column; the Episode view takes the whole panel ("← show name").
  **Desktop (≥ 900 px):** 1000 px panel, the show on the left (2fr), the list or the episode on
  the right (3fr), each column scrolling on its own; the back link reads "All episodes".
- **Rule 1 holds:** the panel ends above the player bar; the bar stays tappable.
- **Closing** is a plain slide down (the "minimize toward the bar" animation is gone). The close
  button still shows a chevron while audio plays, meaning "keeps playing".
- **Row play button colours:** light mode `--surface-2` with an outline; dark mode a lighter
  fill, no outline (`--row-play-bg`, `--row-play-line` on `.sheet`).
- Code: `public/app.js` (`episodeRowHtml`, `showColHtml`, `listHtml`, `episodeHtml`,
  `paintSheet`, `selectEpisode`, `backToShow`); CSS block "Show panel" at the end of
  `public/styles.css`. The panel's view marker is `view-show` / `view-episode` on `.sv`
  (not `sv-show`, which is the show column's class — the clash was a real bug, fixed before
  shipping).
- Test: `test/homepage/show-view.cjs` (33 checks, real taps, phone and desktop).
- **Not yet done:** popup audit (`tools/popup-audit/`) rerun with the new panel; old sheet CSS
  (`.sheet-foot`, `.sheet-routebar`, tabs, old row layout) still in `styles.css`, unused.

### Known limits and follow-ups

- ~~**Keyboard on the main side:** focus trapped inside each popup~~ — fixed in 3b.
- **Audit robustness:** a step that never finishes is now reported as `timeout` instead of
  hanging the run (one run stalled on 2026-09-28 while files were being swapped for a test).

## Changes log

| Date | Step | Change | Audit after |
|---|---|---|---|
| 2026-09-28 | 2a | Discovery loads `styles.css`; its `base.css` copy removed | Discovery screenshots (baseline above) render normally with it; not compared side by side with the old copy |
| 2026-09-28 | 2b | Player frame on both sides; Discovery popup non-modal; show sheet's player copy hidden; offline guard test | player usable in 22 of 22 (was 4 of 22) |
| 2026-09-28 | 2c | Show sheet two columns (desktop) / compact header (phone); Discovery popup Play in header, two columns on desktop; sheet Pause restored; resume notice waits under popups; audit checks play control is tappable | player usable 22 of 22; Play/Pause tappable in all 6 episode views; checked by eye (phone and desktop) |
| 2026-09-28 | 2d | Remaining popups reviewed; live player desktop card 760 → 680 px; audit cases start from a blank page | all 11 popups: player usable at both widths; screenshots judged by eye |
| 2026-09-28 | 3a–3b | Sheet's player copy removed; one shared Tab loop (popup → player bar → popup) for all nine popups and Discovery's popup; hidden controls skipped | player usable 22/22; keyboard reaches the bar and returns in 20/22 (Discovery transcript panel: probe limit, see above); npm test 162/162 |
| 2026-09-29 | Show view | One panel: Show view with episodes + Episode view; desktop two columns; phone one column; Play latest; 20 + Show 20 more; plain slide down | `test/homepage/show-view.cjs` 33/33; now-playing, focus-rings pass; npm test 190/190; live on phone (Paul: "really nice"); popup audit not rerun |
