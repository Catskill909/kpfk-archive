'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchBounded } = require('./fetch-json');
const { normalizeCatalog, normalizeChannels, normalizeNowPlaying, normalizeScheduleIndex, normalizeScheduleWeek } = require('./normalize');

function createService({ profile, dataDir, writeJsonAtomic, fetchImpl = fetch, now = Date.now }) {
  const states = new Map(), images = new Map();
  let activeFetches = 0;
  const waiting = [];
  async function bounded(options) {
    if (activeFetches >= 3) await new Promise(resolve => waiting.push(resolve));
    else activeFetches++;
    try { return await fetchBounded(options.url, { ...options, fetchImpl }); }
    finally { if (waiting.length) waiting.shift()(); else activeFetches--; }
  }
  // Artwork memory cache (2026-09-24). Every /api/artwork request used to go back
  // to Pacifica (~0.4 s per image, the same on every repeat). Images are ~20 KB, so
  // a few hundred cost a few MB. Bounded by count and bytes, least recently used out.
  const ART_TTL = 6 * 3600000, ART_MAX = 600, ART_BYTES = 40 * 1024 * 1024;
  const artCache = new Map(), artPending = new Map(); let artBytes = 0;
  function keepArt(id, entry) {
    if (artCache.has(id)) { artBytes -= artCache.get(id).raw.length; artCache.delete(id); }
    artCache.set(id, entry); artBytes += entry.raw.length;
    while (artCache.size > ART_MAX || artBytes > ART_BYTES) {
      const [oldest, old] = artCache.entries().next().value; artCache.delete(oldest); artBytes -= old.raw.length;
    }
  }
  // One upstream fetch per image at a time, however many requests are waiting on it.
  function fetchArt(id) {
    if (artPending.has(id)) return artPending.get(id);
    const job = bounded({ url: images.get(id), origins: profile.origins.artwork, maxBytes: 5 * 1024 * 1024, image: true })
      .then(r => {
        const entry = { raw: r.raw, contentType: r.contentType, at: now(),
          etag: '"' + crypto.createHash('sha1').update(r.raw).digest('base64url') + '"' };
        keepArt(id, entry); return entry;
      })
      .finally(() => artPending.delete(id));
    artPending.set(id, job); return job;
  }
  function photo(url) {
    if (!url) return profile.assets.icon;
    const id = crypto.createHash('sha256').update(url).digest('hex');
    images.set(id, url); return `/api/artwork/${id}`;
  }
  function decorateCatalog(data) {
    return { ...data, shows: data.shows.map(r => ({ ...r, photo: photo(r.photoUrl) })),
      directory: Object.fromEntries(Object.entries(data.directory).map(([k, info]) => [k, { ...info, photo: photo(info.photoUrl) }])) };
  }
  function state(name, url, normalize, ttl, maxBytes = 10 * 1024 * 1024) {
    if (states.has(name)) {
      const s = states.get(name);
      if (s.url !== url) { s.url = url; s.envelope = null; s.validatedAt = 0; }
      s.normalize = normalize; return s;
    }
    const file = path.join(dataDir, 'pacifica', `${name}.json`);
    const s = { name, url, normalize, ttl, maxBytes, file, envelope: null, value: null,
      validatedAt: 0, error: '', failures: 0, nextTryAt: 0, inFlight: null };
    for (const candidate of [`${file}.previous`, file]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const saved = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (saved.schemaVersion !== 1 || saved.station !== profile.id || saved.url !== url) throw new Error('Snapshot identity/schema mismatch');
        const value = normalize(saved.raw);
        // Loading both previous and current restores old artwork tokens as well.
        s.value = value; s.envelope = saved; s.validatedAt = saved.validatedAt || 0;
      } catch (e) {
        s.error = `Saved snapshot rejected: ${e.message}`;
        // Preserve the bad bytes for diagnosis, rather than overwriting them next refresh.
        fs.renameSync(candidate, `${candidate}.invalid-${now()}`);
      }
    }
    states.set(name, s); return s;
  }
  async function get(s, force = false) {
    if (s.inFlight) return s.inFlight;
    if (!force && s.value && now() - s.validatedAt < s.ttl) return output(s);
    if (!force && now() < s.nextTryAt) {
      if (s.value) return output(s);
      throw new Error(s.error || 'Upstream retry pending');
    }
    s.inFlight = (async () => {
      try {
        const headers = { 'User-Agent': `${profile.id}-archive/1.0` };
        if (s.envelope && s.envelope.validators) {
          if (s.envelope.validators.etag) headers['If-None-Match'] = s.envelope.validators.etag;
          if (s.envelope.validators.lastModified) headers['If-Modified-Since'] = s.envelope.validators.lastModified;
        }
        let response = await bounded({ url: s.url, origins: profile.origins.feeds, headers, maxBytes: s.maxBytes,
          timeoutMs: s.name === 'nowplaying' ? 6000 : 12000 });
        if (response.notModified && !s.envelope) response = await bounded({ url: s.url,
          origins: profile.origins.feeds, maxBytes: s.maxBytes, headers: { 'User-Agent': `${profile.id}-archive/1.0` } });
        if (response.notModified && !s.envelope) throw new Error('304 without a saved response');
        const raw = response.notModified ? s.envelope.raw : response.raw;
        const value = s.normalize(raw); // all episodes, including empty catalog; never accumulate or retire
        const envelope = { schemaVersion: 1, station: profile.id, url: s.url, validatedAt: now(),
          validators: response.notModified ? s.envelope.validators : response.validators, raw };
        if (s.envelope && !response.notModified) writeJsonAtomic(`${s.file}.previous`, s.envelope);
        writeJsonAtomic(s.file, envelope);
        s.value = value; s.envelope = envelope; s.validatedAt = envelope.validatedAt;
        s.error = ''; s.failures = 0; s.nextTryAt = 0;
      } catch (e) {
        s.error = e.message; s.failures++;
        s.nextTryAt = now() + Math.max(Math.min(300000, 15000 * 2 ** Math.min(s.failures - 1, 5)), e.retryAfterMs || 0);
        if (!s.value) throw e;
      }
      return output(s);
    })();
    try { return await s.inFlight; } finally { s.inFlight = null; }
  }
  // Stale means the last refresh failed and last-good is being served. Not
  // "older than the TTL": refresh is lazy (no timer), so a feed nobody has
  // asked for in a while is simply due, and the next request refreshes it.
  // Counting TTL expiry had /healthz flag healthy feeds during quiet spells —
  // now-playing (15s TTL) for most of every minute.
  function isStale(s) { return !!s.error; }
  function output(s) {
    return { ...s.value, updated: s.validatedAt, validatedAt: s.validatedAt, stale: isStale(s) };
  }
  const catalogState = state('catalog', profile.feeds.catalog,
    raw => decorateCatalog(normalizeCatalog(raw, profile)), 300000);
  const channelState = state('channels', profile.feeds.channels, raw => normalizeChannels(raw, profile), 3600000, 256 * 1024);
  async function channel() {
    const list = await get(channelState);
    return list.channels.find(c => c.id === profile.primaryChannel);
  }
  async function live(force = false) {
    const c = await channel();
    const s = state('nowplaying', c.nowplaying,
      raw => normalizeNowPlaying(raw, profile, (catalogState.value || {}).directory || {}), 15000, 256 * 1024);
    const data = await get(s, force), expired = now() / 1000 - data.generatedAt > 180
      || (data.current && data.current.endTime <= now() / 1000);
    const current = !expired && data.current ? { ...data.current, photo: photo(data.current.photoUrl) } : null;
    return { ...data, current, stale: data.stale || expired,
      next: data.next ? { ...data.next, photo: photo(data.next.photoUrl) } : null };
  }
  async function schedule(weekStart, force = false) {
    const c = await channel();
    const indexState = state('schedule-index', c.scheduleIndex,
      raw => normalizeScheduleIndex(raw, profile, c.scheduleIndex), 300000, 256 * 1024);
    const index = await get(indexState, force);
    if (weekStart === undefined) return { ...index, weeks: index.weeks.map(({ weekStart, label }) => ({ weekStart, label })) };
    const week = index.weeks.find(w => w.weekStart === weekStart);
    if (!week) { const e = new Error('Week is not published'); e.status = 404; throw e; }
    const data = await get(state(`week-${weekStart}`, week.url, raw => {
      const normalized = normalizeScheduleWeek(raw, profile, (catalogState.value || {}).directory || {});
      if (normalized.weekStart !== weekStart) throw new Error('Week disagrees with requested index entry');
      return normalized;
    }, 300000, 2 * 1024 * 1024), force);
    // The browser may only load same-origin images (CSP img-src 'self'), so a
    // slot needs the proxied `photo` the catalog rows carry — a bare photoUrl
    // can never render. Joined against the catalog at request time, because a
    // week normalized before the catalog loaded holds no directory artwork.
    const directory = (catalogState.value || {}).directory || {};
    return { ...data, days: data.days.map(day => ({ ...day, slots: day.slots.map(slot => ({
      ...slot, photo: photo(slot.photoUrl || (directory[slot.showKey] || {}).photoUrl) })) })) };
  }
  // ---- What the listener archive shows ----
  // Display policy (Paul, 2026-09-15): only programs in KPFK's published
  // schedule. The catalog also carries archive-only uploads (the `2kpfk`
  // group: podcasts and online editions) and programs no longer on the air;
  // those stay in the accepted catalog snapshot, untouched, and are simply not
  // served. `catalog()` remains a faithful mirror of the feed; `archive()` is
  // the view every listener-facing consumer reads.
  function primaryChannelKeys(data) {
    return new Set(Object.keys(data.directory).filter(k => k.split('.')[1] === profile.primaryChannel));
  }
  function scheduledView(data, keys, basis) {
    const shows = data.shows.filter(r => keys.has(r.sho));
    const directory = Object.fromEntries(Object.entries(data.directory).filter(([k]) => keys.has(k)));
    // Membership is part of what the listing shows, so a schedule change alone
    // must move the revision open tabs poll for.
    const revision = crypto.createHash('sha256').update(`${data.revision}\n${basis}\n${[...keys].sort().join('\n')}`).digest('hex');
    return { ...data, shows, directory, count: shows.length, latest: shows.reduce((max, r) => Math.max(max, r.dt), 0),
      revision, filter: { basis, catalogEpisodes: data.count, hiddenEpisodes: data.count - shows.length } };
  }
  async function scheduledKeys(force = false) {
    const index = await schedule(undefined, force);
    const weeks = await Promise.allSettled(index.weeks.map(w => schedule(w.weekStart, force)));
    const keys = new Set();
    let accepted = 0;
    for (const result of weeks) {
      if (result.status !== 'fulfilled') continue;   // one unavailable week narrows membership; it doesn't void it
      accepted++;
      result.value.days.forEach(day => day.slots.forEach(slot => keys.add(slot.showKey)));
    }
    if (!accepted) throw weeks.length ? weeks[0].reason : new Error('No published schedule weeks');
    return keys;
  }
  let lastBasis = null, lastKeys = null;
  async function archive(force = false) {
    const data = await get(catalogState, force);
    let keys, basis = 'schedule';
    try { keys = await scheduledKeys(force); }
    catch (e) {
      // Caught: any failure to obtain a published schedule with no saved copy.
      // A schedule outage must not empty the archive (catalog and schedule are
      // independent services), so fall back to the on-air channel's shows —
      // uploads stay hidden — and say so in `filter.basis`, /healthz and the log.
      keys = primaryChannelKeys(data); basis = 'primary-channel';
      if (lastBasis !== basis) console.warn(`[pacifica] schedule unavailable (${e.message}); archive limited to the ${profile.primaryChannel} channel`);
    }
    lastBasis = basis; lastKeys = keys;
    return scheduledView(data, keys, basis);
  }
  function peekArchive() {
    if (!catalogState.value) return null;
    const data = output(catalogState);
    // Before archive() has run once, membership has not been measured: serve the
    // on-air channel (uploads hidden) but label it "pending", not
    // "primary-channel" — that label means a schedule outage, and /healthz is
    // read straight after a deploy, which is exactly when this state exists.
    return lastKeys ? scheduledView(data, lastKeys, lastBasis) : scheduledView(data, primaryChannelKeys(data), 'pending');
  }
  return {
    catalog: force => get(catalogState, force), peekCatalog: () => catalogState.value && output(catalogState),
    archive, peekArchive,
    live, schedule, photo,
    async artwork(id) {
      if (!/^[a-f0-9]{64}$/.test(id) || !images.has(id)) { const e = new Error('Unknown artwork'); e.status = 404; throw e; }
      const hit = artCache.get(id);
      if (!hit) return fetchArt(id);
      // Stale-while-revalidate: answer from memory now, refresh in the background so
      // changed show art still arrives. A failed refresh keeps the copy we have.
      if (now() - hit.at > ART_TTL) fetchArt(id).catch(e => console.warn(`[pacifica] artwork refresh failed (${id.slice(0, 8)}): ${e.message}`));
      artCache.delete(id); artCache.set(id, hit); // most recently used last
      return hit;
    },
    // Load every known image once (after the catalog), so the first visitors after a
    // deploy get fast artwork. Best effort: a failure here is retried on demand.
    async warmArtwork() {
      const ids = [...images.keys()].filter(id => !artCache.has(id));
      const results = await Promise.allSettled(ids.map(fetchArt));
      return { requested: ids.length, cached: results.filter(r => r.status === 'fulfilled').length };
    },
    health() {
      return Object.fromEntries([...states].map(([key, s]) => [key, { ready: !!s.value,
        generatedAt: s.value && s.value.generatedAt, validatedAt: s.validatedAt,
        revision: s.value && s.value.revision, stale: isStale(s),
        error: s.error || null, count: s.value && s.value.count, retryAt: s.nextTryAt }]));
    },
  };
}
module.exports = { createService };
