# Schedule grid — plan (2026-09-29)

A week-at-a-glance grid opened from the Schedule modal. Status: **plan, not built.**

## Paul's decisions

- **Our style, not the reference's.** radiocatskill.org/new-schedule (NPR's Cadence
  weekly-schedule widget) is a guide to a *clean layout* only — days across, times
  down, blocks as tall as their airtime. Colors, type, surfaces, radius and the
  on-air treatment are ours, in dark and light mode, from the existing tokens
  (`--surface-*`, `--ink*`, `--outline*`, `--accent`).
- **Large tablets and desktop only — never phones or small tablets.** The Grid
  button does not exist below the cutoff; the day-tab list stays the phone view.
- **Closing the grid returns to the Schedule modal** it was opened from, on the
  same day tab.
- **No links for now.** Blocks are plain boxes, not buttons.

## Cutoff

`min-width: 1024px` — iPad landscape, 12.9" iPad Pro portrait, laptops, desktops.
Excluded: phones, and 768–834px iPads in portrait (7 columns there would be
~100px each). Seven columns at 1024px are ~130px each.

Gate in JS with `matchMedia('(min-width:1024px)')`, not only in CSS: below the
cutoff the button is not rendered, and if the window shrinks past it while the
grid is open, the grid closes back to the schedule.

## Data (checked against docs/fixtures/pacifica-kpfk-2026-09-14)

148 slots/week; every start on :00 or :30; lengths 30 min (23), 1 hr (94),
1½ hr (1), 2 hr (29), 3 hr (1); no gaps; nothing crosses midnight. So: a
**half-hour row grid**, 48 rows/day, no special cases. Same data the list uses
(`publishedWindow()`), no new fetch.

## Layout

- Opens as a layer **above** the Schedule modal (as the info sheet does), wider
  than it: roughly `min(1280px, 96vw)`, same radius/shadow/scrim family.
- Header: "Schedule" + "All times Pacific · published by KPFK", close ✕.
- Days across: rolling seven days, **today first** (matches the tabs), each
  header "Today" / "Wed 30".
- Times down the left, sticky, hour labels; half-hour rule lines in `--outline`.
- Rows ~44px per half hour (a 30-min block must hold a readable title) → the
  day is ~2,100px tall; the body scrolls and **opens at the current time**.
- Block = our schedule card look (surface, outline, radius, `--ink` title):
  title always; time + host when the block is tall enough; small thumbnail on
  blocks of 1 hr+ only.
- On air: the block gets the list's accent treatment and "On air" badge; a thin
  `--accent` now-line crosses today's column. Both update on the existing 15s
  poll and roll over at midnight like the list does (`schedRollDay`).
- Player bar stays visible and usable (standing rule), as with the schedule.

## Behaviour

- Entry: a "Grid" button in the Schedule modal header (desktop/large tablet only).
- Close: ✕, Esc, scrim click, browser Back → Schedule modal, same day tab.
  Own history entry (`{schedGrid:1}`), same pattern as `openSchedule`.
- Focus: moves into the grid on open, returns to the Grid button on close.
- Never touches an `<audio>` element.

## Implementation notes

- **CSP** (`style-src 'self'`) voids inline `style=""`. Block placement via CSS
  grid (`grid-column` = day, `grid-row` = start / span) set through CSSOM
  (`el.style.gridRow = …`), never markup attributes.
- Markup: a new dialog in `index.html` beside `#schedModal`; painter
  `paintScheduleGrid()` in `app.js` beside `paintPublishedSchedule()`; styles in
  `styles.css` under the schedule section, light mode via the existing token swap.

## Tests (each run against the unbuilt/unfixed code first to show it fails)

- Block height ∝ airtime (30 / 60 / 120 min blocks measured in the rendered grid).
- Grid button absent at 1023px and present at 1024px; grid closes if resized below.
- Close via ✕, Esc and Back each lands on the Schedule modal, same day selected.
- On-air block + now-line present in today's column only.
- No `<audio>` element touched (play/pause state unchanged across open/close).

## Order of work

1. This plan — done.
2. Clickable mockup on fixture data, dark + light (~30 min).
3. Build + tests (~1–2 hr).
