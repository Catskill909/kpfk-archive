# HANDOFF — KPFK Archive

**Updated:** 2026-09-15, end of session. **This folder is the active project.**
WBAI (`/Users/paulhenshaw/Desktop/wbai-archive`) is maintenance-only from here on.

Read this, then [CLAUDE.md](CLAUDE.md) (working rules), then
[docs/README.md](docs/README.md) (which docs are current vs inherited from WBAI).

## State at a glance

| | |
| --- | --- |
| Live | **https://kpfk-archive.supersoul.top** — Coolify app "KPFK Archive", Dockerfile build, container port 8080 |
| Repo | https://github.com/Catskill909/kpfk-archive · `main` · push to `origin` only (never `wbai-baseline`) |
| Deploy | Manual Coolify redeploy after push. Last verified deploy includes everything through `1276a51` (menu); later commits are docs only |
| Storage | Named volume `…-kpfk-archive-data` at `/app/data`. **Persistence proven** 2026-09-15: `instanceId` `e4a9aac9-e3dd-4e9b-8c5b-17656032bd0d` unchanged across a redeploy, `freshVolume:false` |
| Studio | `/studio`, password in Coolify env `STUDIO_PASSWORD` (runtime only) |
| Local | `npm start` → http://localhost:8081, `./data` |
| Tests | `npm test` green: inherited offline suites + 28 Pacifica tests |

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

## Open items, in order

1. **Paul:** save the studio password in a password manager, then delete
   `.env.coolify.local` (still present on the Mac; git- and docker-ignored).
2. **Backups:** on the VPS, `CONTAINER=<coolify container> tools/backup-data.sh /backups`
   plus the weekly cron line in the script. Not set up yet; `stats/` is irreplaceable.
3. **Artwork:** 20 scheduled programs have an empty catalog `photoUrl`, and Confessor has
   no image for them either. Examples: Something's Happening ×6, Counterspin, Radio Maiz,
   Contacto Ancestral, Making Contact. KPFK staff need to upload it in Confessor; it then
   appears automatically. Evidence: `docs/kpfk/artwork-evidence-2026-09-15/`.
4. **Android app link** is Google Play *closed testing*. Swap `links.androidApp` for the
   public listing once it exists.
5. **Browser test suites** (`test/live-stream` normal + `--strict`, `test/ui`,
   `test/schedule`, `test/episode-rail`, `test/share`, `test/touch`, `test/motion`)
   are inherited from WBAI and not adapted. Until they are, check Listen Live and one
   archive episode on a real phone after player changes.
6. **Docs:** WBAI-era docs in `docs/` (ARCHITECTURE, DEVELOPMENT, schedule-dev, …)
   describe WBAI's XML/scrape design. They're marked in `docs/README.md`; rewrite each
   when you next touch its area.
7. From the original plan (`docs/kpfk/implementation.md`): program-only deep links,
   studio source-health wording for JSON feeds, desktop (Tauri) KPFK build. None block
   the live web app.

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

**Final live audit (after the last deploy), over HTTP:**
- **Storage proof passed:** same `instanceId`, `freshVolume:false`, named volume, nothing quarantined.
- **Deployed bundle** matches the repo's `version` sizes.
- **Share card, icon and touch icon** are served byte-identical to the repo.
- **Menu:** 12 items and 4 socials, zero "WBAI" in the page.
- **CSP** `frame-src https://docs.pacifica.org`; studio API 401 without a session; no feed errors.
