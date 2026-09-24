# HANDOFF — KPFK Archive

**Updated:** 2026-09-23 (client review, core search, separate plugin repository). **This folder is the active KPFK podcast-template project.**
WBAI (`/Users/paulhenshaw/Desktop/wbai-archive`) is maintenance-only from here on.

Read this, then [CLAUDE.md](CLAUDE.md) (working rules), then
[docs/README.md](docs/README.md) (which docs are current vs inherited from WBAI).

## State at a glance

| | |
| --- | --- |
| Live | **https://podcast.kpfk.org** — Coolify app "KPFK Podcasts" on the Pacifica/Contabo server, Dockerfile build, container port 8080. Deployed 2026-09-19; `kpfk-archive.supersoul.top` was stopped the same day |
| Repo | https://github.com/Catskill909/kpfk-archive · `main` · push to `origin` only (never `wbai-baseline`) |
| Deploy | Manual Coolify redeploy after push. The 2026-09-23 work in this handoff is local and **has not been committed, pushed or deployed from this repository**. Older deploy audit notes below describe prior releases; do not infer current live code from them. |
| Storage | Named volume `…-kpfk-archive-data` at `/app/data`. **Persistence proven across three redeploys** 2026-09-15: `instanceId` `e4a9aac9-e3dd-4e9b-8c5b-17656032bd0d` unchanged every time, `freshVolume:false`, and the usage counters kept counting across all three |
| Studio | `/studio`, password in Coolify env `STUDIO_PASSWORD` (runtime only — **not** on the Mac and not in the repo; read it from Coolify, never from a file) |
| Local | `npm start` → http://localhost:8081, `./data` |
| Tests | Current local `npm test` passed: inherited offline suites + 50 Pacifica tests before one additional QIR date/time case; that 8-test QIR suite passed afterward. The standalone plugin has its own tests/CI. |

## Resume here — current session checkpoint

- **Two separate local projects are running:** this KPFK podcast template on
  http://localhost:8081 and the independent plugin on http://127.0.0.1:8082.
  The plugin lives at `/Users/paulhenshaw/Desktop/kpfk-discovery-plugin`.
- **Private plugin repository:** `pacifica-foundation/kpfk-discovery-plugin`,
  `main` at `9b36196`, visibility verified PRIVATE. Its first GitHub Actions
  offline run passed. The product name is **undecided**; the repository name is
  temporary. Its local working tree was clean after the push. Read that repo's
  README, HANDOFF and docs before further plugin edits.
- **Standalone plugin result:** approved discovery layout, server-side QIR adapter,
  archive preview, transcript-local search and timestamp playback. Added the
  template-style player with artwork, play/pause, desktop ±15 seconds, elapsed /
  duration and a touch/keyboard scrubber. Ten offline tests and 15 live-browser
  player checks passed. No production deployment and no live QIR verification:
  a working `QIR_API_KEY` has not been supplied. Transcript timestamps are not
  confirmed editorial chapter markers.
- **Template result:** 2026-09-23 changes in *this* repository are still an
  **uncommitted working tree**. They include core show/episode search improvements,
  the earlier embedded Discover prototype/API foundation, tests and planning docs.
  The embedded `/discover` view is a development snapshot; future plugin changes
  belong in the separate repository. Do not mistake the private plugin push for
  a push or deployment of the podcast template. Review this tree before committing
  it; preserve the user's existing work and never push `wbai-baseline`.
- **Next KPFK work:** verify Ace's API with a renewed key supplied through a
  secure runtime channel; check real IDs, transcript coverage, permissions,
  corrections and marker format. Continue the screenshot-driven homepage/show/
  episode modal fixes in this template. Decide later which tested plugin features
  become shared across Pacifica stations.
- **Later template phase:** [station setup in admin](docs/kpfk/station-admin-template-plan.md)
  for supported JSON feeds, uploaded branding, editable copy, preview/apply and
  rollback. This is planned, not built.
