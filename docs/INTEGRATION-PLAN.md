# Integration plan — one app, Discovery as a plugin inside it

Started 2026-09-28 (Paul). Living plan: tick steps off here as they land.

**This file is identical in two repos** (like `APP-FAMILY.md`). Edit it in one, copy it to
the other in the same session: `kpfk-archive/docs/INTEGRATION-PLAN.md` and
`kpfk-discovery-plugin/docs/INTEGRATION-PLAN.md`.

## The goal

**One deployable app** (this repo, `kpfk-archive`) with two sides:

- **The main side** — the podcast site as it is: Pacifica feed, player, shows, schedule,
  live, studio. Works for every station.
- **The plugin side** — Discovery (QIR search, summaries, transcripts, Just aired), moved in
  from `kpfk-discovery-plugin`. Switched on per station in `stations/<id>.json`
  (`plugins.discovery`). Switch off → the site looks and behaves exactly as today, and no
  QIR code runs.

Why keep the switch even in one app: Discovery is a paid package (AI cost + Pacifica's
margin) and not every station will have it; a QIR outage must never affect the main side.

The Flutter app (`kpfk-podcast`) is unaffected as long as `/api/archive` keeps its shape.

## Rules for every step

1. **The bottom player is always visible and usable.** Sheets and popups open above it, never
   over it. No dead ends: every popup has a clear way back to where you were, and survives
   play, pause and episode changes.
2. **Popups use their width.** Today many cards stack everything in one column, with oversized
   buttons and empty space on the right. Lay content side by side where there is room,
   size buttons to their label, and check at phone width first, then desktop.
3. **One design system.** One set of colours, type, spacing, button sizes and popup layouts
   for both sides. No section brings its own look.
4. **One section at a time.** For each section or popup: compare both apps' versions, Paul
   picks (keep main / keep Discovery / blend), then build and check it.
5. **Stats stay anonymous.** Counters only, no identifiers, no search words
   (see `public/track.js` and the README).

## Steps, in order

Why this order: merge first, so every styling change happens once in one codebase instead
of twice; set the design rules and the player next, because every section sits on them;
add admin, stats and backup after the screens settle.

### Step 1 — Move Discovery in (no visible change)

**Progress (2026-09-28):** ✅ 1a profile settings · ✅ 1b server module `plugins/discovery/` ·
✅ 1c page at `/discover` · ✅ 1d tests in `npm test` (plugin tests in `plugins/discovery/test/`,
switched-off test in `test/pacifica/http.test.js`) · ✅ 1e local check with Discovery on (real
QIR and feed, port 8091): page and all its files load; catalog matches live Discovery (3,059
episodes, same holds, same music window, all 120 show pictures identical); transcripts, song
lists, Just aired refresh and `/healthz` work. Not yet looked at in a browser.
The old 24 Sept copy (`public/review.*`, `lib/qir/service.js`) is removed. Discovery's own
sign-in page is retired; until step 5 its QIR switch is set in the settings file on the volume
(`discovery/settings.json`, default on) and Discovery itself by `plugins.discovery` in the profile.

- Discovery's server code (`lib/qir/`, its routes, settings) becomes a module in this repo,
  loaded only when `plugins.discovery` is on.
- Its pages are served at `/discover` inside this app, still in their current look.
- One port, one Dockerfile, one Coolify deploy. Discovery's data (settings, hidden shows)
  moves to this app's named volume.
- Tests: Discovery's test suite runs in this repo's `npm test`; a switch-off test proves no
  QIR route exists and no QIR request is made.
- The separate Discovery deployment (kpfk-discovery.pacifica.audio) keeps running until
  Step 8.

### Step 2 — Design system and popup layout

**Progress (2026-09-28):** ✅ 2a one stylesheet (Discovery loads `styles.css`) · ✅ 2b player
frame: the bar is visible and usable under all 11 popups at phone and desktop (was 4 of 22
checks) · ✅ 2c popup layout on the show sheet and Discovery popup (two columns on desktop, Play
in the header on phones) · ⬜ 2d apply to the remaining popups. Rules, audit results and
how it is built: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Repeatable check: `tools/popup-audit/`.

