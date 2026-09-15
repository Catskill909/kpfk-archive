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

## Phases

1. `listening` in CSV + JSON, studio download section. The one that matters.
2. `inventory` and `coverage`.
3. Printable report.
4. `profile`, and the cross-station notes for Pacifica.
