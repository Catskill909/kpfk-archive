# KPFK app family — shared feeds, shared risks

**This file is identical in three repos. Edit it in one, copy it to the other two in the
same session** (like `public/text.js` and `archive-search.js`):

- `kpfk-archive/docs/APP-FAMILY.md`
- `kpfk-discovery-plugin/docs/APP-FAMILY.md`
- `kpfk-podcast/docs/APP-FAMILY.md`

Updated 2026-09-26.

## The three apps

| App | Repo | Live | Reads | Role |
|---|---|---|---|---|
| **KPFK podcast web app** | `kpfk-archive` | podcasts.kpfk.org (also podcast.kpfk.org) | Pacifica JSON feed (`archive.kpfk.org/fe_feed/…`) | The main app. Serves `/api/archive` to the other two |
| **Discovery plugin** | `kpfk-discovery-plugin` | kpfk-discovery.pacifica.audio (beta) | QIR API (Ace) + podcast web app's `/api/archive` + Pacifica feed (show images) | Plugin **to the podcast web app**: search, summaries, transcripts. Will move into it |
| **KPFK Podcasts mobile** | `kpfk-podcast` (Flutter) | iOS/Android, `podcast.pacifica.kpfk` | Podcast web app's `/api/archive` (Talk shows only) | Mobile sister app. Will inherit the QIR features (Discover module) |

```
Confessor (Otis) ──► Pacifica JSON feed ──► kpfk-archive ──► /api/archive ──┬─► kpfk-podcast (mobile)
                          │                                                 └─► Discovery (archive mode)
                          └──► QIR (Ace: transcripts, summaries) ──► Discovery (QIR mode, default)
```

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

How each app copes today:

- **kpfk-archive** `lib/pacifica/normalize.js`: accepts all of the above. **But
  `normalizeCatalog()` rejects the whole catalog if one record breaks identity rules**
  (`fail()`). `lib/pacifica/service.js` then keeps serving the last good copy, marked
  stale, and retries with backoff — so every new episode stops until the record is fixed
  (blank only on a cold start with no saved snapshot).
- **kpfk-podcast** `lib/core/services/kpfk_catalog.dart`: accepts all of the above. **One
  malformed row throws `FormatException` and the whole catalog fails.** What the app then
  shows from its local cache was not checked (2026-09-26). Future-dated Talk items would
  sort first.
- **Discovery** `lib/qir/service.js`: skips and counts a malformed QIR record, never the
  catalog. `air_start: null` shows "Time not listed"; Just aired hides future items (W5).

**Open risk:** the two strict parsers mean one bad off-schedule upload freezes
podcasts.kpfk.org (and, through `/api/archive`, the mobile app and Discovery's archive
mode) at its last good copy. Not fixed; see action items.

## Feed rules — we handle upstream problems ourselves (Paul, 2026-09-26)

Stations have outages, recordings fail, records get mistyped. Every known problem has a
rule, applied **once, in kpfk-archive** (which reads the Pacifica feed for all three apps:
its `/api/archive` feeds the Flutter app and Discovery), or in Discovery for QIR. Each rule
**corrects** what is knowable, **holds back** what would mislead, and **records** it
(`/healthz` → `pacifica.catalog.skipped`, `archiveFilter.*`; server log) for an anomaly report.

