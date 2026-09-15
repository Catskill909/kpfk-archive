# Deploying the KPFK Archive

One container, no database, no build step. It listens on **8080** inside the
container; Coolify's proxy (Traefik) terminates TLS in front of it. Everything
the server writes lives under **`/app/data`**, which must be a persistent volume.

The app reads only KPFK's Pacifica JSON feeds. Listeners' browsers play audio
straight from Pacifica; the server fetches feeds and show artwork.

## What the deployment needs

| Item | Value |
| --- | --- |
| Repository | `https://github.com/Catskill909/kpfk-archive`, branch `main` |
| Build pack | **Dockerfile** (not Docker Compose — Coolify ignores compose volumes) |
| Container port | `8080` |
| Domain | your KPFK archive hostname, HTTPS on |
| Environment variable | `STUDIO_PASSWORD` only (runtime, not build) |
| Persistent storage | Volume Mount → **`/app/data`**, a **new** volume just for KPFK |
| Outbound HTTPS | `archive.kpfk.org`, `confessor.kpfk.org`, `streams.pacifica.org:9000` |

## Deploy on Coolify

1. **New Resource → Application → Git repository** → `Catskill909/kpfk-archive`,
   branch `main`. The repo is public (checked 2026-09-15), so no deploy key is
   needed; if it is ever made private, connect it through Coolify's GitHub App.
2. **Build Pack: Dockerfile.** The image is `node:24-alpine`, runs as the
   non-root `node` user, and already sets `STATION_PROFILE=stations/kpfk.json`,
   `NODE_ENV=production`, `PORT=8080`.
3. **Ports Exposes: `8080`.** Add the domain; Coolify issues the certificate.
4. **Environment Variables** — add exactly one:
   - `STUDIO_PASSWORD` = a long random string (12+ characters). Untick
     **Build Variable** so it exists only at runtime and never lands in an image
     layer. Unset, `/studio` does not exist at all — the routes are never
     registered.

   Do **not** set `STATION_ID`, `STATION_TZ`, `DATA_DIR` or `PORT`. Identity and
   timezone come from the station profile (a mismatch refuses to boot) and the
   defaults are already right. `USAGE_TRACKING` defaults to `on`; `STUDIO_SECRET`
   and `STUDIO_SESSION_HOURS` are optional (see [`.env.example`](../.env.example)).
5. **Storages → Add → Volume Mount.** Name `kpfk-archive-data`, destination
   **`/app/data`**. Make it a new volume. **Never point it at WBAI's volume** — the
   server stamps its station into `.instance.json` and refuses to start on a data
   directory that belongs to another station.

   This is the studio's storage. `stats/` holds the usage counters (plays,
   listening time, live tune-ins, page views) — the one thing here no upstream
   can give back. `pacifica/` holds the last accepted feed snapshots, so a restart
   during a Pacifica outage still serves the archive and schedule.
6. **Deploy.** Then verify — see below. Coolify's log should show:

   ```
   [storage] /app/data — writable, fresh (…)     ← first deploy only
   [studio] enabled at /studio (sessions last 8760h)
   [usage] counting plays and page views (no identifiers, no search terms)
   [pacifica] KPFK: catalog, schedule and now-playing from https://archive.kpfk.org (no XML harvest)
   KPFK Archive server listening on :8080
   [pacifica] archive ready: ~1000 episodes (schedule, ~143 hidden)
   ```
7. **Redeploy once more** (no code change needed) and compare `/healthz` again.
   Only a second boot can prove the volume persists.
8. **Log in** at `https://<domain>/studio` with the password.

## Verifying a deployment

```sh
curl -s https://<domain>/healthz
```

**First deploy:**

| Field | Expect |
| --- | --- |
| `station` / `provider` | `"kpfk"` / `"pacifica-json"` |
| `ready` | `true` |
| `archiveFilter.basis` | `"schedule"` (the archive shows scheduled programs only). `"pending"` for the first seconds after boot is normal. `"primary-channel"` means no schedule could be loaded — check outbound access to `archive.kpfk.org`. |
| `storage.writable` | `true`. `false` = mount permissions; the container runs as uid `node`. |
| `storage.mounted` | `true`. **`false` = nothing mounted at `/app/data`; everything dies with the container. Go back to step 5.** |
| `storage.anonymousVolume` | `false`. `true` = Docker made a throwaway volume; it will be replaced next deploy. |
| `storage.freshVolume` | `true` (correct exactly once, now) |
| `storage.instanceId` | **write it down** |
| `storage.quarantined` | `[]` |

