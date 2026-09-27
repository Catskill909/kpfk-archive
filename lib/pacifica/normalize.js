'use strict';

// Pure adapters: no I/O, hidden clock, history accumulation, or availability filters.
const crypto = require('crypto');
const { COMPONENT, validUrl } = require('../station-config');
// Feed-data problems. Distinct from code bugs, so a record-level catch can skip bad data
// without also swallowing a TypeError of ours.
class FeedError extends Error {
  constructor(where, message) { super(`Pacifica ${where}: ${message}`); this.where = where; this.issue = message; }
}
function fail(where, message) { throw new FeedError(where, message); }
function object(v, where) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(where, 'expected object');
  return v;
}
function array(v, where) { if (!Array.isArray(v)) fail(where, 'expected array'); return v; }
function component(v, where) {
  if (typeof v !== 'string' || !COMPONENT.test(v)) fail(where, 'invalid identity');
  return v;
}
function epoch(v, where) {
  if (!Number.isSafeInteger(v) || v < 0 || !Number.isFinite(new Date(v * 1000).getTime())) fail(where, 'invalid epoch seconds');
  return v;
}
function episodeId(v, where) {
  if (typeof v === 'number' && (!Number.isSafeInteger(v) || v <= 0)) fail(where, 'invalid episode id');
  if (!/^[1-9][0-9]*$/.test(String(v))) fail(where, 'invalid episode id');
  return String(v);
}
// Feed text is HTML fragments (entities, some double-encoded, truncated "&shy", <br>/<p>).
// One decoder shared with the Discovery plugin (public/text.js, keep identical): full
// Latin-1 + typographic entities, Windows-1252 numbers, NFC; unknown entities reported.
const { plain } = require('../../public/text');
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
function revision(v) { return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex'); }
function showKey(profile, source, slug) {
  return [profile.id, component(source, 'source'), component(slug, 'altid')].join('.');
}
function category(profile, label) { return Object.hasOwn(profile.categories, label) ? profile.categories[label] : 'special'; }
function approvedUrl(value, origins, where) {
  try { return validUrl(value, origins, { allowLocal: true }); } catch { fail(where, 'invalid or unapproved URL'); }
}
function link(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
function artwork(value, profile, diagnostics, where) {
  if (!value || typeof value !== 'string' || /\/pix\/?$/.test(value)) return '';
  try { return approvedUrl(value, profile.origins.artwork, where); }
  catch { diagnostics.push({ path: where, issue: 'invalid artwork; use fallback' }); return ''; }
}
function published(value, diagnostics, where) {
  return array(value, where).map((raw, index) => {
    const p = object(raw, `${where}[${index}]`);
    const notes = plain(p.notes), alias = plain(p.hotes);
    if (notes && alias && notes !== alias) diagnostics.push({ path: `${where}[${index}]`, issue: 'notes/hotes conflict; notes preferred' });
    return { host: plain(p.host), guest: plain(p.guest), topic: plain(p.topic), notes: notes || alias };
  });
}
function publicationText(entries) {
  return entries.map(p => [p.host && `Host: ${p.host}`, p.guest && `Guests: ${p.guest}`, p.topic, p.notes]
    .filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n');
}
function dateText(seconds, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long',
    day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(seconds * 1000);
  const p = k => parts.find(x => x.type === k).value;
  return `${p('weekday')}, ${p('month')} ${p('day')}, ${p('year')} ${p('hour')}:${p('minute')} ${p('dayPeriod').toLowerCase()}`;
}
function hms(sec) {
  return sec > 0 ? `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : '';
}
// A catalog whose shape or station is wrong is rejected whole (last-good is kept). A single
// malformed show or episode is skipped and recorded instead: before 2026-09-26 one bad record
// froze the whole archive — and, through /api/archive, the Flutter app and Discovery — at
// last-good, and off-schedule uploads (`2kpfk`) are where odd records turn up. Many skipped
// records means the feed format changed, so past SKIP_LIMIT the catalog is rejected after all.
// `skipped.records` is structured ({ path, source, altid, date, issue }) for anomaly reports.
const SKIP_LIMIT = { records: 20, share: 0.05 };
function normalizeCatalog(raw, profile) {
  object(raw, 'catalog'); epoch(raw.updated, 'catalog.updated');
  array(raw.channels, 'catalog.channels');
  const directory = Object.create(null), diagnostics = [], skipped = [], skippedShows = new Set();
  let seen = 0, droppedWithShow = 0;
  // Only FeedError is data; anything else is a bug in this file and must propagate.
  function skip(err, record) {
    if (!(err instanceof FeedError)) throw err;
    skipped.push({ path: err.where, issue: err.issue, ...record });
  }
  for (const [source, records] of Object.entries(object(raw.shows, 'catalog.shows'))) {
    component(source, 'shows.source');
    array(records, `shows.${source}`).forEach((item, index) => {
      seen++;
      const altid = item && typeof item.altid === 'string' ? item.altid : '';
      const local = [];
      try {
        const s = object(item, `shows.${source}[${index}]`), key = showKey(profile, source, s.altid);
        if (s.plistid !== source) fail(key, 'source disagrees with outer key');
        if (Object.hasOwn(directory, key)) fail(key, 'duplicate show');
        directory[key] = {
          key, upstreamAltId: s.altid, archiveSource: source, name: plain(s.name) || s.altid,
          dj: plain(s.host), desc: plain(s.description), shortdesc: plain(s.shortDescription),
          url: link(s.url), facebook: link(s.facebook), twitter: link(s.twitter), tumblr: link(s.tumblr),
          categoryLabel: plain(s.category), cat: category(profile, plain(s.category)),
          photoUrl: artwork(s.photoUrl, profile, local, `${key}.photoUrl`), type: plain(s.type),
        };
        const corrected = (profile.showTypes || {})[`${source}.${s.altid}`];
        if (corrected && corrected !== directory[key].type) {
          local.push({ path: `${key}.type`, issue: `show type ${directory[key].type || '(none)'} corrected to ${corrected} (station showTypes)` });
          directory[key].type = corrected;
        }
        diagnostics.push(...local);
      } catch (err) {
        skip(err, { source, altid, date: null });
        // A duplicate leaves the first record in place; its episodes still belong to it.
        if (altid && !Object.hasOwn(directory, `${profile.id}.${source}.${altid}`)) skippedShows.add(`${source}.${altid}`);
      }
    });
  }
  const rows = [], ids = new Set();
  for (const [source, shows] of Object.entries(object(raw.episodes, 'catalog.episodes'))) {
    component(source, 'episodes.source');
    for (const [slug, dates] of Object.entries(object(shows, `episodes.${source}`))) {
      let key;
      try { key = showKey(profile, source, slug); object(dates, `episodes.${key}`); }
      catch (err) { seen++; skip(err, { source, altid: slug, date: null }); continue; }
      const info = directory[key];
      for (const [date, record] of Object.entries(dates)) {
        const where = `episodes.${key}.${date}`;
        if (!info && skippedShows.has(`${source}.${slug}`)) { droppedWithShow++; continue; }
        seen++;
        const local = [];
        try {
          const e = object(record, where);
          if (!info) fail(where, 'show missing from directory');
          if (e.plistid !== source || e.altid !== slug || String(e.airDate) !== date) fail(where, 'identity disagrees with outer keys');
          const upstreamId = episodeId(e.id, where), id = `${profile.id}.${source}.${upstreamId}`;
          if (ids.has(id)) fail(where, 'duplicate episode id');
          const dt = epoch(e.airDate, `${where}.airDate`);
          let durationSec = e.durationSec;
          if (!Number.isFinite(durationSec) || durationSec < 0) {
            local.push({ path: `${where}.durationSec`, issue: 'unknown duration' }); durationSec = 0;
          }
          durationSec = Math.round(durationSec);
          const pub = published(e.pub, local, `${where}.pub`);
          const expiresAt = Number.isSafeInteger(e.expires) && e.expires > 0 ? e.expires : null;
          if (info.type && e.type && info.type !== e.type) local.push({ path: `${where}.type`, issue: 'episode and show types disagree' });
          const mp3 = approvedUrl(e.mp3Url, profile.origins.audio, `${where}.mp3Url`);
          ids.add(id); diagnostics.push(...local);
          rows.push({
            id, upstreamId, sho: key, upstreamAltId: slug, archiveSource: source, title: info.name,
            episodeTitle: (pub.find(p => p.topic) || {}).topic || `${info.name} — ${dateText(dt, profile.timezone)}`,
            dt, dateText: dateText(dt, profile.timezone), durationSec, length: hms(durationSec),
            host: (pub.find(p => p.host) || {}).host || info.dj, mp3,
            photoUrl: info.photoUrl, cat: info.cat, categoryLabel: info.categoryLabel,
            episodeDesc: publicationText(pub), published: pub, source: 'json',
            expiresAt, daysLeft: null, expiryState: expiresAt ? 'reported' : 'unknown',
            hasRSS: false, rss: '', bytes: null, type: plain(e.type),
            vtiUrl: link(e.vtiUrl),
          });
        } catch (err) { skip(err, { source, altid: slug, date }); }
      }
    }
  }
  if (skipped.length > Math.max(SKIP_LIMIT.records, seen * SKIP_LIMIT.share)) {
    fail('catalog', `${skipped.length} of ${seen} records malformed (first: ${skipped[0].path}: ${skipped[0].issue}); feed format may have changed`);
  }
  rows.sort((a, b) => b.dt - a.dt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  rows.forEach((row, i) => { row.ord = i; });
  return { schemaVersion: 1, provider: 'pacifica-json', generatedAt: raw.updated, count: rows.length,
    latest: rows.reduce((max, r) => Math.max(max, r.dt), 0), shows: rows, directory,
    revision: revision({ rows, directory }), diagnostics,
    skipped: { count: skipped.length, droppedWithShow, records: skipped } };
}
function feedReference(value, baseUrl, profile, where) {
  if (typeof value !== 'string' || !value) fail(where, 'missing feed reference');
  const u = new URL(value, baseUrl), base = new URL(baseUrl);
  const allowedPath = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
  if (u.origin !== base.origin || !u.pathname.startsWith(allowedPath) || u.search) fail(where, 'feed reference outside configured directory');
  return approvedUrl(u.href, profile.origins.feeds, where);
}
// Same rule as the catalog (2026-09-27): one bad entry costs only that entry, recorded in
// `skipped`. A feed whose shape or station is wrong is still rejected whole (last-good kept).
function skipper() {
  const records = [];
  return { records, skip(err, record) { if (!(err instanceof FeedError)) throw err; records.push({ path: err.where, issue: err.issue, ...record }); } };
}
function normalizeChannels(raw, profile) {
  object(raw, 'channels'); epoch(raw.updated, 'channels.updated');
  if (raw.primary !== profile.primaryChannel) fail('channels.primary', 'unexpected primary channel');
  const seen = new Set(), channels = [], sk = skipper();
  array(raw.channels, 'channels.channels').forEach((c, index) => {
    const where = `channels[${index}]`;
    try {
      object(c, where); const id = component(c.plistid, `${where}.plistid`);
      if (seen.has(id)) fail(`channels.${id}`, 'duplicate channel');
      channels.push({ id, name: plain(c.name), listenUrl: approvedUrl(c.listenUrl, profile.origins.audio, `channels.${id}.listenUrl`),
        nowplaying: feedReference(c.nowplaying, profile.feeds.channels, profile, `channels.${id}.nowplaying`),
        scheduleIndex: feedReference(c.scheduleIndex, profile.feeds.channels, profile, `channels.${id}.scheduleIndex`) });
      seen.add(id);
    } catch (err) {
      // The primary channel is what plays (stream, now playing, schedule): a bad one is never
      // skipped. An extra channel (e.g. the upload list, if ever added with an empty stream
      // URL) is skipped and recorded.
      if (c && c.plistid === profile.primaryChannel && !seen.has(profile.primaryChannel)) throw err;
      sk.skip(err, { channel: c && typeof c.plistid === 'string' ? c.plistid : null });
    }
  });
  if (!seen.has(profile.primaryChannel)) fail('channels', 'primary channel missing');
  return { generatedAt: raw.updated, primary: raw.primary, channels, revision: revision(channels),
    skipped: { count: sk.records.length, records: sk.records } };
}
function station(raw, profile, channel) {
  object(raw, 'station');
  if (raw.plistid !== channel || raw.timezone !== profile.timezone) fail('station', 'channel/timezone mismatch');
}
function normalizeNowPlaying(raw, profile, directory = {}, channel = profile.primaryChannel) {
  object(raw, 'nowplaying'); epoch(raw.updated, 'nowplaying.updated'); station(raw.station, profile, channel);
  const diagnostics = [];
  function program(rawProgram, current) {
    if (rawProgram == null) return null;
    object(rawProgram, 'program');
    const key = showKey(profile, channel, rawProgram.altid), info = directory[key] || {};
    const startTime = epoch(rawProgram.startTime, 'program.startTime');
    const endTime = current ? epoch(rawProgram.endTime, 'program.endTime') : null;
    if (current && endTime <= startTime) fail('program', 'end must follow start');
    return { altid: key, upstreamAltId: rawProgram.altid, name: plain(rawProgram.name) || info.name || rawProgram.altid,
      dj: plain(rawProgram.host) || info.dj || '', startTime, endTime,
      start: plain(rawProgram.startLabel), end: plain(rawProgram.endLabel),
      photoUrl: artwork(rawProgram.photoUrl, profile, diagnostics, 'program.photoUrl') || info.photoUrl || '' };
  }
  const current = program(raw.current, true), next = program(raw.next, false);
  // Pacifica serializes an empty track as [] when no song metadata exists.
  const track = raw.track == null || (Array.isArray(raw.track) && raw.track.length === 0)
    ? {} : object(raw.track, 'track');
  let song = plain(track.song), artist = plain(track.artist);
  if (song.toLowerCase() === 'talk' && artist.toLowerCase() === 'talk') { song = ''; artist = ''; }
  if (current) Object.assign(current, { song, artist });
  return { generatedAt: raw.updated, channel, current, next, diagnostics,
    revision: revision({ current, next }) };
}
function normalizeScheduleIndex(raw, profile, baseUrl, channel = profile.primaryChannel) {
  object(raw, 'schedule index'); epoch(raw.updated, 'schedule.updated'); station(raw.station, profile, channel);
  const seen = new Set(), weeks = [], sk = skipper(), list = array(raw.weeks, 'weeks');
  list.forEach((w, index) => {
    const where = `weeks[${index}]`;
    try {
      object(w, where); const weekStart = epoch(w.weekStart, `${where}.weekStart`);
      if (seen.has(weekStart)) fail(where, 'duplicate week');
      weeks.push({ weekStart, label: plain(w.weekStartLabel), url: feedReference(w.file, baseUrl, profile, `${where}.file`) });
      seen.add(weekStart);
    } catch (err) { sk.skip(err, { weekStart: w && Number.isSafeInteger(w.weekStart) ? w.weekStart : null }); }
  });
  if (list.length && !weeks.length) fail('weeks', `no usable week (first: ${sk.records[0].path}: ${sk.records[0].issue})`);
  weeks.sort((a, b) => a.weekStart - b.weekStart);
  return { generatedAt: raw.updated, timezone: profile.timezone, channel, weeks, revision: revision(weeks),
    skipped: { count: sk.records.length, records: sk.records } };
}
function normalizeScheduleWeek(raw, profile, directory = {}, channel = profile.primaryChannel) {
  object(raw, 'schedule week'); epoch(raw.updated, 'week.updated'); station(raw.station, profile, channel);
  const weekStart = epoch(raw.weekStart, 'weekStart'), diagnostics = [], dates = new Set(), ids = new Set();
  const localDate = seconds => new Intl.DateTimeFormat('en-CA', { timeZone: profile.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(seconds * 1000);
  const rawDays = array(raw.days, 'days'), sk = skipper();
  // The week's own anchor is document-level: its first day must start the week.
  const starts = rawDays.map(d => d && d.startTime).filter(t => Number.isSafeInteger(t));
  if (starts.length && Math.min(...starts) !== weekStart) fail('weekStart', 'does not match first day');
  let slotsSeen = 0;
  const days = [];
  rawDays.forEach((day, dIndex) => {
    const dWhere = `days[${dIndex}]`;
    try {
      object(day, dWhere); const startTime = epoch(day.startTime, `${dWhere}.startTime`);
      if (day.date !== localDate(startTime) || dates.has(day.date)) fail(dWhere, 'date mismatch or duplicate');
      const slots = [];
      array(day.slots, `${dWhere}.slots`).forEach((s, sIndex) => {
        slotsSeen++;
        const where = `${day.date}.slots[${sIndex}]`, local = [];
        try {
          object(s, where); const key = showKey(profile, channel, s.altid), info = directory[key] || {};
          const start = epoch(s.startTime, `${where}.startTime`), end = epoch(s.endTime, `${where}.endTime`);
          if (end <= start || localDate(start) !== day.date) fail(where, 'invalid interval/date');
          const slotKey = `${key}.${start}`;
          if (ids.has(slotKey)) fail(where, 'duplicate slot');
          if (!directory[key]) local.push({ path: slotKey, issue: 'no catalog show; published slot kept' });
          const slot = { slotKey, showKey: key, upstreamAltId: s.altid, startTime: start, endTime: end,
            name: plain(s.name) || info.name || s.altid, host: plain(s.host) || info.dj || '',
            shortDescription: plain(s.shortDescription) || info.shortdesc || '',
            photoUrl: artwork(s.photoUrl, profile, local, 'slot.photoUrl') || info.photoUrl || '',
            cat: info.cat || 'special', published: published(s.pub, local, 'slot.pub') };
          ids.add(slotKey); diagnostics.push(...local); slots.push(slot);
        } catch (err) { sk.skip(err, { date: day.date, altid: s && typeof s.altid === 'string' ? s.altid : null }); }
      });
      slots.sort((a, b) => a.startTime - b.startTime || (a.slotKey < b.slotKey ? -1 : a.slotKey > b.slotKey ? 1 : 0));
      for (let i = 1; i < slots.length; i++) if (slots[i].startTime < slots[i - 1].endTime) diagnostics.push({ path: day.date, issue: 'overlapping published slots kept' });
      dates.add(day.date); days.push({ date: day.date, startTime, slots });
    } catch (err) {
      slotsSeen += day && Array.isArray(day.slots) ? day.slots.length : 0;
      sk.skip(err, { date: day && typeof day.date === 'string' ? day.date : null, altid: null });
    }
  });
  days.sort((a, b) => a.startTime - b.startTime);
  if (sk.records.length > Math.max(SKIP_LIMIT.records, slotsSeen * SKIP_LIMIT.share)) {
    fail('week', `${sk.records.length} of ${slotsSeen} slots/days malformed (first: ${sk.records[0].path}: ${sk.records[0].issue}); feed format may have changed`);
  }
  return { generatedAt: raw.updated, weekStart, timezone: profile.timezone, channel, days,
    revision: revision({ weekStart, days }), diagnostics, skipped: { count: sk.records.length, records: sk.records } };
}
module.exports = { FeedError, normalizeCatalog, normalizeChannels, normalizeNowPlaying, normalizeScheduleIndex,
  normalizeScheduleWeek, plain, revision, showKey, dateText, feedReference };
