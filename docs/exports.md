# Exports — specification

**Status:** specified 2026-09-15. **Phase 1 (`listening`, CSV + JSON) built
2026-09-16** — see "Phase 1 — as built". **Re-planned 2026-09-16:** date spans and
a backup/import for moving the app come next — see "Revised plan" directly below,
which overrides the phase order and the calendar-months decision further down.
Tracked in [HANDOFF.md](../HANDOFF.md) open items.

## Revised plan — 2026-09-16 (Paul)

**Why it changed.** The app has to be easy to move between servers, with its data
going along cleanly. The original spec said exports were "about portability and
reporting, not backup" — that framing is replaced: a station also needs a
**lossless backup file it can import** on a new install. Reports and backups are
different files for different jobs and are kept separate.

| Decision | Choice |
| --- | --- |
| Report periods | **From/to dates** (UTC days) with presets *This month, Last month, This year, All time*. Replaces "calendar months + all time". |
| What a backup holds | **Usage data + studio settings.** The `stats/` month files verbatim, plus a `settings` object (empty until the studio timezone setting exists). Feed snapshots (`pacifica/`) are left out — a new install re-fetches them. `.instance.json` is never moved: a new server keeps its own identity. |
| Import into a server that already has data | **Preview, then replace.** A month-by-month comparison (backup vs this server) first; on confirm, the backup's months replace the matching months here and other months are untouched. The server's current copies are saved aside first, so an import can be undone. Importing the same file twice gives the same result. |
| Order | **1b** date spans → **1c** backup + import → then inventory, coverage, printable report, profile. |

### 1b — date spans (on the phase 1 export) — built 2026-09-16

As specified below. Presets that fall wholly before the oldest data are disabled;
one that starts before it is clamped to the first date. An invalid span (end before
start, outside the bounds) disables the download links and says why.


- `GET /api/studio/export?dataset=listening&from=YYYY-MM-DD&to=YYYY-MM-DD&format=…`
  replaces `period`. Validated: real calendar dates, `from ≤ to`, `from` no earlier
  than the 1st of the oldest stats month, `to` no later than today (UTC).
- Filenames carry the span: `kpfk-listening-daily-2026-09-01_2026-09-16.csv`.
- Manifest: `from_date_utc`, `to_date_utc`, `days_covered` (replaces `period`).
  Not yet deployed, so `schema_version` stays `1`.
- `GET /api/studio/exports` returns `firstDate` and `today`; presets are computed
  from those, not from the browser's clock (which is not UTC).
- Studio: two date inputs bounded by `min`/`max`, four preset buttons.

### 1c — backup and import — built 2026-09-16

As specified below, with these details settled in the build:

- **Where:** a second tab, *Backup & restore*, in the studio's Export dialog.
- **Code:** `lib/export/backup.js` (build, allow-list validation, plan) and the
  routes in `server.js` (`sendBackup`, `studioImport`, `applyImport`, `undoImport`).
  Status: `GET /api/studio/import/status`.
- **Backups carry each month as exactly `station`, `month`, `days`**, with only the
  known counters and maps. That drops only what the app's own policy already
  deletes (legacy search terms), so a backup always passes its own import.
- **Validation refuses, never trims:** unknown fields anywhere, whole-number
  counters only, zone keys from the four buckets, show keys by shape, dates inside
  their month, no future months, checksums, same station, known settings only.
- **Apply checks the preview token before anything else** (409), so a file that
  differs from the previewed one is refused for that reason. The 3 s cooldown starts
  only when a write actually happens.
- **Undo never deletes:** it saves the post-import months as `undone-<m>.json`,
  writes the copies back, and *renames* a month the import added to
  `imported-<m>.json` — all inside the import's own folder. An import is undone once.
- **Moving guide:** [DEPLOYMENT.md](DEPLOYMENT.md) "Moving the app to another server".

