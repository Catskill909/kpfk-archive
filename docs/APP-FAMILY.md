# KPFK app family — shared feeds, shared risks

**This file is identical in three repos. Edit it in one, copy it to the other two in the
same session** (like `public/text.js` and `archive-search.js`):

- `kpfk-archive/docs/APP-FAMILY.md`
- `kpfk-discovery-plugin/docs/APP-FAMILY.md`
- `kpfk-podcast/docs/APP-FAMILY.md`

Updated 2026-10-01 (Discovery runs inside the podcast site; mobile endpoints; the Flutter app reads QIR notes). Before: 2026-09-26.

## The vision (Paul, 2026-09-26) — read this first

- **QIR** is Ace's service. It makes the transcripts and summaries.
- **Discovery is the plugin.** Since 2026-09-28 it runs inside the podcast site
  (`kpfk-archive/plugins/discovery/`); the `kpfk-discovery-plugin` repo and its app are kept as
  staging (stopped). It is the only thing that talks to QIR.
- **The podcast site (`kpfk-archive`) and the Flutter app (`kpfk-podcast`)** are the main apps.
  They work on the Pacifica feed alone, for every station.
- **Where a station has Discovery switched on**, the podcast site and the Flutter app show
  Discovery's features. Where it is off, they work exactly as they do without it.

