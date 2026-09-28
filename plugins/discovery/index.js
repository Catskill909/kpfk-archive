'use strict';
/* Discovery plugin: QIR search, summaries, transcripts, Just aired, song lists.
 *
 * Moved in from the separate kpfk-discovery-plugin app on 2026-09-28 (integration step 1,
 * docs/INTEGRATION-PLAN.md). The host server creates it only when the station profile has
 * `plugins.discovery: true`; otherwise none of this code runs and every route below is a 404.
 * This is the only code in the app that talks to QIR (docs/APP-FAMILY.md).
 *
 * What changed from the separate app: the archive listing, show artwork and security headers
 * now come from the host directly (getArchive, peekCatalog, securityHeaders) instead of over
 * HTTPS from podcast.kpfk.org, so Discovery's own archive fetch, artwork proxy and image cache
 * are gone. The admin page is gone too; its switch moves to the studio (step 5).
 *
 * Routes: /discover (page), /discover/<file>.js|css, /discover/station.js,
 * /api/plugins/qir/{status,catalog,recent,transcript/<id>}, /api/cue/<id>.
 */
const fs = require('node:fs');
const path = require('node:path');
const { publicProfile } = require('../../lib/station-config');
const { createQirService } = require('./lib/qir/service');
const { createSettings } = require('./lib/settings');
const { pendingEpisodes, splitByAirTime, splitByMusicWindow, withSongLists } = require('./lib/qir/pending');
const { applyCorrections, joinCorrectedParts } = require('./lib/qir/corrections');

