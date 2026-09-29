# Show view — plan (2026-09-29)

**Status (2026-09-29): steps 0–3 built (mockup approved; Show view, Episode view, URLs/Back, all entry points) — test/homepage/show-view.cjs. Next: phone test after redeploy, then step 4 (dead CSS), 5 (older suites), 6 (Now Playing fit), 7 (docs).** Paul: "the show modals on both desktop and mobile are a
big mess … how do Spotify / Apple Podcasts handle all this info … I like the archive showing in
the same view as the show info and episode info … deep planning before we jump in."

## 1. The goal in one paragraph

One **Show view** that reads like Spotify / Apple Podcasts: who the show is, **Play latest**, a
short description, and **the episodes right there**, newest first, as compact rows. Tapping an
episode's text opens its **Episode view inside the same panel** (back arrow to the show): title,
date, play, notes, Transcript/Songs, Share. The full-screen player stays separate (**Now
Playing** on phones; the bar on desktop). Everything above the mini player, always.

## 2. Rules this must keep (already decided)

| Rule | Source |
|---|---|
| The mini player is always visible and usable; nothing covers it, no modal makes it untappable | DESIGN-SYSTEM Rule 1; Paul 2026-09-28, reaffirmed 2026-09-29 |
| Use the width: desktop two columns, Play near the top, never last; no stacked single column | DESIGN-SYSTEM Rule 2 |
| Mobile first (most listeners are on phones) | Paul 2026-09-24 |
| Nothing hidden behind toggles that matters; compact buttons sized to their label | Paul 2026-09-29 (Import/Export), popup density rule |
| In-app dialogs only, never browser pop-ups; focus rings only for the keyboard | Paul; 2026-09-29 fix |
| JSON-only data; CSP: no inline styles/scripts, same-origin images | CLAUDE.md |
| Permanent links `/show/<code>` and `/show/<code>/<episode>` keep working | docs/LINKS.md |

## 3. Inventory — everything the show sheet does today

**Ten ways in** (all call `openSheetById` in `public/app.js`):

| Entry | Today opens | New target |
|---|---|---|
| Gallery card (show) | sheet on its latest episode | **Show view** |
| List row (episode) | sheet on that episode | **Episode view** (back → show) |
| Just aired card | sheet on that episode | **Episode view** |
| Search: show result | sheet (show) | **Show view** |
| Search: episode result | sheet (episode) | **Episode view** |
| Mini player tap (desktop) | sheet on the playing episode | **Episode view** of what is playing |
| Now Playing → Episodes (phone) | sheet | **Show view**, playing row marked |
| Schedule slot → "archive" | sheet (via live choice) | **Show view** |
| Live player → show link | sheet, optionally past episodes | **Show view** |
| Links `/show/<code>[/<ep>]`, `?show=` | sheet, tab chosen by link | show link → **Show view**; episode link → **Episode view** |

**Features that must survive** (all present today):

- Show: artwork (tap → larger artwork), category, name, host, description (clamped, More), links
  (website, Facebook, Twitter, RSS where the station has it, Share where the phone offers it).
- Episodes: date · time · length, topic/QIR headline, notes/QIR summary, **listening state**
  (played / % listened / in progress bar), **playing / paused / loading** marks, retention badge
  ("leaves the archive in N days"), the "instead" hint when another episode is playing.
- Episode: play/pause, **Start over** (when there is a saved position), Transcript / Songs
  (Discovery plugin `sheetActions`), "Transcript processing…" / "No episode notes" messages,
  Share, expired-link note ("rotated out of the archive").
- Stats counters: `summaryShown`, `pendingShown` (once per episode per visit).
- Behaviour: one history entry per opening; inner page = its own entry; Back steps out;
  opened-from-Live journeys consume both entries on close; Escape steps back then closes; focus
  kept inside for the keyboard and returned on close; the artwork zoom layers above; opened over
  the schedule it closes back to the schedule; "minimize" animation toward the bar on close
  while playing; live repaint of marks while audio plays (no list rebuild, scroll kept).
- Server link previews (OpenGraph) are built server-side from the URL — **unaffected**.

**Tests that touch the sheet (must be updated, not deleted):** `test/episode-rail`,
`test/homepage/now-playing.cjs`, `test/homepage/focus-rings.cjs`, `test/live-stream`,
`test/motion`, `test/schedule`, `test/touch`, `test/ui/live-archive-tests.js`; plus the popup
audit `tools/popup-audit/`.

## 4. What is wrong today (audit, 2026-09-29, Paul's screenshots)

1. Four ideas in one box: show info, episode info (tabs), a "Selected broadcast" footer, and a
   separate "Past episodes" screen with its own back route.
2. Past-episode rows ~200 px tall, play icon bottom-left, an odd "INSTEAD" label, a floating
   "More episodes" button over the list.
3. Wasted space: desktop right column mostly empty; phone middle empty with Play pushed to the
   bottom footer (against Rule 2).
4. Truncation: "Past episodes 40 · 1 in prog…".
5. Now Playing (phone): artwork sized by width, so on smaller phones the controls fall below
   the fold; the play button (76 px) is oversized.

## 5. The design

### 5.1 Show view

- **Header (compact):** artwork 96 px (tap → larger), category · name · host, **Play latest**
  (or **Resume** / **Pause** when the latest is in progress / playing), Share.
