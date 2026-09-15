# CLAUDE.md — working rules for the KPFK Archive

This repo is **the** active project (since 2026-09-15). It began as a copy of
`wbai-archive`; WBAI is now maintenance-only in its own folder. Read
[HANDOFF.md](HANDOFF.md) for current state before starting work.

Guardrails that exist because we lost hours to them (most learned on WBAI, all
still true here). Follow them.

## 1. NEVER-STALE RULE — prove the browser ran the code you're judging

Editing `public/app.js` / `styles.css` and judging the result against a cached
copy the browser never reloaded cost days on WBAI. See
[docs/big-audio-bug.md](docs/big-audio-bug.md).

- `index.html` is served `Cache-Control: no-store`; `app.js` / `styles.css` links
  are version-stamped `?v=<size-mtime>`. `curl -s localhost:8081/healthz` →
  `version`; the page's `X-App-Version` header must match after a reload.
- Never conclude a client change did or didn't work until the versions match.

## 2. SERVER-REBOOT RULE — local server is port **8081**

Node does not hot-reload. `server.js`, `lib/**`, `stations/*.json` → **restart
required**. `public/*` → no restart (served fresh, version-stamped).

```sh
node --check server.js
PID=$(lsof -nP -tiTCP:8081 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID; sleep 1
npm start &                     # tools/start.js: stations/kpfk.json, PORT=8081, DATA_DIR=./data
curl -s localhost:8081/healthz  # expect station:"kpfk", archiveFilter.basis:"schedule"
```

**Kill only the 8081 process.** WBAI may be running on 8080 from its own folder —
never touch it from here. A backend change is not done until the restarted server
is verified.

## 3. DEBUGGING DISCIPLINE

- **Change one variable at a time.** If the symptom moves with each edit, you're
  perturbing a race — stop guessing and get evidence.
- **Don't swallow errors.** `.catch(function(){})` on `audio.play()` hid real
  failures for hours on WBAI. Log rejections; if something must be caught, say
  in a comment what and why.
- **Prefer the boring standard model.** Before touching live audio read
  [docs/live-audio-pattern.md](docs/live-audio-pattern.md): the live element is
  built and thrown away per play — never reuse it, never branch on `element.paused`.

## 3a. ASSERT THE EFFECT, NOT THE DECLARATION

A green suite that measures the wrong thing argues you're fine.

1. **Assert what the user experiences**, not what the code declares — synthesized
   input and real rendered HTML over reading styles or calling builders.
2. **Beware APIs that bypass the thing tested** (`scrollTop` moves a locked page;
   `p.click()` scrolls into view first — use `p.clickInPlace()`).
3. **One probe point is not a measurement** (`pageScrolls()` sweeps five points).
4. **Make "not X" assertions prove they can still see X** — the regression tests
   for the 2026-09-15 bugs (same-origin photos, scheduled filter, boot warm-up,
   WBAI assets, share tags) were each run against the unfixed code and shown to fail.
5. **The CSP (`style-src 'self'`, `img-src 'self'`) silently voids** injected
   `<style>`, inline `style=""`, and any cross-origin `<img>`. Set custom
   properties through CSSOM; hand the browser only same-origin (`/api/artwork/…`)
   or `/assets/` images.

A test that has never failed has never been shown to work.

## 4. PROD IS NOT YOUR LAPTOP — read its state, don't infer it

**Live:** https://kpfk-archive.supersoul.top (Coolify, Dockerfile build pack,
container port 8080). Deploys are manual — **push is not deploy**; a change is
live only after a Coolify redeploy and `version` in `/healthz` changes.

- Storage is a **named** Coolify volume at `/app/data`
  (`…-kpfk-archive-data`). Proven persistent on 2026-09-15: `storage.instanceId`
  `e4a9aac9-e3dd-4e9b-8c5b-17656032bd0d` survived a redeploy with
  `freshVolume:false`. **If that id ever changes, the volume was replaced.**
- What's on it: `stats/` (usage counters — **irreplaceable**), `pacifica/` (last-good
  feed snapshots — refill from upstream), `.instance.json` (identity; the server
  refuses a data dir stamped for another station).
