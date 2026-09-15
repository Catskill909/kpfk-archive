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
  function output(s) {
    return { ...s.value, updated: s.validatedAt, validatedAt: s.validatedAt,
      stale: !!s.error || now() - s.validatedAt >= s.ttl };
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
  return {
    catalog: force => get(catalogState, force), peekCatalog: () => catalogState.value && output(catalogState),
    live, schedule, photo,
    async artwork(id) {
      if (!/^[a-f0-9]{64}$/.test(id) || !images.has(id)) { const e = new Error('Unknown artwork'); e.status = 404; throw e; }
      return bounded({ url: images.get(id), origins: profile.origins.artwork, maxBytes: 5 * 1024 * 1024, image: true });
    },
    health() {
      return Object.fromEntries([...states].map(([key, s]) => [key, { ready: !!s.value,
        generatedAt: s.value && s.value.generatedAt, validatedAt: s.validatedAt,
        revision: s.value && s.value.revision, stale: !!s.error || now() - s.validatedAt >= s.ttl,
        error: s.error || null, count: s.value && s.value.count, retryAt: s.nextTryAt }]));
    },
  };
}
module.exports = { createService };