| Problem | Rule | Where | Recorded as |
|---|---|---|---|
| One malformed show/episode | Skip that record; >20 records **and** 5% rejects the catalog (last-good kept) | kpfk-archive `normalize.js`; Flutter `kpfk_catalog.dart` | `catalog.skipped` |
| Failed recording (outage, blackout: file of a few seconds) | Read the first 16 KB of each new mp3 once; under 1 MB **and** under 60 s of audio (or none), or 404 → hidden | kpfk-archive `audio-probe.js`, `service.js` | `archiveFilter.failedRecordings` |
| Wrong or missing duration | The file's own length replaces the feed's when off by >1 min and 10% | same | `archiveFilter.durationCorrected` |
| Pre-uploaded, future-dated episode | Held until its air time, then appears by itself | kpfk-archive `service.js`; Discovery `lib/qir/pending.js` | `archiveFilter.heldUntilAir` |
| Show typed Music, episodes Talk (upload shows) | Explicit `showTypes` list in `stations/kpfk.json` (never guessed: Flutter Talk-only licensing rule) | kpfk-archive `normalize.js` | catalog `diagnostics` ("corrected") |
| Spanish shows | "Español" is its own category, **En Español** (was filed under Special Programming) | `stations/kpfk.json` (both web apps), Discovery QIR mapping | — |
| Empty show records (one-off specials, fund drives, old duplicates) | Never listed (no episodes) | all | — |
| Duplicate records with episodes | Explicit `hiddenShows` keys only, never by date | Discovery `stations/kpfk.json` | HANDOFF W1 |
| Missing pictures in schedule/now playing | Catalog picture used | kpfk-archive `service.js` | — |
| HTML entities/tags in text | Decoded (`public/text.js`, shared) | both web apps | unknown entity logged |
| QIR behind | Archive episodes aired in last 48 h shown "Transcript pending" | Discovery `lib/qir/pending.js` | `/healthz` `qirPending` |
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

Otis told Paul the special (off-schedule) programming is the issue. The timing fits (the
last record touched before the re-run was the 3-min upload show), but only Ace's
processor logs can confirm it.

**Not the cause (checked):** the Pacifica feed is well-formed (every show/episode has
the usual fields and types, no orphans); the schedule weeks have no gaps, overlaps or
unknown shows; Discovery's server was ready, polling every 5 min, no page errors.
Discovery shows exactly what QIR has.

**Our side:** no code change. Discovery catches up by itself within 5 min of QIR resuming.

## Action items

| # | Who | What |
|---|---|---|
| 1 | Paul → **Ace** | QIR ingest stalled since ~02:00 PT 26 Sept; ask him to check the processor and the off-schedule uploads (null `air_start`, future dates). Send now — outage, not a queued question |
| 2 | Paul → **Otis** (next email) | Off-schedule uploads: future air dates, 0-s durations, `2kpfk` missing from `fe_channels.json`, Politics Or Pedagogy show `Music` vs episodes `Talk` |
| 3 | Dev | Watch: when QIR resumes, confirm Just aired shows today's 02:00–09:00 programs |
| 4 | **Done 2026-09-26** | kpfk-archive `normalizeCatalog()` and kpfk-podcast `KpfkCatalog.parse` skip one bad show/episode/row and record it (`skipped`: path, source, altid, date, issue — structured for a later anomaly report). Whole-document faults, and more than 20 records **and** 5%, still reject. kpfk-archive `/healthz` `pacifica.catalog.skipped`; server log. Tests for every record-fault kind in both |
| 5 | Dev (proposal) | A feed-health check that alerts when QIR's newest broadcast lags the Pacifica feed by more than a few hours, so a stall is seen before listeners see it |
| 6 | **Done 2026-09-26** (Paul: "QIR fallback essential") | Discovery `lib/qir/pending.js`: archive episodes aired in the last 48 h that QIR lacks (matched by mp3) are listed as "Transcript pending" (audio, song list; no summary/transcript) and vanish when QIR has them. If the QIR catalog cannot load at all, the page shows the station archive and says so. `/healthz` `qirPending` |
| 7 | Dev (proposal, not started) | Same skip-one-record rule for kpfk-archive `normalizeScheduleWeek()` (one bad slot drops the week), `normalizeChannels()` and `normalizeScheduleIndex()` |
| 8 | **Before the Otis email** | Do **not** ask Otis to add `2kpfk` to `fe_channels.json` as-is: a channel with the upload list's empty `listen` URL makes kpfk-archive reject the whole channels feed today (item 7). Fix item 7 first, or ask for a valid `listenUrl` |
| 9 | **Done 2026-09-26** | Feed rules above: failed recordings, true durations, air-time hold, `showTypes`, En Español. The Otis email shrinks to FYIs (source fixes are welcome, but nothing waits on them) |
| 10 | Dev (proposal) | Anomaly report page (studio) from the recorded lists, to send stations/Otis |
