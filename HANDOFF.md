# HANDOFF — KPFK archive (Pacifica JSON)

**Written:** 2026-09-15, end of a Codex session, compiled by Claude Code.
**Read this first.** Then `docs/kpfk/implementation.md` § "Implementation checkpoint".

> **Two inherited files will mislead you.** `CLAUDE.md` in this folder is a
> byte-for-byte copy of WBAI's — its port-8080 restart recipe and WBAI-specific
> rules do not describe this app. `@handoff.md` is WBAI's August 12 UX handoff,
> not this project. The general disciplines in `CLAUDE.md` (never-stale §1,
> assert-the-effect §3a, prod-is-not-your-laptop §4) still apply.

## What this is

A copy of `wbai-archive` converted to read KPFK's **Pacifica JSON feeds**
(catalog, channels, now-playing, schedule index/weeks) instead of WBAI's
XML/scrape. Same vanilla-JS front end, same zero-dependency Node server, with a
station profile and a new provider layer.

- Station profile: `stations/kpfk.json` (identity, feeds, stream, origins, assets, categories).
- Provider code: `lib/station-config.js`, `lib/station-view.js`, `lib/pacifica/{normalize,service,fetch-json}.js`.
- The legacy WBAI provider still exists in `server.js`; `STATION_PROFILE` selects JSON mode.

## Repo state (as of this handoff)

| | |
| --- | --- |
| Folder | `/Users/paulhenshaw/Desktop/kpfk-archive` |
| Branch | `main` (was `kpfk-json` locally before the first push) |
| Commits | KPFK conversion is commit `f7f6222` on top of WBAI's full history (`f2ea8e8`). |
| Remotes | `origin` → https://github.com/Catskill909/kpfk-archive (push here). `wbai-baseline` → the local WBAI folder — **never push to it.** |
| Deploy | Never deployed. No host, no volume, no Coolify app. |
| WBAI | Separate folder, port 8080, own data. Do not touch it from here. |

Removed in the copy only: WBAI seed/fallback data (`seed/showinfo.json`,
`public/data/shows-fallback.json`), tracked Chrome test-profile files. The two
GitHub workflows are renamed `*.disabled` so they cannot monitor WBAI or build
WBAI installers from this repo.

## Run it

```sh
cd /Users/paulhenshaw/Desktop/kpfk-archive
npm start                        # tools/start.js → STATION_PROFILE=stations/kpfk.json, PORT=8081, DATA_DIR=./data
curl -s localhost:8081/healthz   # station:"kpfk", provider:"pacifica-json", per-resource pacifica status, storage
```

Node does not read `.env`; `tools/start.js` supplies the values. Restarting
after a `server.js` / `lib/` change — **kill only the 8081 process**:

```sh
node --check server.js
PID=$(lsof -nP -tiTCP:8081 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID; sleep 1
npm start &
curl -s localhost:8081/healthz
```

`public/*` changes need no restart; the bundle is version-stamped. Check the
`version` in `/healthz` against the reloaded page before judging a client fix.

## Tests

- `npm test` — `tools/run-tests.js`: the inherited offline suites (forced to
  `STATION_PROVIDER=legacy-xml`) and then `test/pacifica/*.test.js` (19 tests:
  normalize, service/persistence/outage, HTTP). **Result on 2026-09-15: see
  "Verification at handoff" below.**
- `npm run test:pacifica` — just the JSON adapter/service tests.
- Browser suites (`test/live-stream`, `test/ui`, `test/schedule`,
  `test/episode-rail`, `test/share`, `test/touch`, `test/motion`) are **inherited
  from WBAI and have not been adapted or run against KPFK.** Their WBAI
  assumptions need making configurable, not expected values edited until green
  (see `docs/kpfk/verification.md` §3).

## Doc map

| Doc | Use it for |
| --- | --- |
| `docs/kpfk-json-migration-plan.md` | The original audit of the JSON feeds and why this approach |
| `docs/kpfk/architecture.md` | Contracts and decision record (IDs, providers, last-good, artwork proxy) |
| `docs/kpfk/implementation.md` | Phase plan 0–6B **plus the 2026-09-15 checkpoint** — what is done and what remains |
| `docs/kpfk/verification.md` | Contract/service/browser test matrices and the release checklist (all unchecked) |
| `docs/kpfk/archive-page-audit.md` | HTML archive page vs JSON comparison |
| `docs/kpfk/artwork-audit-2026-09-15.md` | Why some show images are missing (with per-URL probe evidence) |
| `docs/fixtures/pacifica-kpfk-2026-09-14/` | Pinned raw feeds + headers + checksums; tests use these, don't replace them |

**Episode policy (confirmed with Paul, do not re-litigate):** show every episode
in the accepted JSON catalog. No app-side episode cap, date cutoff, duration
filter or expiry gate. Successful refresh replaces membership; a failed or
invalid refresh keeps last-good.

## Done this session (2026-09-15)