**Tests:** `test/pacifica/backup.test.js` — the validator's 17 refusals; two real
servers where B's exports after restore are **byte-identical** to A's, the preview
leaves B's data directory byte-identical, B keeps its identity, the next beacon lands
on the imported counters, re-import is identical, undo restores B's own figures
exactly and moves rather than deletes. Eight planted bugs each seen to fail it
(unknown field accepted, checksum skipped, no copy before writing, memory not
swapped, undo leaves the added month, preview writes, station unchecked, token
unchecked). Browser: `test/studio/export-tests.js` section 4b downloads a backup and
previews restoring it — the plain backup, then a changed copy re-signed with the
app's checksum so New and Replaced cards appear (never applies — safe against a live
station).

**The preview is one card per month at every width,** not a table. As a table its
"What happens" column was clipped by the dialog on a laptop, and on a phone it needed
a sideways scroll. Two lessons from getting there, both now in the suite:
- **A same-weight rule later in the file wins.** `.studio-table td { white-space:
  nowrap }` silently overrode `.export-plan td`, so card text did not wrap and ran
  across the next column. The plan rules are `.studio-table.export-plan …`.
- **Element rectangles cannot see overflowing text.** A visible-overflow cell does
  not grow when its text spills out, so the first fit check passed an overlapping
  layout. It now also compares `scrollWidth` to `clientWidth` in any overflow mode
  and each rendered text line to its container, and it judges the preview with the
  longest text (a changed backup), not the short "No change." one. With wrapping
  removed it fails at 1200 and 390px.


**The backup file** — `GET /api/studio/backup` →
`kpfk-backup-2026-09-16.json`, one JSON file (a few KB per month; no zip, no
dependency):

```json
{ "format": "pacifica-archive-backup", "formatVersion": 1,
  "station": "kpfk", "createdAt": "…", "appVersion": "…", "sourceInstanceId": "…",
  "stats": { "2026-08": { …month file, verbatim… }, "2026-09": { … } },
  "settings": {},
  "checksums": { "2026-08": "sha256 of that month's JSON", … } }
```

The current month is read from memory, so counters not yet flushed are included.

**Import** — two steps in the studio, both `POST`, CSRF-guarded like the actions:

1. `POST /api/studio/import/preview` (the file as the body) — **writes nothing.**
   Refuses: wrong `format`/`formatVersion`, a different `station`, a checksum that
   does not match, a month key that is not `YYYY-MM`, a day outside its month, a
   counter that is not a finite non-negative number, a malformed map, a body over
   the size limit. Returns per month: backup totals, this server's totals, and
   the action (`new`, `replace`, `identical`), plus a token bound to the file's hash.
2. `POST /api/studio/import/apply` (same file + that token) — copies this server's
   affected month files to `stats/pre-import-<timestamp>/`, writes each backup
   month with `writeJsonAtomic`, and swaps the in-memory current month if it is one
   of them. Logged. Any beacons since the preview on a replaced month are replaced
   too — the preview says so.

**Undo:** "Undo last import" restores the `pre-import-*` copies (also atomic).

**Tests (each shown to fail):** backup → import on a fresh server → every export
identical; importing twice = importing once; wrong station refused; tampered month
(checksum) refused; `../` month key refused; preview leaves the data directory
byte-identical; the pre-import copy exists and undo restores it; 401 signed out,
403 without CSRF.

### 2 — inventory and coverage — built 2026-09-16

In the Export dialog's Reports tab, step 1 is now **What to export: Listening |
Archive | Coverage**, then the files for that dataset; step 2 is **Dates**, which says
what its dates mean and switches off for Coverage. One route serves all three
(`EXPORT_DATASETS` in `server.js`); the index reports each dataset's tables, span kind
and bounds, so the page cannot offer what the route refuses.

- **`inventory`** (`lib/export/inventory.js`, shown as *Archive*) — the episodes
  listeners can play. Tables `episodes` (show, episode id and title, local air date
  and time, UTC moment, duration seconds, category, host, audio URL, expiry) and
  `shows` (episodes, oldest/newest air date, total seconds). **Selected by air date in
  the station's timezone**, not UTC: an evening show is the previous day in Los
  Angeles, and a board asks what aired in *its* September. Listening stays on UTC days
  because its counters were bucketed that way when recorded. Files:
  `kpfk-archive-episodes-<from>_<to>.csv`.