- **About:** description, 2 lines with "more" (expands in place — content, not a hidden panel);
  links as small pills under it.
- **Episodes (the archive, in the same view):** "40 episodes · 1 in progress", then rows:

  ```
  [▶/❚❚]  Tue, Sep 29 · 9:00 am · 2:00:04        ●Playing | 35% | Played | leaves in 3 days
          Topic or QIR headline (1 line, bold)          (only when the episode has one)
          Notes / summary (1 line, muted)               (only when it has some)
  ```
  Row height ~64–84 px. Play on the **left** (thumb reach, list convention). Tapping the text
  opens the Episode view. Newest first; first 20, then "Show 20 more" at the end of the list
  (in flow, never floating).

### 5.2 Episode view (inside the same panel)

- Top bar: **← Show name** (back to the Show view) · close.
- Episode title (topic/headline, or the date when there is none — same rule as Now Playing),
  date · time · length · retention, **Play / Pause · Start over**, progress when started.
- Transcript / Songs (Discovery), Share.
- Notes / QIR summary in full (or the "processing" / "no notes" message).
- "More from this show": the next few rows (same row component), then **All episodes →** (back
  to the Show view).

### 5.3 Phone

A sheet from the bottom up to the thin gap (.75rem), ending at the mini player's top edge.
Single column: header, about, episodes. Episode view slides in from the right inside the sheet.
Drag down / close / Back to dismiss.

### 5.4 Desktop (Rule 2: use the width)

A centred panel (max ~1000 px wide, height to the thin gap above the bar), **two columns**:

- **Left (~40%):** the show — artwork, name, host, Play latest, about, links. Stays put.
- **Right (~60%):** the episodes list (scrolls on its own). Tapping an episode opens the
  **Episode view in the right column** (back arrow to the list); the show stays visible on the
  left. The playing episode is highlighted.

### 5.5 Now Playing fit (phone)

Size the artwork by the space left after title, scrub bar and controls (`min(78vw, …dvh)`),
play button 60 px, tighter gaps, so everything fits on a 375×667 screen; "More from this show"
below. "Episodes" opens the new Show view.

### 5.6 URLs and Back

| Where you are | URL | Back goes to |
|---|---|---|
| Show view | `/show/<code>` | where you opened it (listing, schedule, live player) |
| Episode view from a show | `/show/<code>/<episode>` | the Show view |
| Episode view opened directly (card, Just aired, link) | `/show/<code>/<episode>` | where you opened it |

One history entry per opening; the Episode view inside a show is one more; close consumes the
panel's entries (the existing live-origin rule generalised). Old `?show=<id>` links → Episode view.

## 6. Build order (each step shippable; the site works after every step)

| Step | What | Evidence before moving on |
|---|---|---|
| 0 | **Clickable mockup** page with real KPFK data, phone + desktop, both views | Paul approves |
| 1 | Episode **row component** + Show view (phone + desktop) replacing profile + "Past episodes" | new browser test; popup audit screenshots |
| 2 | Episode view inside the panel; URLs + Back per 5.6 | history tests: every entry → correct view, Back/close paths |
| 3 | Wire all ten entry points; Now Playing "Episodes"; live player; links incl. rotated notice | one test per entry point |
| 4 | Remove the old code: tabs, "Selected broadcast" footer, archive route, "instead" label, minimize animation if replaced | dead-code sweep; CSS rules for removed classes deleted |
| 5 | Update the 8 browser suites that touch the sheet; popup audit | all green; screenshots reviewed |
| 6 | Now Playing fit fix (5.5) | phone test at 375×667: controls above the fold |
| 7 | Docs: DESIGN-SYSTEM (Rules 1–2 examples), LINKS.md, HANDOFF | — |

Each step is committed and deployed on its own so it can be tried on a phone; step 0 costs
nothing to throw away.

## 7. Tests (assert what a listener sees — CLAUDE.md §3a)

- Real taps at 390×844 and 375×667 and at 1280×900; both themes.
- For every entry point: the right view opens, the right episode/show is shown.
- Mini player visible and tappable over every state (elementFromPoint), play/pause works.
- Back and close from every state return to where the listener was; no dead history entries.
- Rows: listening state, playing mark follows play/pause without the list jumping or scrolling.
- Nothing cut off or running sideways; Play within the first screen on phone (Rule 2).
- Each new check shown failing on the old sheet first.

## 8. Risks

- **History/back is the most fragile part** (live origin, schedule stacking). Mitigation: step 2
  is only this, with its own tests.
- **Discovery hooks** (`sheetActions`, `onAction`, `refresh` repaint): keep the plugin
  interface; re-test Transcript/Songs from the Episode view.
- **Eight older suites** were built for WBAI and are partly unadapted; some may already fail.
  Record which fail before step 1 so failures are not blamed on the redesign.
- **The Flutter app is not affected** (it uses `/api/archive` only).

## 9. Decisions (Paul, 2026-09-29)

1. Desktop: **centred two-column panel** (show left, episodes / episode view right).
2. Header button: **Play latest** (Resume / Pause when the latest is in progress / playing).
3. Closing while playing: **plain slide down** (the "minimize toward the bar" animation goes).
4. List: **first 20, then "Show 20 more"** at the end of the list.