- **Private conversation:** `.local-notes/client-review-2026-09-23.md` is
  Git-ignored. Keep candid discussion there. No email to Ace has been sent.

## Plugin extracted to its own private repository — 2026-09-23

**Future plugin development belongs in `/Users/paulhenshaw/Desktop/kpfk-discovery-plugin`.**
Private repo: https://github.com/pacifica-foundation/kpfk-discovery-plugin.
Working repository name only; product name intentionally undecided (Paul).
Independent local server: **http://127.0.0.1:8082**; template stays on 8081.

The standalone app includes the approved design, QIR adapter, transcript search,
full technical docs, Dockerfile/CI and template-style player/scrubber. Initial implementation commit `ae5b937` and handoff commit `9b36196` pushed; private visibility verified. 10 offline tests and 15 live
browser checks passed. No live deployment and no working QIR key yet. Private
notes, data and this repo's Git history were not copied. The embedded Discover
files remain a historical development snapshot; do not evolve both copies.
See the new project's README and HANDOFF for authoritative plugin status.

## QIR beta foundation — 2026-09-23

[Build status and limitations](docs/kpfk/qir-beta-build.md): Discover now has an
explicit archive/QIR selector, metadata/date filters and QIR transcript loading,
local transcript search and timed cue playback. Server-only adapter exists;
**working QIR credentials still pending, no live QIR verification**. Tests used
controlled responses for transcript paths. Chapters and global full-transcript
search remain future work. Current local URL: http://localhost:8081/discover.

## Direction update — KPFK beta plugin and station template

Paul clarified: the new design belongs first to the KPFK QIR beta plugin,
demonstrating Ace's VPS API, transcripts, markers when supported and advanced
search. Core fixes continue; global-template adoption is decided phase by phase.
The Flutter sister app at `/Users/paulhenshaw/Desktop/kpfk-podcast` follows the
same boundary: ordinary catalog/search/playback remain independent of QIR, while
advanced discovery and transcript features are an optional, modular feature that
can be enabled per station. Its mobile integration is planned, not implemented.
The standalone discovery app/repository continues independently so the provider
API can change or move without forcing changes to every station app. See
[cross-platform discovery module plan](docs/kpfk/cross-platform-discovery-module.md).
The standalone plugin offers archive preview and a QIR mode that reports
connection pending without credentials; no live QIR connection is verified. Working credentials are pending. KPFK beta/production comes before
scaling to other stations.

Added explicit future scope: [admin station setup](docs/kpfk/station-admin-template-plan.md)
for JSON feed addresses, uploaded images, editable text, validated persistent
settings and plugin controls. This replaces the old planning hold; implementation
follows the current fixes/plugin work.

## Discover plugin — 2026-09-23

The preferred prototype is now an optional bundled interface at
**http://localhost:8081/discover**, linked as “Discover shows” in the main menu.
KPFK enables `plugins.discovery: true`; missing/false disables the route and
assets. Main app stays at `/`; QIR remains separate. [Config and evidence](docs/kpfk/discover-plugin.md).
Full test suite passed (43 Pacifica tests plus inherited suites); browser verified.
No deployment; local template server running on 8081. This embedded view is superseded for future plugin development by the independent 8082 project.

## Main app search — 2026-09-23

Implemented locally at **http://localhost:8081/?q=jazz**: richer metadata search,
separate show/episode results, ranked matches, grouped previews, scopes and honest
episode labels. Uses the existing player/sheets; no API plugin or deployment.
[Implementation and evidence](docs/kpfk/core-search-phase.md). Offline suite passed
(42 Pacifica tests plus inherited suites); focused browser checks passed. Next:
review integrated search, then homepage directory and modal layout integration.

## Local design prototype — 2026-09-23

Phase 0b built: [review notes and verification](docs/kpfk/phase-0b-review.md).
Run `npm start`, then open **http://localhost:8081/review.html**. Existing app
remains at `/`. Real catalog data, independent search, show/episode dialogs and
native audio playback; no QIR dependency. The approved concept was extracted into the separate plugin repository. No template
deployment. The old prototype files remain under `public/`; decide their release
disposition when the template work is committed or deployed.