- **`coverage`** (`lib/export/coverage.js`) — one row per show in Pacifica's **whole
  catalog**, every source: in the published schedule, shown to listeners, has
  artwork / description / host, episodes in catalog, newest air date, days since it.
  A snapshot, so no dates. `in_published_schedule` is **left empty** when the archive
  filter is not schedule-based (an outage or before warm-up) rather than guessed; the
  manifest says `schedule_known`. JSON adds a summary of the gaps. This is the
  2026-09-15 evidence for Pacifica's feed developer, as a download.
- **Empty is not an error** for listening and archive (columns, no rows); only
  coverage, which *is* the catalog, answers 409 before the catalog has loaded.
- Titles use the same rule as listening: archive → catalog mirror → empty, never an id.

**Tests** (`test/pacifica/export.test.js`): unit tests for both builders (an episode
at 02:30 UTC is August 31 in Los Angeles; unknown schedule stays empty); on the pinned
fixtures, the Episodes file holds exactly the archive's episode ids, show counts add
up, the evening-episode class is checked against a separately built LA formatter,
coverage has one row per catalog show with schedule membership taken from the
schedule files themselves (the fixture includes a scheduled program with no
episodes), artwork gaps and episode counts match the raw feed. Five planted bugs were
run against it (UTC instead of local dates, listener archive instead of catalog,
guessed schedule, id as title, broken show count). Browser: `export-tests.js` 2b
picks Archive and Coverage with real clicks and asserts their files land.

---


**Decided by Paul, 2026-09-15:** exports cover **all four datasets** below, in
**CSV, JSON and a printable report**, downloaded from **`/studio`** by the
station's own staff.

## Why this exists

The VPS has snapshots and full backups for 10 days, so the *disaster* case is
covered. That is not what this is for. A snapshot is a copy of a disk that only
the person with VPS access can open, and only within ten days. What a station
actually needs is a file a program director can put in a board report, and what
Pacifica needs is five stations' numbers in one comparable shape.

So: exports are about **portability and reporting**, not backup. They happen to
also give a station a durable copy of the one thing on the volume that cannot be
re-fetched from anywhere — see "What `stats/` is" in [HANDOFF.md](../HANDOFF.md).

## Who it is for

| Audience | What they want | Format that serves them |
| --- | --- | --- |
| Station staff (program director, GM) | "How did our shows do last month?" | Printable report; CSV in Sheets |
| Pacifica Foundation | Five stations' figures side by side | JSON, with a station id and a schema version in every file |
| Another station evaluating this software | "What does it hold, and what does it collect?" | The manifest and the profile export |
| Whoever runs the server | Evidence for an upstream feed bug | Coverage/health CSV |

## The four datasets

Every export is one dataset, one window, one format. No mixed files.

### 1. `listening` — the usage counters (the irreplaceable one)

From `stats/`. One row per day, plus per-show breakdowns.

- **Daily:** date, page views, episode plays, live tune-ins, searches (count only),
  shares, seconds listened on demand, seconds listened live.
- **Per show:** show key, show **title**, plays, seconds listened. (Titles resolved
  through `episodeRecords()`, never the raw key — see the 2026-09-15 bug in HANDOFF.)
- **Reach:** the three timezone buckets and their counts.

**Contains no identifier of any kind** — there is none in the source data to
export. No IP, cookie, session, device, user agent, or search terms. This is a
property of what is collected, not a filter applied on the way out, and the
export's manifest says so in those terms.

### 2. `inventory` — the archive as held right now

One row per episode: show key, show title, episode id, title, air date, duration,
category, media URL. Plus a per-show sheet: episodes held, oldest, newest, total
hours. Re-derivable from Pacifica's feeds, but a **dated** snapshot is what makes
"we lost six weeks of Something's Happening in October" a provable statement.

### 3. `coverage` — where the data is thin

One row per show: has artwork, has description, episodes held, newest episode age,
whether it is in the published schedule. This is the evidence that went to Otis by
hand on 2026-09-15; it should be a download.

### 4. `profile` — the station's own configuration

The public projection of `stations/<id>.json` — identity, links, socials, category
map. **Never** feed origins, passwords or anything the `/api/station` projection
already refuses. Useful to a station setting this up for the first time.

## Formats

