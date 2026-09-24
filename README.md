# KPFK Archive

A modern, responsive, dark-mode listening app for the on-demand archive of
[KPFK 90.7 FM](https://www.kpfk.org/) — Free Speech Radio, Pacifica Radio in Los
Angeles — backed by a **light, zero-dependency Node server** that reads KPFK's
public **Pacifica JSON feeds** (catalog, schedule, now-playing).

**Live:** https://podcast.kpfk.org

KPFK's archive publishes every scheduled program's recordings. What it doesn't
carry is a browsing layer — search, category filters, a weekly schedule and a
player that persists while you navigate. That's the part this project adds.

> Unofficial project, built for the station. All data and media come live from
> Pacifica's public feeds, and every station link points to the real `kpfk.org`.

It began as a copy of the [WBAI Archive](https://github.com/Catskill909/wbai-archive)
and keeps its player, sheet, schedule and studio; the data layer was replaced to
read the Pacifica JSON feeds through a per-station profile.

## Features

- **Scheduled programs' archive** — every recording of every program in KPFK's
  published schedule, searchable by show name, host, show description and published
  episode topics/notes/guests, with separate show and episode results and category filters. Archive-only
  uploads and programs no longer on the air are not shown.
- **Built-in player** — any archived episode, or the live 90.7 FM stream, right in
  the app; resumes long shows where you stopped, without an account.
- **Weekly schedule** — KPFK's published schedule as a today-first, seven-day tabbed
  view with show artwork, opening scrolled to what's on air now.
- **On-air now and up next** — artwork, host, air times, and the song when the
  station's track recognition identifies one.
- **Show details and past episodes**, list or gallery view, shareable links with
  proper previews, lock-screen and car-display controls, keyboard shortcuts.
- **Installable** on phones and desktops, light and dark themes, touch-tuned layout.
- **Accessibility** — full keyboard navigation, screen-reader labels, one-key
  dismissal with focus returned, reduced-motion support.
- **Private station dashboard** at `/studio` — password-protected archive stats,
  listening figures and maintenance actions.
- **Downloadable listening figures** — the studio exports any date span (this month,
  last month, this year, all time, or dates you pick) as CSV for Excel or Google Sheets, or JSON. The files hold the same counters
  the dashboard shows and nothing else: still no identifier of any kind.
- **Built for every Pacifica station** — the same files and columns at each one, so
  Pacifica can put stations side by side ([docs/exports-for-pacifica.md](docs/exports-for-pacifica.md)).
- **Printable report** — one page for a board or funder with listening, what the
  archive aired and the program data gaps for any dates; the browser saves it as PDF.
- **Archive and coverage reports** — every episode listeners can play, by air date,
  and every show in Pacifica's catalog with its gaps (no artwork, no description, no
  recent episodes), as CSV or JSON. These describe programs, not listeners.
- **Move it to another server** — the studio downloads a backup of every usage month
  and restores it on a new install, with a preview first and an undo after. Imports
  accept counters only; a file carrying anything else is refused.
- **Listener insights, with privacy built in** — see how long people actually
  listen, plays, searches, and how far the station's reach extends — without
  ever tracking who anyone is.

## Endpoints

| Route | Description |
| --- | --- |
| `GET /` | The single-page app, rendered with the station profile (`no-store`, version-stamped assets) |
| `GET /api/archive` · `/api/archive/head` | Episodes of scheduled programs, from the Pacifica catalog · freshness probe |
| `GET /api/schedule` · `?weekStart=<epoch>` | Published schedule index · one week of slots (with same-origin artwork) |
| `GET /api/nowplaying` | Current and next program, track when identified |
| `GET /api/showinfo` · `/api/showinfo/<key>` | Program directory records (description, host, links) |
| `GET /api/artwork/<id>` | Same-origin proxy for catalog artwork (allow-listed; not an open proxy) |
| `GET /api/station` · `/station.js` · `/manifest.webmanifest` | Public station profile and app manifest |
| `POST /api/ev` | Usage beacon from the page — an event name, and for a play the media URL, and for a page view the browser's timezone (bucketed to one of three labels and discarded). No identifier of any kind; answers `204` to everything. Not registered at all when `USAGE_TRACKING=off` |
| `GET /studio` | Password-gated station view. **Only exists when `STUDIO_PASSWORD` is set** — otherwise the path falls through like any other unknown one |
| `GET /api/studio/export?dataset=<listening\|inventory\|coverage>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&format=<csv\|json\|readme>` | Studio download (signed-in only). `listening`: daily, per-show and reach counters for a span of UTC days. `inventory`: the archive's episodes and shows by local air date. `coverage`: every catalog show and its gaps (no dates). CSV takes `&table=daily\|shows\|reach`. See [docs/exports.md](docs/exports.md) |
| `GET /api/studio/export?dataset=profile&format=<json\|readme>` | Studio download (signed-in only): the station's public settings — exactly `/api/station` plus the category map |
| `GET /studio/report?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` | Printable report (signed-in; otherwise redirects to `/studio`): listening, archive and program-data gaps for the dates, built from the same data as the downloads. Print → Save as PDF |
| `GET /api/studio/backup` | Studio download (signed-in only): every usage month plus settings, checksummed — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) "Moving the app" |
| `POST /api/studio/import/preview` · `/apply` · `/undo` | Studio restore (signed-in, CSRF). Preview writes nothing; apply requires the preview's token and saves this server's copies first; undo puts them back |
| `GET /healthz` | Bundle version, feed state, `archiveFilter`, and storage identity (`storage.mounted`, `storage.instanceId`) |

The server has **no third-party dependencies** — only the Node standard library
and built-in `fetch`. Feeds are fetched server-side with conditional requests,
validated, and saved as last-good snapshots, so a Pacifica outage or a restart
during one keeps serving the archive and schedule.

Everything persisted lives under **`DATA_DIR`** (`/app/data` in the container,
`./data` locally): the studio's usage counters and the feed snapshots. Writes are
atomic and flushed on `SIGTERM`.

## Run locally

Requires Node 18+. No `npm install`.

```bash
npm start        # stations/kpfk.json, port 8081, ./data
npm test         # offline suites
```

Then open http://localhost:8081.

## Optional Discover interface

The new browsing layout is available at `/discover` when the station profile sets
`plugins.discovery` to `true`. KPFK enables this preview; the main app remains at
`/`. It uses the existing archive data and is independent of any transcript API.
See [configuration and current limits](docs/kpfk/discover-plugin.md).

## Station profile

Everything station-specific — identity, feed URLs, stream, allowed origins,
side-menu links and social accounts, logo and icons, category mapping — is in
[`stations/kpfk.json`](stations/kpfk.json). Another Pacifica station on the JSON
feeds would add its own profile rather than edit code.

## Deploy

One container on Coolify with a persistent volume at `/app/data` and a single
`STUDIO_PASSWORD` variable. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Docs

Start with [HANDOFF.md](HANDOFF.md) for current state, then [docs/README.md](docs/README.md)
for which documents describe this app and which are history inherited from WBAI.

## License

MIT — see [LICENSE](LICENSE).