## Client feedback review — 2026-09-23

Investigation and proposed phases: [review plan](docs/kpfk/client-review-plan-2026-09-23.md).
Reviewed four annotated screenshots, local implementation and live public API data.
Initial investigation made no application changes. A separate phase 0b prototype
has since been built (see above). Next: review the interactive layouts
and the [QIR API review](docs/kpfk/qir-api-review-2026-09-23.md). The supplied
API specification is now reviewed; authenticated access is pending. Core browsing fixes can
proceed independently of optional enrichment. Paul explicitly requires a dedicated,
modern search-results design as a core feature with the plugin disabled. Existing RSS, scheduled-program and
artwork policies remain in effect pending explicit decisions.

## Flutter companion — started 2026-09-21

Separate clone: `/Users/paulhenshaw/Desktop/kpfk-podcast`, based on
`Catskill909/podcast_app` at `006b5f0a`. Bundle/application ID on iOS and Android:
`podcast.pacifica.kpfk`. **No live radio, no schedule UI, NO MUSIC SHOWS** (Paul).
Uses this deployment's `/api/archive` JSON and requires both program and episode
to be explicitly Talk, with no Music category. The web archive's existing content
policy remains unchanged. Existing KPFK header and native icon artwork are reused.
Plan and audit: [docs/kpfk/flutter-app-plan.md](docs/kpfk/flutter-app-plan.md).
Implementation/test/build status is in the Flutter clone's own `HANDOFF.md`.

Re-verified 2026-09-21: `/healthz` answers `station:"kpfk"`, `ready:true`, catalog
fresh; archive, artwork, audio range and share routes all respond. Old supersoul
URLs in historical audit entries below describe past deployments.

## What the app is now

KPFK's on-demand archive, read entirely from Pacifica's public JSON feeds
(`archive.kpfk.org/fe_feed/…`), with WBAI's player, sheet, schedule and studio.

- **Archive:** every episode of every program in the **published schedule**
  (~1,000 episodes / ~99 programs). Archive-only uploads (`2kpfk`) and programs no
  longer scheduled are hidden, by Paul's decision. `/healthz` `archiveFilter` shows
  the basis and hidden count.
- **Schedule:** WBAI's look — today-first seven days, artwork cards,
  "Category · Host", Live badge by real slot times, no week picker.
- **Artwork:** from the catalog `photoUrl` only. Shows with no catalog image get the
  dark waveform placeholder. Schedule and now-playing images are joined from the catalog,
  because Pacifica's own fields there are a bare `/pix` folder.
- **Branding:** KPFK logo, KPFK PNG icons (lock screen, home screen, manifest),
  1200×630 share card. No WBAI asset is served (test-enforced).
- **Side menu:** built from `links` and `social` in `stations/kpfk.json`. It has
  X/Facebook/Instagram/YouTube, Schedule, Programs A–Z, Android and Apple apps, About,
  Pacifica, News, Donate, Volunteer, Contact, Privacy, and kpfk.org. Donate and Privacy open
  `docs.pacifica.org/kpfk/…` in the in-app frame. The header Donate button is shown.
- **App is JSON-only.** Feed problems go to Otis (Pacifica feed developer), not to
  scraping. Paul has discussed the known feed bugs with him.

## What `stats/` is

It comes up constantly, so: `stats/` is a folder **inside the storage volume**
(`/app/data/stats/`) holding **one small JSON file per calendar month**
(`2026-09.json` — hundreds of bytes to a few KB). It has no URL; it is not served.
That file is the entire usage database. There is no database server and no log files.

Each file is daily counters and nothing else:

```json
"2026-09-15": { "pageviews": 22, "plays": 1, "live": 2, "searches": 2, "shares": 0,
  "listenSeconds": 265, "liveSeconds": 264,
  "byShow": { "kpfk.kpfk.somethihappenihour": 1 },
  "secondsByShow": { "kpfk.kpfk.somethihappenihour": 1 },
  "byZone": { "national": 22 } }
```