- Merge both stylesheets into one set of tokens: colours, type, spacing, button sizes, corner
  radii, popup widths.
- One popup layout: side-by-side columns where there is room, compact buttons, one scroll
  area, close top-right, Back where a popup has inner pages.
- Page frame that reserves space for the bottom player on every page.

### Step 3 — The player

- One bottom bar (based on the main side's: ±15 s, scrubber, tap to open), always on screen.
- Transcript as an icon in the bar, so titles are not cut short.
- Tapping the bar opens a **Now Playing** sheet above the bar: Transcript/Songs · About ·
  More episodes. Transcript tab only when Discovery is on.
- Retire the copy of the player inside the show sheet (the real bar stays visible instead).

### Step 4 — Sections and popups, one at a time

For each: compare, Paul picks, build, check (phone first, player visible, way back works).

| # | Section / popup | Main side | Discovery | Pick (Paul, date) |
|---|---|---|---|---|
| 4.1 | Top bar (header) | ✓ | ✓ | **Main side's** top bar on both sides; Discovery's is dropped (2026-09-28) |
| 4.2 | Search bar, category dropdown, sort order | ✓ | ✓ | **Main side's** controls on both sides (2026-09-28) |
| 4.3 | All / Shows / Episodes tabs | — | ✓ | **On both sides** (2026-09-28) |
| 4.4 | Just aired | — | ✓ | **On both sides** (2026-09-28) |
| 4.5 | Show cards (gallery) | text on top of image | title, host, date, category under image | **Desktop: Discovery's** (text under image, cleaner). **Phone: main side's** (text on top), on both sides (2026-09-28) |
| 4.6 | Search results (archive search vs QIR search) | ✓ | ✓ | |
| 4.7 | Show sheet / past episodes | ✓ | ✓ | |
| 4.8 | Episode + transcript (Listen along) | — | ✓ | |
| 4.9 | Schedule | ✓ | — | |
| 4.10 | Live player | ✓ | — | |
| 4.11 | Menu, Donate, Privacy, About | ✓ | — | |
| 4.12 | Navigation between the two sides | ✓ | ✓ | |

Notes on the picks:

- **Just aired and the All / Shows / Episodes tabs on the main side** must work with
  Discovery switched off, so there they are built from the Pacifica feed (`/api/archive`:
  newest episodes, episode list), not from QIR. With Discovery on, the same sections add
  QIR's extras (summaries, "Transcript pending").
- **One card component** with two layouts chosen by screen width, not two separate cards.

### Step 5 — Discovery admin as a studio tab

- A **Discovery** tab in `/studio`, behind the studio login (Discovery's separate admin
  password goes away).
- The QIR on/off switch, hidden-show list, and QIR health: how many hours behind, the
  "Transcript pending" list.

### Step 6 — Stats for both sides in the studio

Existing counters stay. New counters, only when Discovery is on:

- transcript opened; transcript line clicked (jump to that moment)
- summary opened
- Discovery search used (count only, never the words)
- Just aired card played
- "Transcript pending" shown
- song list opened; Now Playing sheet opened (both sides)

Shown in the studio stats view with a Discovery column. README updated in the same commit.

### Step 7 — Import and export cover everything

The studio already has export, full backup, and import with preview / apply / undo. Add
Discovery's settings and hidden-show list to them, then prove a full restore onto a fresh
install (empty volume → import backup → same site, same stats).

### Step 8 — Production release

- Deploy the one app; check `/healthz` version and the storage `instanceId`.
- Point kpfk-discovery.pacifica.audio at `/discover` on the main site (redirect).
- Retire the separate Discovery deployment; archive the `kpfk-discovery-plugin` repo with a
  pointer here. Update `docs/APP-FAMILY.md` in both remaining repos.

## Open questions

- Flutter: when it shows Discovery features, it reads them from this app's API. Not part
  of this plan; note any API choices that affect it.
- Station setup: which Discovery settings belong in `stations/<id>.json` (fixed per station)
  and which in the studio tab (changed by staff).