1. **Missing show artwork is a feed issue, not app code.** Verified across all eight
   JSON feeds, including 1,140 episodes and nested publication data. The catalog
   has 184 directory entries: 103 with `photoUrl`, 81 empty. Of the 109 shows with
   recordings, 28 have no image (for example Counterspin, Radio Maiz, Contacto
   Ancestral, Something's Happening). There is no alternate image field. All 103
   supplied URLs load directly and through `/api/artwork/`. All 444 schedule slots
   and now-playing use `https://confessor.kpfk.org/pix` with no filename, which
   returns 403 HTML.
2. **Placeholder replaced.** The orange "K" is gone. Missing artwork now shows
   `public/assets/kpfk-artwork-placeholder.svg`, a dark charcoal gradient with a
   faint waveform set as a CSS background layer in `styles.css`. The old
   `kpfk-placeholder.svg` is no longer referenced and can be deleted.
3. **Station logo.** The header, hero and menu use `public/assets/kpfk-logo.png`
   (Paul's file) through `stations/kpfk.json` → `assets.logo`.
4. **Listen Live metadata fix.** Pacifica sends `track: []` when song ID has
   nothing, which is normal during talk. That used to hide the program info.
   `normalizeNowPlaying` in `lib/pacifica/normalize.js` now treats an empty track
   as no song and keeps current/next program, hosts, artwork and airtime. A
   regression test covers it. Live audio itself was always working.

## Schedule — matches WBAI (2026-09-15, later)

Paul's rule: **the KPFK schedule looks and behaves exactly like WBAI's.** Codex had
built a separate text-only renderer with a week `<select>` and a Sun–Sat strip.
It now uses WBAI's markup, fed by the published slots (`paintPublishedSchedule`
in `app.js`):

- Rolling seven days from station-today, today-first tabs, **no week picker**.
  Every published week overlapping the window is fetched, so Sun/Mon come from
  next week's file. Tabs are keyed by station date, not weekday.
- WBAI cards: thumbnail, title, "Category · Host", Live badge. **Live** is a
  clock comparison against the slot's real start/end epochs (not title
  matching), and the body scrolls to it on open.
- A card opens the show's most recent recording. A program with no recordings
  expands in place with its description instead. It never plays or borrows an
  episode, and the live chooser hides "past episodes" for it.
- Images: the server attaches a same-origin `photo` (`/api/artwork/…`) to every
  slot, joined against the catalog at request time. The CSP is `img-src 'self'`,
  so a raw `photoUrl` can never render, which is why the old schedule had no
  pictures. Test: `test/pacifica/service.test.js`, "every photo … is
  same-origin", which checks every payload. It was proven to fail with the join removed.

Verified in headless Chrome against 8081: no dropdown, 7 tabs, 24/24 images
loaded, Live row correct, no-recording expand/collapse (forced by intercepting
`/api/archive`), zero JS errors.

## Waiting on Pacifica's engineer

Paul was about to send these on 2026-09-15. Check with him whether he did and
what came back:

- Are the 81 empty catalog `photoUrl` values missing source artwork, or is the exporter omitting it?
- Schedule/now-playing `photoUrl` is `https://confessor.kpfk.org/pix` with no filename (403). Is that intentional, and is there another artwork source?
- **Paul says the live site shows a global default image for shows without art.**
  It is not in any of the eight JSON feeds (station/channels metadata have no
  logo/default field). Ask for that URL or have it added to the feed. Until then
  our dark placeholder stands in. If a URL arrives, it belongs in
  `stations/kpfk.json` (not hardcoded CSS), and the origin must be allowed in
  `origins.artwork`.

## Remaining work (from the implementation checkpoint, in rough order)

1. **Rewrite `CLAUDE.md` for KPFK** (port 8081, JSON provider, the docs above)
   and retire or rename `@handoff.md`.
3. Live/archive audio checks in a real browser: sleep/resume, Media Session, and
   an observed program transition. Adapt `test/live-stream` to KPFK and run
   normal **and** `--strict`.
4. Program-only deep links, nested sheet/history and slot-specific details in
   the schedule. (The schedule itself now matches WBAI's — see "Schedule" below.)
5. Studio: source-health wording and JSON-safe refresh actions. Remove leftover
   legacy startup diagnostics.
6. Branding and content: final artwork, confirmed donate/privacy links, the
   station menu, and an accessibility/mobile pass.
7. Deployment: pick a host, mount a dedicated KPFK volume at `/app/data`, and
   verify `storage.instanceId` across two deploys.
8. Desktop (Tauri): KPFK profile, bundle id, URL and coexistence with WBAI.
   Signing is Pacifica team `233P5YECLZ`.

## Verification at handoff

- Server on 8081 healthy: `station: kpfk`, `provider: pacifica-json`, catalog
  1,143 rows ready, channels/now-playing ready, schedule index + week marked
  `stale: true` (serving last-good, no error), `storage.quarantined: []`.
- `npm test`: **passed, exit 0.** Inherited offline suites all "0 failed"
  (46, 8, 3, 27, 15, …); `test/pacifica` 19/19 pass, including "empty track
  array preserves the current program and next program".
- Not verified at handoff: any browser suite against KPFK, and the
  placeholder/logo visuals beyond Codex's own browser check.