- **No identifier of any kind** — no IP, cookie, session, device, user agent, and
  never the words typed into search (only that a search happened). The visitor IP is
  used once in memory for a rate limit, HMAC'd with a salt regenerated each boot and
  never written. `byZone` is the browser's own clock reduced to three buckets; the
  real timezone is discarded on arrival. The README states this publicly — change the
  README in the same commit if collection ever changes.
- **Why it is called irreplaceable:** it is the only thing this app *creates*.
  `pacifica/` is a copy of feeds Pacifica will hand back; `stats/` cannot be
  reconstructed from anywhere if it is lost.
- **Who reads it:** the studio's Listening section, Most listened shows and Reach.
  Monthly rollups are kept forever (they are tiny); "All time" means "since the
  oldest file". Counters are flushed to disk every 5s (`STATS_FLUSH_MS`) — the
  comment above it explains why 60s lost plays in production.

## Open items, in order

0. **`STUDIO_PASSWORD` — closed, do not re-raise.** The live password was shared in a
   chat transcript on 2026-09-15 so the studio fix could be verified. **Paul's call,
   same day: leave it.** Private machine, private conversation, and what studio access
   grants is a read-only dashboard plus rate-limited, idempotent feed refreshes — it
   cannot change content, listener data or configuration. Rotating it is one field in
   Coolify plus a redeploy whenever he wants it.
   *Also done 2026-09-15:* `.env.coolify.local`, the generated paste-into-Coolify
   scratch file that held it, was deleted from the Mac. It was never committed
   (`.env.*` is git-ignored) and nothing read it, so the value now exists **only** in
   Coolify's env. `.env.example` remains — a template, no secrets.