Discovery is a paid/package add-on (AI processing cost + Pacifica's margin); not every station
will have it. So: never copy QIR code into the main apps, and never let a main app depend on
Discovery. Everything that handles QIR being slow or down lives inside Discovery. Features
built from station data (feed rules, cue-file song lists) belong to the main apps.

## The three apps

| App | Repo | Live | Reads | Role |
|---|---|---|---|---|
| **KPFK podcast web app** | `kpfk-archive` | podcasts.kpfk.org (also podcast.kpfk.org) | Pacifica JSON feed (`archive.kpfk.org/fe_feed/…`) | The main app. Serves `/api/archive` to the other two |
| **Discovery plugin** | `kpfk-archive/plugins/discovery/` (was `kpfk-discovery-plugin`, now staging, stopped) | inside podcasts.kpfk.org since 2026-09-28 | QIR API (Ace) + the host's archive listing | **The plugin**: QIR search, summaries, transcripts. Switched on per station in the studio |
| **KPFK Podcasts mobile** | `kpfk-podcast` (Flutter) | iOS/Android, `podcast.pacifica.kpfk` | Podcast web app's `/api/archive` (Talk shows only); since 2026-10-01 `/api/plugins/qir/status` + `/notes` | Mobile sister app. Shows Discovery's headlines/summaries where a station has it on, same switch; transcripts planned |

```
Confessor (Otis) ──► Pacifica JSON feed ──► kpfk-archive ──► /api/archive ──┬─► kpfk-podcast (mobile)
                          │                                                 └─► Discovery (archive mode)
                          └──► QIR (Ace: transcripts, summaries) ──► Discovery (inside kpfk-archive)
                                                                              └─► /api/plugins/qir/* ─► web page, kpfk-podcast (planned)
```

## What the mobile app may read from Discovery (2026-10-01)

All on the podcast site's own host; **the app never holds a QIR key**. Every route is a 404
when Discovery is switched off for the station; the app then behaves as it does without it.
Plan: `kpfk-podcast/docs/WEB-FEATURES-PLAN.md`.

| Route | What | Size / caching |
|---|---|---|
| `/api/plugins/qir/status` | `state` (`ready`, `switched_off`, `not_configured`, …): the app's on/off signal | tiny, no-store |
| `/api/plugins/qir/notes` | QIR text for the archive's own episodes, keyed by `/api/archive` episode `id`, joined by exact mp3: `{qir, headline, summary, host, guest}` or `{pending, skipped}` | ETag (304), `max-age=300` |
| `/api/plugins/qir/transcript/<qir>` | WebVTT + plain text for one episode (`qir` from notes); 404 = no transcript | ~120 KB, no-store |
| `/api/plugins/qir/recent?since=…` | Episodes aired since a station-clock time (what the web polls every 2 min) | few KB |
| `/api/cue/<id>` | Cue-file song list (WebVTT) for an episode's `vtiUrl` | small |

Not for apps: `/api/plugins/qir/catalog` (~1.1 MB gzip, no-store, QIR's own shape). The
Talk-only filter runs in the app **before** joining notes; nothing from QIR adds an episode.

**How the Flutter app reads `status` (since 2026-10-01; a contract — rename a state and tell
the app):** 404, `switched_off`, `disabled`, `not_configured` = **off**: the app drops its
saved notes and looks as it did before QIR. `ready` = fetch `notes` with `If-None-Match`.
Anything else (`unavailable`, `not_verified`, a new state, HTTP/network errors, a bad body) =
**temporary**: the app keeps its last good notes. Measured 2026-10-01: `notes` is 362 KB gzip
(1.0 MB raw) for 1,176 rows; a 304 is 0 bytes. The app applies the same rule as the web's
`enrich`: headline/summary only where the feed has no topic/notes.

**Rule: any change to how one app reads feed data affects the others.** A field the
podcast web app adds, drops or reshapes in `/api/archive` reaches the mobile app and
Discovery with no deploy of theirs. A Confessor or QIR data quirk shows up in all three.
When fixing a feed problem in one repo, check the other two and write it down here.

## Upstream owners

- **Otis** — Confessor and the Pacifica JSON feed (schedule, shows, uploads, text).
- **Ace** — QIR API (transcripts, summaries, headlines). KPFK only, paid.
- **Paul** — decides; redeploys kpfk-archive in Coolify (a push is **not** a deploy there;
  Discovery auto-deploys on push).

## Off-schedule programs (uploads, `2kpfk`) — what is different

Pacifica's tools let staff publish programs **outside the schedule**. They land in the
feed's second list, `2kpfk` ("Upload"), beside the on-air list `kpfk`. Examples:
BradCast (`bradcast2`), Bike Talk Podcast (`biketalk`), Politics Or Pedagogy? 3 min
edition (`politicorpedagog`), Informativo Pacifica Online (`informap`). Every reader must
expect all of these:

| Trait (seen 2026-09-26) | Where | Effect |
|---|---|---|
| `2kpfk` is **not in `fe_channels.json`** (only `kpfk` is) | Pacifica feed | Anything that looks up an episode's channel by `plistid` finds nothing |
| Show `listen: ""`, `source: "Upload"` | Pacifica feed | No stream URL |
| **Future air dates** (Politics Or Pedagogy dated 27 Sept 12:50 on 26 Sept) | Pacifica feed and QIR | Becomes the "newest" item; `/api/archive` `latest` is in the future |
| Durations of 0, 1, 11, 29 s | Pacifica feed | Not a real length |
| No schedule slot → **`air_start: null`, `air_end: ""`** | QIR | No air time to show or sort by |
| Show `type: "Music"` while its episodes say `"Talk"` (Politics Or Pedagogy) | Pacifica feed | The mobile app's Talk filter drops the show |
| Recordings under a different record than the schedule/picture (BradCast `bradcast2` vs `friedman`) | Confessor | Duplicate or missing shows (Discovery HANDOFF W1/W6) |

All of these are now handled by the feed rules below (2026-09-26). Each app's part:

- **kpfk-archive** (podcast site): applies every rule once, for all three apps. One bad
  record is skipped, not the whole catalog.
- **kpfk-podcast** (Flutter): gets the corrected data through `/api/archive`; one bad row is
  left out, not the whole catalog.
- **Discovery**: skips a bad QIR record; "Time not listed" when `air_start` is null;
  future-dated items held until air time.

## Feed rules — we handle upstream problems ourselves (Paul, 2026-09-26)

Stations have outages, recordings fail, records get mistyped. Every known problem has a
rule, applied **once, in kpfk-archive** (which reads the Pacifica feed for all three apps:
its `/api/archive` feeds the Flutter app and Discovery), or in Discovery for QIR. Each rule
**corrects** what is knowable, **holds back** what would mislead, and **records** it
(`/healthz` → `pacifica.catalog.skipped`, `archiveFilter.*`; server log), and lists it in the
studio's **Feed anomalies** section.

| Problem | Rule | Where | Recorded as |
|---|---|---|---|
| One malformed show/episode | Skip that record; >20 records **and** 5% rejects the catalog (last-good kept) | kpfk-archive `normalize.js`; Flutter `kpfk_catalog.dart` | `catalog.skipped` |
| One bad schedule slot or day | Skip that slot/day, keep the week; >20 **and** 5% rejects the week (last-good kept) | kpfk-archive `normalizeScheduleWeek` | `week-*.skipped` |
| One bad schedule-index week entry | Skip it; no usable week at all rejects the index | kpfk-archive `normalizeScheduleIndex` | `schedule-index.skipped` |
| One bad extra channel (e.g. upload list with an empty stream URL) | Skip it. **The main channel must be valid** (it is what plays) — a bad main channel still rejects | kpfk-archive `normalizeChannels` | `channels.skipped` |
| Failed recording (outage, blackout: file of a few seconds) | Read the first 16 KB of each new mp3 once; under 1 MB **and** under 60 s of audio (or none), or 404 → hidden | kpfk-archive `audio-probe.js`, `service.js` | `archiveFilter.failedRecordings` |
| Wrong or missing duration | The file's own length replaces the feed's when off by >1 min and 10% | same | `archiveFilter.durationCorrected` |
| Pre-uploaded, future-dated episode | Held until its air time, then appears by itself | kpfk-archive `service.js`; Discovery `lib/qir/pending.js` | `archiveFilter.heldUntilAir` |
| Show typed Music, episodes Talk (upload shows) | Explicit `showTypes` list in `stations/kpfk.json` (never guessed: Flutter Talk-only licensing rule) | kpfk-archive `normalize.js` | catalog `diagnostics` ("corrected") |
| Spanish shows | "Español" is its own category, **En Español** (was filed under Special Programming) | `stations/kpfk.json` (both web apps), Discovery QIR mapping | — |
| Empty show records (one-off specials, fund drives, old duplicates) | Never listed (no episodes) | all | — |
| Duplicate records with episodes | Explicit `hiddenShows` keys only, never by date | Discovery `stations/kpfk.json` | HANDOFF W1 |
| No on-demand rights (KPFK: The Aware Show, 2026-10-01) | Explicit `withheldShows` keys: never served — no episode, card, search hit or QIR text. The app sees it gone from `/api/archive` and `qir/notes`; the live schedule still lists the slot | kpfk-archive `service.js`; Discovery `index.js` | `archiveFilter.withheld` |
| Missing pictures in schedule/now playing | Catalog picture used | kpfk-archive `service.js` | — |
| HTML entities/tags in text | Decoded (`public/text.js`, shared) | both web apps | unknown entity logged |
| QIR behind | Archive episodes aired in last 48 h shown "Transcript pending"; **log warning at 6 h behind** | Discovery `lib/qir/pending.js`, `server.js` | `/healthz` `qirPending.behindHours` |
| QIR down | Page shows the station archive, with a notice | Discovery `public/app.js` | — |
| Feed not updating / unreachable | Last-good served, marked stale | kpfk-archive `service.js` | `stale`, `error` |

Known limits: a full-length recording of dead air or the wrong program cannot be detected
without audio analysis. `AUDIO_CHECK=off` disables the mp3 check (offline tests; an audio host
that refuses range requests).

## Incident 2026-09-26 — Discovery "feed broken"

**What listeners saw:** Discovery's Just aired stuck at Midnight Snack (00:00, 26 Sept).
podcasts.kpfk.org and the mobile app were fine.

**Cause: QIR stopped taking in new episodes.** Checked directly against QIR with fresh
(`x-cache: MISS`) `updated_since` queries at ~10:50 PT:

- Last new broadcast processed: Midnight Snack, updated 09:07 UTC (02:07 PT).
- 09:43 UTC: a Politics Or Pedagogy episode (Jan 11) re-processed.
- 09:43–10:08 UTC: ~240 old Jan–Mar episodes re-processed.
- **Nothing changed after 10:08:41 UTC (03:08 PT).**
- Missing from QIR, present in the Pacifica feed: Potira 02:00, Awakenings 04:00,
  Way Out West 05:00, Alive and Picking 07:00, Special Programming 09:00.

**Root cause (confirmed by Paul with Otis and Ace, 2026-09-26): the consumers — QIR's
processor and our apps — were not parsing the special / off-schedule shows correctly. The
Pacifica feed was right; Otis needs to do nothing.** Ace fixed QIR's side; our side is the
feed rules above (off-schedule uploads, future dates, show types, failed recordings).

**Not the cause (checked):** the Pacifica feed is well-formed (every show/episode has
the usual fields and types, no orphans); the schedule weeks have no gaps, overlaps or
unknown shows; Discovery's server was ready, polling every 5 min, no page errors.
Discovery shows exactly what QIR has.

**Our side:** no code change needed for recovery; the "Transcript pending" fallback covered the gap.

**Resolved 2026-09-26 evening (Ace):** QIR processed 11 of the day's programs (Awakenings 04:00
through Afro-Dicia 16:00, updated 00:05–01:29 UTC 27 Sept). Discovery's pending list fell from
9 to 2 with no action from us, as designed: CodePINK Radio (never processed by QIR) and World
Massive 02:00 (skipped in QIR's catch-up; Paul: fine, we're in dev). Both leave "Transcript
pending" after 48 h. Otis was sent two FYIs the same day (cc Ace); no action needed from him.

## Status

**Done 2026-09-26** (all live and tested):
- QIR outage: Ace fixed it the same evening; Discovery caught up by itself.
- Discovery: "Transcript pending" when QIR is behind; station archive shown when QIR is down.
- Feed rules in the podcast site: one bad record skipped, failed recordings hidden, true
  durations, pre-uploads held until air time, 7 upload shows retyped Talk, En Español.
- Flutter: one bad row left out instead of failing.
- (27 Sept) Schedule and channels: one bad slot, day, week entry or extra channel is skipped
  and recorded; the main channel must still be valid. QIR-behind alert: `/healthz`
  `qirPending.behindHours` and a log warning from 6 h.
- Otis: sent two FYIs; **no action needed from him.**

- (27 Sept) **Feed anomalies** section in the podcast site's studio (`/studio`): everything the
  feed rules hid, corrected, held or skipped, by show name and air date, with counts and a
  "Copy as text" button for sending on. API `/api/studio/anomalies` (studio login).

**Open:** nothing from this incident. Next: styling, UI/UX and integration of the three apps.