**Second deploy — the proof:**

| Field | Expect |
| --- | --- |
| `version` | changed if the code changed; identical on a plain redeploy |
| `storage.instanceId` | **identical to the first deploy.** Different = the volume was replaced, whatever the UI says. |
| `storage.freshVolume` | `false` |
| `storage.persistedSince` | older than `bootedAt` |

Then spot-check the listener side:

```sh
curl -s https://<domain>/api/archive/head      # count ≈ 1000, stale:false
curl -s https://<domain>/api/schedule           # 3 published weeks
curl -s https://<domain>/api/nowplaying         # current program
```

and open the site on a phone: the schedule, one archive episode playing, and
Listen Live playing.

**None of the storage checks mean anything locally.** A laptop has no container
boundary, so `./data` persists unconditionally. Only the deployed host proves
the volume (CLAUDE.md §4).

## Rehearsed before first deploy (2026-09-15)

Docker isn't installed on the development Mac, so the image was rehearsed by
assembling exactly the Dockerfile's `COPY` set (with `.dockerignore` applied)
and booting it with the container's environment against an empty data dir:

- fresh volume detected; `/healthz`, `/api/archive` (1,000 scheduled episodes,
  `archiveFilter.basis:"schedule"`), `/api/schedule` (3 weeks), `/api/nowplaying`,
  artwork proxy and homepage (KPFK, `no-store`, `X-App-Version`) all served;
  CSP allows `streams.pacifica.org:9000` and `archive.kpfk.org` audio;
- `/studio` login: wrong password 401; right password 200 with
  `HttpOnly; SameSite=Strict; Secure` cookie; `/api/studio/stats|usage|health`
  200 with the session, 401 without;
- two usage events counted → SIGTERM (what a redeploy sends) flushed
  `stats/2026-09.json` and all Pacifica snapshots → second boot on the same dir:
  same `instanceId`, `freshVolume:false`, counts intact;
- no `STUDIO_PASSWORD`: `/studio` and every `/api/studio/*` path are
  byte-identical to an unknown page (the homepage); login POST 405 like any
  unknown API. No login form, no data.

What this could not cover: the real Docker build, the Coolify volume, Traefik,
and the host's outbound network. Those are what steps 6–7 verify.

## Backups

**The VPS already has snapshots and full backups on a 10-day rolling window**
(Paul, 2026-09-15), so disaster recovery is covered and the script below is
optional. Neither Coolify nor the app backs anything up by itself.

Two things snapshots do *not* do, and which to reach for instead:

- **Restore one app without touching the others.** The script below pulls just this
  container's `/app/data`, so you are not rolling the whole host back.
- **Give anyone a readable copy, or one older than 10 days.** That is a reporting
  need, not a backup need — see [exports.md](exports.md).

On the VPS:

```sh
CONTAINER=<coolify-container-name> ./tools/backup-data.sh /backups
```

It copies `/app/data` to `kpfk-data-YYYY-MM-DD.tgz` and reports how many usage
stats months and feed snapshots it captured. Restoring puts `stats/` back into
this one container (instructions at the bottom of the script) — prefer that to a
whole-VPS snapshot restore, which rolls back every other app on the host.

## Protecting the data directory

`npm run hooks:install` (once per clone) runs `tools/check-storage-safety.js`
before every commit. It refuses a `VOLUME` line in the Dockerfile, a bulk
`COPY . .`, a moved `DATA_DIR` default, a compose mount that no longer matches
`DATA_DIR`, raw `writeFileSync` over persisted paths, and staged `data/` files.
Override one line with a `storage-safety:allow` comment, not `--no-verify`. It is
static analysis only: whether the volume persisted is answered by `instanceId`.

## Other ways to run it

Plain Docker (host port 8081 so it cannot collide with WBAI on 8080):

```sh
docker build -t kpfk-archive .
docker run -d --name kpfk-archive -p 8081:8080 \
  -v kpfk-archive-data:/app/data -e STUDIO_PASSWORD=… --restart unless-stopped kpfk-archive
```

Docker Compose: `STUDIO_PASSWORD=… docker compose up -d --build`.

Without Docker: `npm start` (port 8081, `./data`) — see [DEVELOPMENT.md](DEVELOPMENT.md).