1. **Exports — phase 1 built 2026-09-16, not yet deployed.** The studio has an
   **Export** section at the top of the page: a calendar month (or all time) of the `listening` counters
   as Daily / Shows / Reach CSV, one JSON file, and a Read me. Spec, decisions and
   what changed from the plan: [docs/exports.md](docs/exports.md) ("Phase 1 — as
   built"). **Next:** Coolify redeploy, then the live audit (acceptance criterion 8:
   download September's Daily CSV on the live site and open it in Excel/Sheets).
   **Export is a dialog from the header button** (Paul, 2026-09-16). The old plain
   download links "started but downloaded nothing" on the live site; the dialog's
   fetch-then-save download **works live** (Paul, 2026-09-16). The old links' exact
   failure was never isolated.
   **Re-planned 2026-09-16 (Paul)**, and built the same day: **1b date spans**
   (from/to + presets) and **1c backup + import**, so the app and its data can move
   between servers (Export → Backup & restore: preview, then replace; undo; moving
   guide in docs/DEPLOYMENT.md). **Phase 2 built too:** *Archive* (inventory, by
   local air date) and *Coverage* (every catalog show and its gaps) in the Reports
   tab. **Phase 3 built:** the printable report (`/studio/report`, Export → Printable
   report → Open report, then Print or save as PDF). **Phase 4 built:** station
   profile export and [docs/exports-for-pacifica.md](docs/exports-for-pacifica.md).
   **Every export phase is built, deployed and verified live** (Paul, 2026-09-16:
   "everything works"). Live HTTP audit of that deploy: `studioVersion` 4-part and all
   six studio/app assets byte-identical to the repo; `instanceId` `e4a9aac9…`
   unchanged, `freshVolume:false`; feeds ready, filter `schedule`; every export,
   backup and import route 401 signed out, `/studio/report` 302 to `/studio`; CSP
   intact; `/api/station` still without feeds. **The phased export plan is complete.** Paul is testing everything together
   after the build (2026-09-16), so nothing from 1c onward has been tried live yet. Spec: "Revised plan" in docs/exports.md.
   *Found while building it, not fixed:* the dashboard's **Most listened shows**
   (`usageReport().topShows`) and **show history** (`showHistory()`) fell back
   to the slug for a show that has left the schedule — **fixed 2026-09-16** — they read only
   `episodeRecords()`. The export reads the catalog mirror as well
   (`exportShowTitle()`). Routing those two through the same lookup is a small
   change; it was left out to keep this commit to the export.
2. **Station settings in the studio — planned scope expanded (Paul, 2026-09-23).**
   The September 16 hold is superseded by the [station-admin plan](docs/kpfk/station-admin-template-plan.md);
   implementation follows the KPFK fixes/plugin beta. Historical context: Kept for the next
   station clone; KPFK is the template and still in beta. Spec not yet written. Paul, 2026-09-15: the
   **station timezone should be settable in the admin panel** rather than only in
   `stations/kpfk.json`. This would be the studio's first setting that *writes station
   configuration*, so it needs an override file on the data volume, precedence rules
   against the profile, validation, and it moves schedule rendering as well as
   reporting. Deliberately kept separate from the export build. Exports do not depend
   on it — they report whatever timezone is in force when they run.
3. **Backups — disaster recovery is covered, do not re-raise *that*.** (Moving the app
   between servers is a different need and is now planned: item 1, step 1c.) The VPS has snapshots and full
   backups for 10 days (Paul, 2026-09-15), so `tools/backup-data.sh` is redundant for
   disaster recovery. What snapshots do *not* give anyone is a portable, readable,
   longer-than-10-days copy — that is what the export above is for, and it is a
   reporting feature, not a backup feature.
4. **Artwork:** 20 scheduled programs have no image of their own, and Confessor has
   no image for them either. **Changed upstream by 2026-09-16:** the catalog no longer
   sends an empty `photoUrl` for them — it sends Pacifica's generic station picture
   (`https://confessor.kpfk.org/pix/KPFK_med.jpg`, on 78 shows). So the **listener app
   now shows that generic picture** for those 20 programs, not our dark waveform
   placeholder. **Decided (Paul, 2026-09-16): use it.** If the feed sends an image,
   the app shows it; the waveform placeholder is only for a blank field. No code
   change — that is already the behaviour. The coverage export and printable report
   still count the generic picture as "no artwork of their own" on purpose: they are
   the list of programs whose real artwork still needs uploading in Confessor
   (docs/exports.md phase 3). Examples: Something's Happening ×6, Counterspin, Radio Maiz,
   Contacto Ancestral, Making Contact. KPFK staff need to upload it in Confessor; it then
   appears automatically. Evidence: `docs/kpfk/artwork-evidence-2026-09-15/`.
5. **Android app link — done.** `links.androidApp` is the public Play listing (`1734883`).
6. **Browser test suites** (`test/live-stream` normal + `--strict`, `test/ui`,
   `test/schedule`, `test/episode-rail`, `test/share`, `test/touch`, `test/motion`)
   are inherited from WBAI and not adapted. Until they are, check Listen Live and one
   archive episode on a real phone after player changes.
7. **Docs:** WBAI-era docs in `docs/` (ARCHITECTURE, DEVELOPMENT, schedule-dev, …)
   describe WBAI's XML/scrape design. They're marked in `docs/README.md`; rewrite each
   when you next touch its area.
8. From the original plan (`docs/kpfk/implementation.md`): program-only deep links,
   studio source-health wording for JSON feeds, desktop (Tauri) KPFK build. None block
   the live web app. **Fixed 2026-09-16 — was WBAI-shaped in the studio's System panel:** "Programs 0"
   (the scraped `/programlist/` directory, which KPFK does not use) and "Records on disk
   at boot: 0 shows, 0 feeds" (the XML feed store, empty by design here — the Pacifica
   snapshots live in `data/pacifica/`). Both are labels, not wrong data; the two
   *charts* with the same problem were fixed on 2026-09-15 (see below).

## Session log — 2026-09-15

Codex did the JSON conversion (adapters, service, schedule, fixtures, `docs/kpfk/`).
Claude Code then made these changes, each committed with its evidence:

| Commit | Change |
| --- | --- |
| `f7f6222` | Initial push of the Codex conversion to GitHub |
| `21f1196` | Schedule rebuilt on WBAI's UI; slots get same-origin artwork (CSP had blocked it) |
| `5cb36d1`, `96ff717` | Artwork evidence for Pacifica (catalog vs Confessor vs RSS, per-show CSV) |
| `0b2e633` | Archive shows only scheduled programs (`service.archive()`) |
| `225677b` | Deployment audit: compose file was WBAI's (would collide with WBAI's volume), Dockerfile/backup/doc fixes, container rehearsal 24/24 |
| `e49ee12` | `/healthz` no longer reports a schedule outage straight after boot (warm-up) |
| `9272962` | WBAI's icon PNGs replaced (they showed WBAI on lock screens); PNG share card, touch icon, manifest |
| `1276a51` | Side menu from the station profile; donate + privacy links; CSP frame-src from links |
| end of session | Docs: README, CLAUDE.md, this handoff, `docs/README.md` index, implementation checkpoint |

**Live audit after that deploy, over HTTP:**
- **Storage proof passed:** same `instanceId`, `freshVolume:false`, named volume, nothing quarantined.
- **Deployed bundle** matches the repo's `version` sizes.
- **Share card, icon and touch icon** are served byte-identical to the repo.
- **Menu:** 12 items and 4 socials, zero "WBAI" in the page.
- **CSP** `frame-src https://docs.pacifica.org`; studio API 401 without a session; no feed errors.

## Session log — 2026-09-15, evening (studio)

Paul reported that the studio's **Most listened shows** chart named shows by slug
(`kpfk.kpfk.reggaecent`) where WBAI's shows real titles.

