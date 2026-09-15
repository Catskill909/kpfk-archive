# Exports — specification (not yet built)

**Status:** specified 2026-09-15, no code written. Tracked in
[HANDOFF.md](../HANDOFF.md) open items.

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