const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST_PUBLIC_DIR = path.join(__dirname, '../../public');
// Identical files the host already serves; the page loads them from /discover/ like the rest.
const SHARED = new Set(['text.js', 'theme-boot.js', 'archive-search.js', 'styles.css']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/** True for every path this plugin owns, so the host can 404 them while it is switched off. */
function ownsRoute(pathOnly) {
  return pathOnly === '/discover' || pathOnly.startsWith('/discover/')
    || pathOnly.startsWith('/api/plugins/qir/') || pathOnly.startsWith('/api/cue/');
}

function createDiscovery({ station, env = process.env, dataDir = null, fetchImpl = fetch, now = () => Date.now(),
  getArchive, peekCatalog, securityHeaders }) {
  // QIR needs a station with the provider (profile plugins.qir; the adapter is KPFK-only) and
  // the settings switch. The switch can turn it off, never on for another station.
  const qirSupported = station.id === 'kpfk' && station.plugins.qir;
  const qir = createQirService({ enabled: qirSupported, key: env.QIR_API_KEY || '', audioOrigins: station.origins.audio, fetchImpl });
  const settings = createSettings({ dir: dataDir ? path.join(dataDir, 'discovery') : null, now });
  const qirOn = () => qirSupported && settings.get().plugins.qir.enabled;
  function qirStatus() {
    if (qirOn()) return qir.status();
    return { provider: 'qir', station: station.id, configured: false, state: qirSupported ? 'switched_off' : 'disabled', error: null, lastSuccess: null, episodes: null, skipped: null, chaptersSupported: false };
  }
  // The page's own config: the host's public profile plus what only Discovery reads.
  const config = { ...publicProfile(station), plugins: { discovery: true, qir: qirSupported }, hiddenShows: [...station.hiddenShows],
    archiveApp: '', storagePrefix: 'discovery:' + station.id + ':' };

  function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(type.startsWith('application/json') ? JSON.stringify(body) : body);
    // Beta: keep Discovery's responses out of search engines until the production release (step 8).
    res.writeHead(status, { ...securityHeaders(), 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store', ...extra, 'Content-Type': type, 'Content-Length': data.length });
    res.end(data);
  }

  // Show images for QIR shows the archive listing does not carry (upload shows: Bike Talk
  // Podcast, BradCast, ...). The host's catalog has every show record of every list with its
  // artwork route already registered, keyed the same way QIR keys shows (the feed's altid).
  function catalogPhotos() {
    const photos = new Map(), catalog = peekCatalog();
    for (const info of Object.values((catalog && catalog.directory) || {})) {
      if (info && info.upstreamAltId && /^\/api\/artwork\/[a-f0-9]{64}$/.test(info.photo || '') && !photos.has(info.upstreamAltId)) photos.set(info.upstreamAltId, info.photo);
    }
    return photos;
  }

  // Recent archive episodes QIR has not processed yet, marked pending (lib/qir/pending.js).
  // QIR-behind alert (2026-09-27): hours since the oldest station episode QIR has not reached
  // yet. Skipped episodes (QIR processed something later) are not lag. From LAG_ALERT_HOURS on,
  // the log warns once per new oldest episode; /healthz carries it.
  const LAG_ALERT_HOURS = 6;
  let lastPending = { count: 0, skipped: 0, error: null, behindHours: 0 }, lagWarnedFor = '';
  async function withPending(qirCatalog) {
    // Recordings filed under the wrong show are corrected first (lib/qir/corrections.js), so
    // the music window, cards, show pages and artwork all see the real show. Music older than
    // the station's window is dropped before anything else reads the catalog.
    const corrected = joinCorrectedParts(applyCorrections(qirCatalog.episodes, station.episodeCorrections, { warn: m => console.warn('[qir] ' + m) }));
    const { kept, expired } = splitByMusicWindow(corrected, { now: now(), timeZone: station.timezone, days: station.musicWindowDays, musicShows: station.musicShows });
    const { aired, held } = splitByAirTime(kept, { now: now(), timeZone: station.timezone });
    const catalog = { ...qirCatalog, episodes: aired, heldUntilAir: held.length, musicExpired: expired.length };
    let data;
    // Caught: the archive listing is unavailable with no last-good copy (first boot with the
    // feed down). The pending list is optional; QIR's own catalog is served, reason reported.
    try { data = await getArchive(); } catch (e) { console.warn('QIR pending fallback unavailable: ' + e.message); lastPending = { count: 0, skipped: 0, error: 'archive_unavailable' }; return { ...catalog, pending: lastPending }; }
    const unfiltered = pendingEpisodes(catalog.episodes, data, { now: now(), timeZone: station.timezone, primaryChannel: station.primaryChannel });
    const musicCut = splitByMusicWindow(unfiltered, { now: now(), timeZone: station.timezone, days: station.musicWindowDays, musicShows: station.musicShows });
    const pending = musicCut.kept; catalog.musicExpired += musicCut.expired.length;
    const waiting = pending.filter(p => !p.skipped);
    const oldest = waiting.reduce((a, p) => Math.min(a, p.aired_at), Infinity);
    const behindHours = Number.isFinite(oldest) ? Math.round((now() / 1000 - oldest) / 360) / 10 : 0;
    lastPending = { count: waiting.length, skipped: pending.length - waiting.length, error: null, behindHours };
    if (behindHours >= LAG_ALERT_HOURS && lagWarnedFor !== String(oldest)) { lagWarnedFor = String(oldest); console.warn(`[qir] QIR is behind: ${waiting.length} recent station episode(s) not processed, oldest ${behindHours} h ago; showing them as "Transcript pending"`); }
    return { ...catalog, episodes: withSongLists(catalog.episodes, data, station.primaryChannel).concat(applyCorrections(pending, station.episodeCorrections, { reference: catalog.episodes, warn: m => console.warn('[qir] ' + m) })), pending: lastPending };
  }

  // The served catalog is rebuilt only when QIR's episodes, the archive listing (its revision;
  // the host builds a new listing object on every call) or the minute (air-time hold, pending
  // window) change, so the 2-minute checks from open pages cost a lookup, not a rebuild.
  let served = {};
  async function servedCatalog() {
    const q = await qir.catalog();
    let revision = null;
    // Caught: archive unavailable. withPending reports it; it only changes the memo key here.
    try { revision = (await getArchive()).revision; } catch { revision = null; }
    const minute = Math.floor(now() / 60000);
    if (served.value && served.episodes === q.episodes && served.stale === q.stale && served.revision === revision && served.minute === minute) return served.value;
    const catalog = await withPending(q);
    served = { episodes: q.episodes, stale: q.stale, revision, minute, value: { ...catalog, artwork: await qirArtwork(catalog) } };
    return served.value;
  }

  // QIR carries no images. Use the archive's same-origin artwork: exact recording (mp3 URL)
  // first, else the show key embedded in archive file names (kpfk_YYMMDD_HHMMSS<show_key>.mp3),
  // which matches QIR's show_key; else a QIR show name that is an archive show name plus a
  // suffix ("Informativo Pacifica Online"); else the show record's own image in the catalog.
  async function qirArtwork(catalog) {
    let data;
    // Caught: an archive outage. It removes only the listing's art; catalog images still apply.
    try { data = await getArchive(); } catch (e) { console.warn('QIR artwork unavailable: ' + e.message); data = { shows: [], directory: {} }; }
    const byShow = {}, byMp3 = {}, newest = {};
    for (const row of data.shows) {
      if (!/^\/api\/artwork\/[a-f0-9]{64}$/.test(row.photo || '')) continue;
      const key = (/_\d{6}_\d{6}([\w-]+)\.mp3$/.exec(new URL(row.mp3).pathname) || [])[1];
      if (key && !(newest[key] >= row.dt)) { byShow[key] = row.photo; newest[key] = row.dt; }
      byMp3[row.mp3] = row.photo;
    }
    const plain = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^kpfk\s*-\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const byName = new Map();
    for (const row of data.shows) { const name = plain((data.directory[row.sho] || {}).name || row.title); if (name.includes(' ') && !byName.has(name) && /^\/api\/artwork\/[a-f0-9]{64}$/.test(row.photo || '')) byName.set(name, row.photo); }
    const qirNames = new Map(); for (const e of catalog.episodes) if (!qirNames.has(e.show_key)) qirNames.set(e.show_key, plain(e.show_name));
    for (const [key, name] of qirNames) {
      if (byShow[key] || !name) continue;
      // Two-word minimum keeps a generic one-word name from claiming unrelated shows; longest match wins.
      const match = [...byName.keys()].filter(n => name === n || name.startsWith(n + ' ')).sort((a, b) => b.length - a.length)[0];
      if (match) byShow[key] = byName.get(match);
    }
    const photos = catalogPhotos();
    for (const key of qirNames.keys()) if (!byShow[key] && photos.has(key)) byShow[key] = photos.get(key);
    // A corrected recording takes its real show's art, never the scheduled show's (corrections.js).
    for (const c of station.episodeCorrections || []) for (const mp3 of Object.keys(byMp3)) if (mp3.endsWith('/' + c.file)) delete byMp3[mp3];
    for (const [mp3, photo] of Object.entries(byMp3)) { const key = (/_\d{6}_\d{6}([\w-]+)\.mp3$/.exec(new URL(mp3).pathname) || [])[1]; if (key && byShow[key] === photo) delete byMp3[mp3]; }
    return { byShow, byMp3 };
  }

  // Cue files (<feeds origin>/cue/<id>.vti) are WebVTT song playlists the Pacifica feed links
  // from every episode. Numeric id only, fixed origin, bounded, WEBVTT required, no redirects;
  // the upstream sends no content type, so the body itself is checked.
  const cueOrigin = new URL(station.feeds.catalog).origin, cues = new Map(), cuePending = new Map();
  async function getCue(id) {
    const hit = cues.get(id); if (hit && now() - hit.at < 3600000) return hit.body;
    if (cuePending.has(id)) return cuePending.get(id);
    const job = (async () => {
      const r = await fetchImpl(cueOrigin + '/cue/' + id + '.vti', { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (r.status === 404) { if (r.body) await r.body.cancel(); throw Object.assign(Error('not_found'), { status: 404 }); }
      if (!r.ok) { if (r.body) await r.body.cancel(); throw Error('Cue HTTP ' + r.status); }
      const text = await r.text();
      if (text.length > 512 * 1024 || !/^\uFEFF?WEBVTT(?:\s|$)/.test(text)) throw Error('Invalid cue file');
      const body = { id, vtt: text };
      if (cues.size >= 300) cues.delete(cues.keys().next().value);
      cues.set(id, { body, at: now() }); return body;
    })().finally(() => cuePending.delete(id));
    cuePending.set(id, job); return job;
  }

  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function assetFile(name) {
    if (SHARED.has(name)) return path.join(HOST_PUBLIC_DIR, name);
    return path.join(PUBLIC_DIR, name);
  }
  const version = name => { const stat = fs.statSync(assetFile(name)); return stat.size.toString(16) + '-' + Math.round(stat.mtimeMs).toString(36); };
  function page() {
    const values = { name: station.name, frequency: station.frequency, city: station.city, logo: station.assets.logo };
    return fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
      .replace(/\{\{station\.(\w+)\}\}/g, (_, key) => esc(values[key]))
      .replace(/(src|href)="\/discover\/([a-z0-9-]+\.(?:js|css))"/g, (_, attr, name) => name === 'station.js' ? `${attr}="/discover/station.js"` : `${attr}="/discover/${name}?v=${version(name)}"`);
  }

  /** Answers a GET/HEAD for one of this plugin's routes. Returns false for any other path. */
  async function handle(req, res, url) {
    const route = decodeURIComponent(url.pathname);
    if (!ownsRoute(route)) return false;
    try {
      if (route === '/discover' || route === '/discover/') { send(res, 200, page(), MIME['.html']); return true; }
      if (route === '/discover/station.js') { send(res, 200, 'window.StationConfig=Object.freeze(' + JSON.stringify(config).replace(/</g, '\\u003c') + ');', MIME['.js']); return true; }
      const asset = /^\/discover\/([a-z0-9-]+\.(?:js|css))$/.exec(route);
      if (asset) {
        const file = assetFile(asset[1]);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not_found' }); return true; }
        send(res, 200, fs.readFileSync(file), MIME[path.extname(file)]); return true;
      }
      if (route === '/api/plugins/qir/status') { send(res, 200, qirStatus()); return true; }
      if (route.startsWith('/api/plugins/qir/') && !qirOn()) { send(res, 404, { error: 'plugin_disabled' }); return true; }
      if (route === '/api/plugins/qir/catalog') { send(res, 200, await servedCatalog()); return true; }
      // Live refresh (2026-09-27): open pages ask every 2 min for episodes aired at or after
      // `since` (station wall clock), a few KB instead of the ~1 MB catalog.
      if (route === '/api/plugins/qir/recent') {
        const since = url.searchParams.get('since') || '';
        if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(since)) { send(res, 400, { error: 'since must be YYYY-MM-DD HH:MM:SS' }); return true; }
        const c = await servedCatalog();
        const episodes = c.episodes.filter(e => `${e.air_date} ${e.air_start || '00:00:00'}` >= since).slice(0, 100);
        const byShow = {}, byMp3 = {};
        for (const e of episodes) { if (c.artwork.byShow[e.show_key]) byShow[e.show_key] = c.artwork.byShow[e.show_key]; if (c.artwork.byMp3[e.mp3_url]) byMp3[e.mp3_url] = c.artwork.byMp3[e.mp3_url]; }
        send(res, 200, { episodes, artwork: { byShow, byMp3 }, pending: c.pending, stale: c.stale }); return true;
      }
      const transcript = /^\/api\/plugins\/qir\/transcript\/([a-f0-9-]+)$/i.exec(route);
      if (transcript) { send(res, 200, await qir.transcript(transcript[1])); return true; }
      const cue = /^\/api\/cue\/(\d{1,10})$/.exec(route);
      if (cue) { send(res, 200, await getCue(cue[1])); return true; }
      send(res, 404, { error: 'not_found' }); return true;
    } catch (e) {
      send(res, e.status || 502, { error: e.status ? e.message : 'upstream_unavailable' }); return true;
    }
  }

  return {
    handle,
    settings,
    /** Script tags the host puts on its main page (step 4a): QIR details on the main listing. */
    pageScripts: () => `<script src="/discover/main.js?v=${version('main.js')}" defer></script>\n`,
    /** For /healthz: QIR state and the pending/behind numbers. */
    status: () => ({ qir: qirStatus().state, qirPending: lastPending }),
    // Loads the QIR catalog ahead of the first visitor (~17 s cold). Failures are already
    // recorded in qir.status(); logged so a bad key or provider change is visible at startup.
    warm: () => qirOn() && qir.status().configured ? qir.catalog().then(c => console.log('QIR catalog ready: ' + c.episodes.length + ' episodes'), e => console.warn('QIR warm-up failed: ' + e.message)) : Promise.resolve(),
  };
}

module.exports = { createDiscovery, ownsRoute };