| Format | Who it is for | Notes |
| --- | --- | --- |
| **CSV** | Anyone with Excel or Google Sheets | One file per sheet. UTF-8 with BOM so Excel does not mangle accented show titles (KPFK has `Español` programming). RFC 4180 quoting. |
| **JSON** | Pacifica, other tools | The server's own shape, plus `station`, `schemaVersion`, `generatedAt`, `window`. |
| **Printable report** | Boards, funders | See below. |

### On PDF

This app has **zero dependencies and no build step** (CLAUDE.md §5), and that is
worth more than a PDF writer. A PDF library would be the first dependency in the
project and would need to be kept current forever.

The report is therefore a **print-styled HTML page** at a studio URL, with a
`@media print` stylesheet, page breaks and the station's logo. The browser's own
"Save as PDF" produces the PDF, on every platform, with no library. The button in
the studio says "Printable report" and opens the print dialog.

Honest trade-off: the person clicking gets a print dialog rather than a file
landing in Downloads, and the PDF's margins are the browser's. In exchange there
is no dependency to maintain and nothing to break when a library goes stale. If a
station later needs a byte-identical branded PDF, that is the moment to revisit.

## Delivery

**A download section in `/studio`**, password-gated like everything else there.
Station staff pick a dataset, a window (the studio's existing 7/30/90/365/all) and
a format, and the file downloads. No VPS access, no developer, and it works for
every station running this software — which is the template rule.

Not chosen, and why: a VPS command only works for KPFK and only for Paul; a
scheduled auto-export adds writes and a moving part to the volume for a file
nobody asked for yet; a public URL would publish a station's listening figures to
anyone who found it.

### Route shape

```
GET /api/studio/export?dataset=listening&format=csv&days=30
GET /studio/report?days=30                     # the printable page
```

- Behind `studioAuthed`, like every other studio read.
- A **GET and idempotent** — it is a read, and the studio's state-changing rules
  (CSRF, rate limit, cooldown) apply to actions, not to reads.
- `Content-Disposition: attachment; filename="kpfk-listening-2026-09-15-30d.csv"`
  — station id, dataset, date, window. A Pacifica staffer with five files in a
  folder can tell them apart without opening them.
- Windows come from the existing `USAGE_WINDOWS` menu, not an arbitrary integer.

### The manifest

Every export carries a `manifest` (a `README.txt` beside a CSV, a top-level key in
JSON) stating: station, generated-at, window, schema version, what each column
means, and the no-identifier promise in plain words. A file that arrives at
Pacifica without its own explanation gets misread, and the counters are exactly
the kind of number someone will quote.

## Cross-station shape

Pacifica's case is five stations in one spreadsheet, so:

- Every row carries `station` (`kpfk`, `wbai`, …).
- Every file carries `schemaVersion`. Bump it when a column's meaning changes, not
  when one is added.
- Column names are the same across stations — they come from this code, not from a
  station profile.
- Sum-able columns are raw counts and seconds, never pre-rounded. The studio
  rounds for display; an export that rounds cannot be re-aggregated.

## Implementation sketch

Everything needed is already computed:

| Dataset | Source |
| --- | --- |
| `listening` | `usageReport(days)` + `recentDays(days)` for the per-day rows |
| `inventory` | `episodeRecords()` |
| `coverage` | `studioStats(days)` + `pacifica.peekArchive().directory` |
| `profile` | the same public projection `/api/station` serves |

New code is a CSV writer (quoting, BOM, one function), the route, the print
stylesheet and the studio UI. **No new data is collected for this.** If a column
would need a new counter, that is a separate decision with a README change in the
same commit (CLAUDE.md §5).

## Test plan

Per CLAUDE.md §3a — assert the effect, not the declaration:

1. **Round-trip:** parse the CSV the server actually returns and assert its totals
   equal the JSON payload's totals for the same window. A CSV whose numbers drift
   from the dashboard is worse than no export.
2. **Titles, not keys:** every show row names a title, run against the same fixture
   that caught the 2026-09-15 slug bug.
3. **No identifiers:** assert the exported bytes contain no field outside the known
   column list — a positive allow-list, so a future counter cannot leak in silently.
   The test must be shown to fail by adding a fake `ip` column.
4. **Escaping:** a show title containing a comma, a quote and a non-ASCII character
   survives the round trip. KPFK has all three today.
5. **Auth:** every export route answers 401 signed out, checked like the existing
   studio routes.
6. **Empty windows:** a station with no data yet exports headers and zero rows, not
   an error and not an empty file.

## Decisions, locked 2026-09-15 (Paul)

| Decision | Choice | Why it was a decision |
| --- | --- | --- |
| Reporting period | **Calendar months, plus all time** | A board or a funder asks for "September 2026", never "the last 30 days". Stats are already one file per month, so this is also the cheapest to build. Rolling windows stay on the dashboard, where they belong. |
| Day boundary | **Leave UTC, label it `date_utc`** | Counters are bucketed per UTC day at write time (`server.js:2385`) and **cannot be re-split afterwards** — a UTC day cannot be reassigned to two Pacific days. Shifting boundaries on export would misattribute the edges silently. The manifest states both the bucket (UTC) and the station timezone (`America/Los_Angeles`). |
| Tomorrow's scope | **Export phase 1 only** | The studio settings panel (below) introduces the first config *write*; keeping them apart keeps each one verifiable. |

**Related dev, tracked separately:** Paul wants the **station timezone settable in
the studio** rather than living only in `stations/kpfk.json`. That is the studio's
first setting that writes station configuration — it needs an override stored on the
data volume, precedence against the profile, validation, and it moves schedule
rendering as well as reporting. Own spec, own day. Exports do not block on it: they
report the timezone in force at generation time, whatever sets it.

## Phase 1 — build plan

**Goal:** a station manager signs in to `/studio`, picks a month, clicks once, and
opens the result in Excel or Sheets.

**In scope:** the `listening` dataset, CSV + JSON, calendar month or all time, a
download section in the studio. **Out of scope:** the other three datasets, the
printable report, zip bundling, the settings panel.

### What exists already (nothing here is new work)

| Need | Where it is |
| --- | --- |
| Month files on disk, newest live from memory | `listStatsMonths()` `server.js:2600`, `statsMonthDays(m)` `server.js:2612` |
| Per-day counters | the day records in those files — see "What `stats/` is" in HANDOFF |
| Per-show plays and seconds | `byShow` / `secondsByShow` in each day record; sum with `sumBySlug()` `server.js:2580` |
| Show titles | `episodeRecords()` `server.js:1719`; **fall back to `pacifica.peekCatalog().directory`** for shows that have left the schedule — the catalog is an untouched mirror, so it can still name them (`lib/pacifica/service.js:188`) |
| Auth + no-store headers | `studioAuthed()` `server.js:2844`, `sendStudioJson()` `server.js:2909` |
| Route table | `studioApi()` `server.js:3278` |
| Studio page + picker pattern | `admin/studio.html` (`.win-picker`), `public/studio.js:842` |

### Steps, in order

**1. `lib/export/csv.js` — the CSV writer.** One exported function,
`toCsv(columns, rows)`. RFC 4180 quoting (quote when the value holds a comma, quote,
CR or LF; double the quotes inside), `\r\n` line endings, UTF-8 **with BOM** so Excel
does not mangle `Español`. Numbers unquoted and unrounded. No dependency, no
streaming — the largest realistic file is a few thousand rows.
*Done when:* unit tests cover a comma, a quote, a newline, a non-ASCII title and an
empty value, and the BOM is the first three bytes.

**2. `buildListeningExport({ month | all })` in `server.js`** — one pure function
returning the whole export as data, so both formats and every test read the same
object. Three tables plus a manifest:

- **`daily`** — one row per day in the period, **including days with no activity**
  (a gap is information; a sparse file reads as a rendering hole).
  Columns: `station`, `date_utc`, `page_views`, `episode_plays`, `live_tune_ins`,
  `searches`, `shares`, `seconds_listened_on_demand`, `seconds_listened_live`.
- **`shows`** — one row per show key seen in the period.
  Columns: `station`, `show_key`, `show_title`, `plays`, `seconds_listened`.
  Ranked by seconds, like the dashboard. `show_title` falls back through
  `episodeRecords()` → catalog directory → empty string, **never the key** (the
  2026-09-15 bug; an empty cell is honest, a key masquerading as a title is not).
- **`reach`** — one row per timezone bucket: `station`, `bucket`, `label`, `page_views`.
  Labels come from the server, as they do today, so a file cannot describe a zone as
  a city.
- **`manifest`** — `station`, `station_timezone` (`America/Los_Angeles`),
  `schema_version` (`1`), `generated_at`, `period` (`2026-09` or `all`),
  `days_covered`, `bucketing: "UTC calendar day"`, the no-identifier statement in
  plain words, and one line per column explaining it.

*Done when:* for any month, the function's totals equal `usageReport()`'s totals for
the same days — the export and the dashboard can never disagree.

**3. `GET /api/studio/exports`** — what the picker needs: available months (from
`listStatsMonths()`, newest first, with a row count each), plus the datasets and
formats this build supports. Lets the UI offer only periods that exist.

**4. `GET /api/studio/export?dataset=listening&period=2026-09&format=csv|json`**
- `studioAuthed` first, like every other studio read; 401 signed out.
- `period` validated against the months actually on disk plus `all` — an arbitrary
  string never reaches the file layer.
- CSV: `?table=daily|shows|reach` picks one of the three (CSV holds one table).
  Omitted → `daily`. JSON: all three plus the manifest in one file.
- Headers: `Content-Type` (`text/csv; charset=utf-8` / `application/json`),
  `Content-Disposition: attachment; filename="kpfk-listening-daily-2026-09.csv"`,
  `Cache-Control: private, no-store`, `Vary: Cookie`, plus `securityHeaders()`.
- A GET and idempotent — CSRF and cooldowns are for actions, and this only reads.

**5. Studio UI — a "Downloads" section** in `admin/studio.html` + `public/studio.js`.
Month `<select>` (+ "All time") populated from step 3, then plain `<a download>`
links for: Daily CSV, Shows CSV, Reach CSV, Everything (JSON). Anchors, not
`fetch()` — the browser's own download path needs no blob handling and no JS to go
wrong. One sentence under the heading: what a station gets and that it contains no
personal data. The section is hidden when the station has no stats yet.

**6. Docs in the same commit:** README line (the studio can export usage data, still
no identifiers), this file's status, HANDOFF session log.

### Acceptance criteria

1. Signed out, every export URL answers **401**.
2. September's Daily CSV opens in Excel and Sheets with `Español` intact and columns
   aligned.
3. The CSV's summed `episode_plays` **equals** the dashboard's plays for the same
   month — checked in a test, not by eye.
4. A show that has left the schedule still exports with its title; a show nothing can
   name exports with an **empty** title cell, never a key.
5. A month with no activity exports headers and zero-filled days, not an error.
6. Filenames identify station, dataset, table and period without being opened.
7. `npm test` green, including the new suites; the no-identifier test has been **seen
   to fail** with a planted column.
8. Verified on the live deploy after redeploy, with a real download opened.

### Tests (`test/pacifica/export.test.js`, registered in `tools/run-tests.js:14`)

Carrying the six from the test plan above, made concrete:

| Test | Shown to fail by |
| --- | --- |
| CSV totals equal `usageReport()` totals | perturbing one day's counter |
| Every show row has a title, never a key | the pre-fix title lookup |
| Column allow-list — no field outside the documented set | planting an `ip` column |
| Quoting: comma, quote, newline, `Español`, empty | removing the quote escape |
| 401 signed out on every export route | — |
| Empty month → headers + zero rows, not an error | — |
| `period` rejects anything not on disk (`../`, `2026-99`) | — |

### Verification ritual (CLAUDE.md §1, §2)

`node --check` → restart **8081 only** → `npm test` → headless studio render to prove
the browser ran the new bundle (the pattern used on 2026-09-15: compare
`/studio.js?v=` against `/healthz` `studioVersion`) → commit → push → Coolify
redeploy → live audit with a real file downloaded and opened.

### Rough shape of the work

Steps 1–2 are the substance (a writer plus one pure builder). Steps 3–4 are small
once 2 exists. Step 5 is markup and a select. The tests are comparable in size to
the builder. Half a focused day, and phases 2–4 inherit the writer, the manifest,
the route and the download UI — each later dataset is then mostly its column list.

## Later phases

2. `inventory` and `coverage` — new column lists on the phase 1 machinery.
3. Printable report (`/studio/report`, print stylesheet, browser Save as PDF).
4. `profile`, and the cross-station notes for Pacifica.

## Phase 1 — as built (2026-09-16)

Where the build differs from the plan above, and why:

- **The builder lives in `lib/export/listening.js`, not `server.js`.** `server.js`
  cannot be `require`d on a station build without booting, so a pure function in it
  could only be tested over HTTP. The server passes in the day records
  (`statsMonthDays`), a title lookup and the zone labels; the module does the rest.
  `lib/export/csv.js` is the writer.
- **The dashboard and the export share code, not just numbers.** `dayCounters()`
  (one day record → seven finite counters) and `zoneLabel()` are used by both
  `usageReport()` and the export, so the two cannot drift apart.
- **Formula-looking text cells are neutralised** (`=`, `+`, `-`, `@`, tab, CR →
  prefixed `'`), matching the studio's existing client-side table CSV. Show titles
  are upstream data; Excel executes such cells. Numbers are never touched.
- **Titles: an altid is not a title.** Pacifica's normalizer fills an empty show name
  with the bare altid (`name || altid`), which is right on screen and wrong in a
  spreadsheet. `exportShowTitle()` treats a title equal to the key or its altid as no
  title and writes an empty cell. Lookup order: archive → catalog mirror → empty.
- **The current month stops at today.** Future days are not "no activity", so they
  are not zero-filled.
- **A README, not a zip.** `format=readme` downloads the manifest as plain text
  (all three tables' columns in one file), offered as a "Read me" link beside the
  CSVs. No bundling, per the plan's out-of-scope list.
- **An Export button in the studio header opens a dialog** (Paul, 2026-09-16) —
  replacing first a "Downloads" section under Listening, then an "Export" section at
  the top of the page. Steps: *1 Dates* (presets, from/to), *2 What to download*
  (four choice cards), then a pinned footer with the status line and Download. The
  older "Export CSV" button on the Every feed table stays — it exports that table as
  filtered on screen, which is a different thing.
- **Download fetches, then saves** (a Blob and a temporary link), rather than a
  plain `<a download href>`. Paul reported on the live site that the links "start
  the download but nothing is downloaded". A real click in Chrome on localhost did
  download the complete file, and the live proxy's headers were sound, so **the live
  cause is not yet known**. A plain link hands failures to the browser, where the
  page never sees them; the dialog now shows the saved file's name and size, or the
  server's error with its HTTP status, so the next failure explains itself.
- **The original browser check was blind to this.** It fetched each link's URL with
  `fetch()` and saw 200, which bypasses the download path entirely.
  `test/studio/export-tests.js` (in `test/studio/run.sh`) clicks with real mouse
  events and asserts a finished file on disk, parsed; its self-test proves a refused
  export shows its error and lands no file. **Seen once, not explained:** in one of
  six local runs a file named `downloads.html` also landed in the test's download
  folder; it did not recur in five further runs (one with the folder kept for
  inspection). If it comes back, keep the folder and read the file before anything
  else — an HTML file where data was expected is close to the live symptom.
- **Routes:** `GET /api/studio/exports` (index: months newest first with
  `daysWithData`, `hasData`, datasets) and `GET /api/studio/export` (400 for an
  unknown dataset, format, table or period; `period` must be a month on disk or `all`).

**Tests** (`test/pacifica/export.test.js`, 4 tests, in `npm test`): writer quoting/
BOM/CRLF/formula cells; builder totals, zero-filled days, older-build records, the
current month stopping at today, the column allow-list; empty station; and a
real-server test on the pinned fixtures with a seeded past month and a patched
catalog (a quote + comma + `Español` title, an emptied name, a show off the
schedule, a key nothing names). Each of seven planted bugs was run and **seen to
fail** the suite: a planted `ip` column, the quote escape removed, key-as-title, a
perturbed day counter, no BOM, the auth gate bypassed, period validation removed.