| Commit | Change |
| --- | --- |
| `761816b` | `usageReport()` read WBAI's XML `feedStore` for titles; on a station build that store is always `{}` (`server.js:383`), so every title fell back to the slug. It now reads `episodeRecords()`, the adapter the rest of the studio already used |
| `fb3168a` | Studio stops reporting what the JSON provider cannot measure: **Total size** (Pacifica carries no file sizes — the tile read "0.0 GB", which says *empty archive*, not *unmeasurable*) and the two **program-directory** coverage ratios (WBAI's scraped `/programlist/`, which read "0 of 99 matched"). Server sends `totals.bytes: null` and omits `coverage.directoryPrograms`; the page omits the tile and the meters |

**The class, for next time:** anything in the studio that reads `feedStore`,
`programCache` or per-episode `bytes` is reading a **WBAI XML-era source** that is
empty on a JSON station. Show data comes from `episodeRecords()`; descriptions from
`showInfo`. A count of 0 from those sources is not a finding, it is the wrong
question — either route it through the adapter or omit it, but never draw it as a zero.

**Tests** (`test/pacifica/http.test.js`, the real-server suite): it now signs in to
the studio, sends real `play` and `listen` beacons for one scheduled episode, and
asserts that every show named by `usage`, `stats` and `showhistory` carries the
archive's title, and that the studio reports no byte total and no directory ratio
while still reporting the totals it *can* measure. Both assertions were run against
the unfixed code and shown to fail (`kpfk.kpfk.backgroundbriefing`; `bytes: 0`).
`npm test` green: 28 Pacifica tests + the inherited offline suites.

**Browser proof of the client change** (CLAUDE.md §1), headless Chrome against
`/studio.js?v=aeb1-mu39hr9h`, the bundle the page actually loaded: tiles render
`Shows · Episodes · Audio held · Categories · Window` with no size tile, Coverage
renders the single ratio `99 / 99 · 100%`, and no empty gap lists. Five tiles were
still seen, so the absence is measured, not assumed.

**Live audit of the `761816b` deploy** (https://kpfk-archive.supersoul.top):
- **Most listened shows** now reads *Stairway To Heaven, Reggae Central, Global
  Village - Tuesday, Way Out West, Breakbeats And Rhymes* — no slugs in the usage
  chart, the 99-row table or show history.
- **Storage:** `instanceId` unchanged, `freshVolume:false`, named volume, nothing
  quarantined; the usage counters survived the redeploy and kept counting.
- **Deploy was real:** container booted 78s after the commit; `app.js` and
  `styles.css` served byte-identical to the repo; `X-App-Version` matched `/healthz`.
- **Feeds:** catalog, channels, schedule index, three weeks, now-playing all ready,
  none stale, no errors. Filter `schedule`: 1,004 episodes / 99 programs, 142 hidden,
  no `2kpfk`.
- **Artwork:** all 1,255 `photo` fields (archive, directory, now-playing, schedule)
  same-origin; all 82 distinct images load. Note the sibling `photoUrl` is the raw
  `confessor.kpfk.org` URL by design — it is data, never handed to the browser
  (`lib/pacifica/service.js:24`).
- **Branding/security:** no "WBAI" or "99.5" in the app or the studio; icons and
  share card byte-identical; CSP intact; studio API 401 signed out; bogus beacon 204.
- **Not an exposure:** `/data/stats/` answers 200 only because any extensionless path
  falls back to `index.html`. Real files under `/data/` 404. `stats/` is a directory
  *inside* the volume, with no URL.

**Live audit of the `fb3168a` deploy** (booted 2026-09-15 23:03 UTC):
- **Deploy is real:** live studio bundle moved `ac50-…` → `aeb1-…`; `studio.js` and
  `app.js` served byte-identical to the repo.
- **Payload:** `totals.bytes` null, `coverage.directoryPrograms` and `noDirectory`
  absent, `withDescription` 99/99 kept, measurable totals still real (1,005 episodes,
  990h, 8 categories), zero slug-shaped titles in usage, table or thinnest.
- **Browser proof** against `/studio.js?v=aeb1-mu3a29kd`, the bundle the live page
  loaded: tiles `Shows · Episodes · Audio held · Categories · Window` (no size tile),
  Coverage `99 / 99 · 100%`, no empty gap lists, no page errors.
- **Storage:** same `instanceId`, `freshVolume:false` — third redeploy running, and
  the counters kept counting (7 plays, 3,271s listened by then).
- **Feeds:** all ready, none stale, no errors; catalog grew to 1,147 episodes.

## Session log — 2026-09-16 (exports, phase 1)

Built phase 1 of [docs/exports.md](docs/exports.md): the `listening` dataset.

- `lib/export/csv.js` (RFC 4180, BOM, CRLF, formula-cell guard) and
  `lib/export/listening.js` (pure builder, column allow-list, manifest).
- `server.js`: `GET /api/studio/exports`, `GET /api/studio/export`,
  `exportShowTitle()`; `usageReport()` now shares `dayCounters()` and `zoneLabel()`
  with the export.
- Studio: Export section, first on the page (`admin/studio.html`, `public/studio.js`,
  `public/studio.css`).

**Evidence:** `npm test` green (32 Pacifica tests + inherited suites). Seven planted
bugs each seen to fail `test/pacifica/export.test.js`. Local 8081 restarted and
checked over HTTP (401 signed out, index, CSV headers). Headless Chrome ran
`/studio.js?v=b5fa-mu456ujp`, matching `/healthz` `studioVersion`: Export was
visible with *September 2026 / All time*, and all five links answered 200 with the
right filenames and a BOM on each CSV. `test/studio/run.sh` layout and sort suites
passed against 8081 at every width from 1280 to 360px.
**Not yet done:** deploy and live audit.

## Session log — 2026-09-16, afternoon (light-mode card container)

Paul: dark-edged artwork made the gallery cards look ragged on the cream page. Built a
**light-mode-only** card container; **dark mode must not change** (Paul's rule).

| Commit | Change |
| --- | --- |
| `22a0af7` | `.card-wrap` becomes a padded, rounded container (6px mat, 4px on phones); title, More link move in by the mat |
| `e0b35c7` | Mat `#f4eee6` — deployed, but invisible at normal distance against the white listing panel |
| `f9d0abf` | Mat `var(--surface-3)`, outline 16% / 18% hover — chosen from four tints rendered side by side |
| `a85deb9` | Shadows are the header pills' `--elev-1` / `--elev-2`; darker, taller title scrim so artwork lettering stops competing with the card title |
| `9ea69da` | List view: `.show-thumb` gets the same container at 60px — 3px `--surface-3` mat as an inset spread shadow, placeholder background clipped to the content box (no station asset path in the block), image inset by the mat |
| `2eb1eaa` | Info sheet: `.sheet-art` gets the same container with a 5px mat (18px frame, 13px art); the zoom badge moves in by the mat. Probe note: let the sheet's open animation settle (~3s) — a sub-pixel offset otherwise makes identical CSS screenshot two ways |

- **Scoping:** every rule is written twice — `:root[data-theme="light"]` and, inside
  `@media (prefers-color-scheme: light)`, `:root:not([data-theme])` — because
  `theme-boot.js` only sets the attribute on an explicit pick. The block sits after `.card-date`.
- **Proof dark is untouched:** headless Chrome, all four theme states (OS dark/light ×
  no pick/opposite pick) at 1280 and 390px, committed CSS vs edited CSS **on the same feed
  data** — pixel-identical. Two traps: a new episode between runs changes every screenshot
  (re-baseline, don't compare to a morning shot), and the first load in a fresh Chrome
  renders differently (warm up with one unmeasured load).
- **Live audit (`a85deb9`):** `styles.css`, `app.js`, `theme-boot.js` byte-identical to repo;
  `X-App-Version` = `/healthz`; `instanceId` `e4a9aac9…` unchanged, `freshVolume:false`;
  all feeds ready, filter `schedule`.
- Ported to WBAI the same day as one block (same tokens, same theme logic).

**Loose ends tied up the same evening (Paul: "so they don't get lost"):**

| Commit | Change |
| --- | --- |
| `854bc06` | **`/healthz` false "stale".** Feeds refresh lazily (no timer), but `health()` called "older than TTL" stale, so now-playing (15s TTL) read stale most of every minute and the catalog/schedule did whenever the site was quiet. `isStale(s)` = last refresh failed. Test `health: idle past TTL is not stale; a failed refresh is` failed on the old code. WBAI has no Pacifica layer — not affected |
| `f469381` | **Reduced motion still lifted dark-mode cards.** The override `.card-art.play-btn:hover` (0,3,0) lost to the lift `.card-wrap:hover .card.card-art.play-btn` (0,5,0); it now names the lift's selector. Paul approved touching dark mode for this. New suite `test/motion/reduced-motion-hover-tests.js` (wired into `test/motion/run.sh`, `APP_URL` for :8081) hovers every `:hover` rule that sets a transform and fails if the element's position changes; it failed on the old CSS and found no other instance. It lists what it can't reach (live-player controls, pseudo-elements) |
| `8bcb524` | Light-mode container for the last three artworks: player bar, the sheet's docked mini player, the past-episodes header (3px mat; image is in flow, so the mat is padding) |

Probe lessons from this round: **pin a probe to a show by title** — "first row" changed
*mid-run* when a new episode arrived and made dark mode look changed; and a desktop
sheet screenshot needs ~3s to settle. The scratch probes live only in the session
scratchpad; the reduced-motion suite is the one that became a real test.

## Next: port the exports to WBAI (Paul, 2026-09-16)

A **separate job in the WBAI folder** (`/Users/paulhenshaw/Desktop/wbai-archive`), its own
commits and deploy. Nothing is shared between the two apps' code or data. Decided:
- A WBAI backup holds usage months **and `data/feeds.json`** (WBAI's accumulated episode
  history, which upstream cannot re-send).
- Restoring a WBAI backup onto a WBAI server **merges episodes per show** (WBAI's own
  `mergeFeedItems`: keep every episode, no duplicates); usage months preview-then-replace.
- No published schedule and no station profile on WBAI: coverage drops that column, the
  profile export is not offered.