- Local runs prove the code path, never the storage.
- Never add a Dockerfile `VOLUME`, never use a Coolify **Directory Mount** (host
  path) — always a named volume. `npm run hooks:install` once per clone wires the
  storage-safety pre-commit guard; override a line with `storage-safety:allow`,
  never `--no-verify`.
- Backups: `CONTAINER=<name> tools/backup-data.sh /backups` on the VPS. See
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 5. Project shape

- **Zero-dependency Node server** (`server.js`) + vanilla JS front end (`public/`).
  No build step.
- **Station profile** [`stations/kpfk.json`](stations/kpfk.json) holds everything
  station-specific: identity, feed URLs, stream, allowed origins, **side-menu
  links and socials**, logo/icons/share image, category map. Validated by
  `lib/station-config.js`; rendered into the page by `lib/station-view.js`
  (`{{station.*}}`, `{{menu.*}}`, manifest). **Prefer a profile setting over a code
  edit** — this is meant to serve other Pacifica stations.
- **Data layer** `lib/pacifica/`: `fetch-json.js` (bounded, origin-restricted
  fetches), `normalize.js` (catalog, channels, now-playing, schedule → app shapes),
  `service.js` (conditional polling, last-good snapshots, artwork proxy).
  - `catalog()` is an **untouched mirror** of the feed. `archive()` / `peekArchive()`
    is what listeners see: **only programs in the published schedule** (Paul's
    policy, 2026-09-15). Uploads (`2kpfk`) and unscheduled programs are hidden.
    A schedule outage falls back to the on-air channel and `/healthz`
    `archiveFilter.basis` says `primary-channel`.
  - Schedule and now-playing `photoUrl` from Pacifica is a bare `/pix` folder;
    every image comes from the **catalog** `photoUrl` joined by show key.
- **The app is JSON-only.** Never scrape Confessor, the archive HTML or RSS to fill
  a gap. If the feed is wrong, it goes to Pacifica's feed developer (Otis).
- **Schedule** (`paintPublishedSchedule` in `app.js`) renders published slots with
  WBAI's schedule markup: today-first rolling seven days, no week picker, Live by
  slot epochs. It must never touch an `<audio>` element.
- **Two `<audio>` elements share one player bar** via `barMode`
  (`'archive' | 'live'`). Keep the live side as close to the archive side as possible.
- **`/studio`** is password-gated (`STUDIO_PASSWORD`; unset = routes don't exist).
  Markup in `admin/` — deliberately outside `public/`. Its actions are the only
  state-changing routes: keep them idempotent, rate-limited, CSRF-guarded.
- **Usage counters** (`public/track.js`, `POST /api/ev`) carry **no identifier of
  any kind**, and search words are never sent. The README states this publicly —
  change the README in the same commit if collection ever changes.
- **Branding:** every image in `public/assets/` is KPFK's. `test/pacifica/branding.test.js`
  fails if any served file is byte-identical to a WBAI asset.

## 6. Tests

- `npm test` — inherited offline suites (run in legacy mode) plus
  `test/pacifica/*.test.js`: normalize, service (persistence, outage, scheduled
  filter, same-origin photos), HTTP integration (real server, fixtures, offline
  restart, branding tags, CSP), branding fingerprints, menu rendering.
  Add new offline suites to `tools/run-tests.js` in the same commit.
- Fixtures: `docs/fixtures/pacifica-kpfk-2026-09-14/` — pinned; add a dated set, don't replace.
- **Browser suites** (`test/live-stream`, `test/ui`, `test/schedule`,
  `test/episode-rail`, `test/share`, `test/touch`, `test/motion`) are **inherited
  from WBAI and not yet adapted to KPFK**. Make their WBAI assumptions
  configurable; don't edit expected values until green.

## 7. Working agreements

- Commit straight to `main` and push to `origin` (GitHub). No branches or PRs.
  **Never push to the `wbai-baseline` remote.**
- Say what you're about to do and roughly how long; anything over ~30 s runs in
  the background. Verify with the tools rather than handing checks back.
- Fix sure things inline; ask only for real decisions. Lead with "fixed", and
  report failures with their output.
- Clean up headless Chrome processes and profile dirs after browser checks.
