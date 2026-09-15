'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateProfile, publicProfile } = require('../../lib/station-config');
const n = require('../../lib/pacifica/normalize');
const root = path.join(__dirname, '../..');
const fixture = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14', name), 'utf8'));
const profile = validateProfile(require('../../stations/kpfk.json'));
const catalog = () => fixture('fe_catalog_kpfk.json');

test('all catalog episodes survive: no count, duration, expiry, music or future-date filter', () => {
  const raw = catalog(), result = n.normalizeCatalog(raw, profile);
  assert.equal(result.count, 1143);
  assert.equal(Object.keys(result.directory).length, 184);
  assert.equal(result.shows.filter(r => r.archiveSource === '2kpfk').length, 137);
  assert.equal(result.shows.filter(r => !r.durationSec).length, 9);
  assert.ok(result.shows.some(r => r.dt > raw.updated));
  assert.equal(result.shows.filter(r => r.upstreamAltId === 'dn').length, 69);
  const changed = catalog();
  for (const group of Object.values(changed.episodes)) for (const eps of Object.values(group)) {
    for (const e of Object.values(eps)) { e.expires = 1; e.type = 'Music'; }
  }
  assert.equal(n.normalizeCatalog(changed, profile).count, result.count);
});
test('source-scoped IDs isolate equal slugs/episode ids; no title-based merge', () => {
  const raw = catalog(), source = raw.shows.kpfk[0], original = Object.values(Object.values(raw.episodes.kpfk)[0])[0];
  raw.shows.other = [{ ...source, plistid: 'other', altid: original.altid }];
  raw.episodes.other = { [original.altid]: { [original.airDate]: { ...original, plistid: 'other' } } };
  const data = n.normalizeCatalog(raw, profile);
  const matches = data.shows.filter(r => r.upstreamId === String(original.id));
  assert.equal(matches.length, 2); assert.notEqual(matches[0].id, matches[1].id); assert.notEqual(matches[0].sho, matches[1].sho);
  assert.ok(data.shows.every(r => typeof r.id === 'string'));
});
test('revision ignores raw object ordering and generation time but detects editorial and audio changes', () => {
  const raw = catalog(), a = n.normalizeCatalog(raw, profile);
  raw.updated++;
  raw.episodes = Object.fromEntries(Object.entries(raw.episodes).reverse());
  assert.equal(n.normalizeCatalog(raw, profile).revision, a.revision);
  raw.shows.kpfk[0].description = 'A changed description';
  assert.notEqual(n.normalizeCatalog(raw, profile).revision, a.revision);
  const before = n.normalizeCatalog(raw, profile);
  const e = Object.values(Object.values(raw.episodes.kpfk)[0])[0];
  e.mp3Url += '?revision=2';
  const after = n.normalizeCatalog(raw, profile);
  assert.notEqual(before.revision, after.revision); assert.equal(before.count, after.count); assert.equal(before.latest, after.latest);
});
test('two published entries, notes aliases, safe text, and clearing editorial fields', () => {
  const raw = catalog(); const e = Object.values(Object.values(raw.episodes.kpfk)[0])[0];
  e.pub = [{ topic: 'First', hotes: '<p>Caf&eacute; &amp; friends</p><script>bad()</script>' },
    { host: 'Guest host', topic: 'Second', notes: '', hotes: 'Second notes' }];
  const data = n.normalizeCatalog(raw, profile), row = data.shows.find(r => r.upstreamId === String(e.id));
  assert.equal(row.published.length, 2); assert.match(row.episodeDesc, /Café & friends/);
  assert.match(row.episodeDesc, /Second notes/); assert.doesNotMatch(row.episodeDesc, /bad\(\)|<p>/);
  assert.equal(row.host, 'Guest host');
  assert.equal(n.plain('A &amp;ldquo;quote&amp;rdquo;<br>B'), 'A “quote”\nB');
  const show = raw.shows.kpfk.find(s => s.altid === e.altid); show.description = '';
  assert.equal(n.normalizeCatalog(raw, profile).directory[row.sho].desc, '');
});
test('malformed joins and duplicate IDs reject without losing records silently', () => {
  const raw = catalog(), group = Object.values(raw.episodes.kpfk)[0], date = Object.keys(group)[0];
  group[date].altid = 'wrong'; assert.throws(() => n.normalizeCatalog(raw, profile), /identity/);
  const other = catalog(), eps = Object.values(other.episodes.kpfk)[0], list = Object.values(eps);
  list[1].id = list[0].id; assert.throws(() => n.normalizeCatalog(other, profile), /duplicate episode/);
});
test('a valid empty episode map is an empty archive; directory does not manufacture episodes', () => {
  const raw = catalog(); raw.episodes = {};
  const data = n.normalizeCatalog(raw, profile); assert.equal(data.count, 0); assert.equal(Object.keys(data.directory).length, 184);
});
test('channels and schedule discovery follow same-directory references only', () => {
  const raw = fixture('fe_channels.json'), data = n.normalizeChannels(raw, profile);
  assert.equal(data.channels[0].id, 'kpfk');
  raw.channels[0].nowplaying = '../../playlist/private.php'; assert.throws(() => n.normalizeChannels(raw, profile), /outside/);
});
test('all 444 published slots normalize; dates do not depend on browser/server timezone', () => {
  const data = n.normalizeCatalog(catalog(), profile);
  const index = n.normalizeScheduleIndex(fixture('fe_schedule_kpfk_index.json'), profile,
    'https://archive.kpfk.org/fe_feed/fe_schedule_kpfk_index.json');
  assert.equal(index.weeks.length, 3);
  let count = 0;
  for (const w of index.weeks) {
    const week = n.normalizeScheduleWeek(fixture(path.basename(w.url)), profile, data.directory);
    assert.equal(week.days.length, 7); count += week.days.reduce((n, d) => n + d.slots.length, 0);
    assert.ok(week.days[0].slots.every(s => !s.photoUrl.endsWith('/pix')));
    assert.ok(week.days.some(d => d.slots.some(s => s.upstreamAltId === 'latw')));
  }
  assert.equal(count, 444);
});
test('DST repeated hour and midnight-spanning slot use actual epoch intervals', () => {
  const start = Date.parse('2026-11-01T00:00:00-07:00') / 1000;
  const raw = { updated: start, weekStart: start, station: { plistid: 'kpfk', timezone: profile.timezone },
    days: [{ date: '2026-11-01', startTime: start, slots: [
      { altid: 'a', name: 'First hour', startTime: start + 3600, endTime: start + 7200, pub: [] },
      { altid: 'b', name: 'Repeated hour', startTime: start + 7200, endTime: start + 10800, pub: [] },
      { altid: 'c', name: 'Overnight', startTime: start + 86400, endTime: start + 93600, pub: [] },
    ] }] };
  const week = n.normalizeScheduleWeek(raw, profile);
  assert.equal(week.days[0].slots.length, 3); assert.notEqual(week.days[0].slots[0].slotKey, week.days[0].slots[1].slotKey);
});
test('now-playing maps to exact archive key and clears Talk placeholder', () => {
  const data = n.normalizeCatalog(catalog(), profile);
  const live = n.normalizeNowPlaying(fixture('fe_nowplaying_kpfk.json'), profile, data.directory);
  assert.ok(live.current.altid.startsWith('kpfk.kpfk.')); assert.equal(live.current.song, '');
  const raw = fixture('fe_nowplaying_kpfk.json'); raw.current = null; raw.next = null; raw.track = null;
  assert.equal(n.normalizeNowPlaying(raw, profile).current, null);
});
test('profile validation rejects station confusion and public projection does not expose arbitrary/private keys', () => {
  const raw = { ...require('../../stations/kpfk.json'), password: 'secret', arbitrary: 'hidden' };
  assert.doesNotMatch(JSON.stringify(publicProfile(validateProfile(raw))), /secret|hidden|origins|feeds/);
  raw.timezone = 'bad/timezone'; assert.throws(() => validateProfile(raw), /timezone/);
});

test('empty track array preserves the current program and next program', () => {
  const raw = fixture('fe_nowplaying_kpfk.json');
  raw.track = [];
  const live = n.normalizeNowPlaying(raw, profile);
  assert.equal(live.current.name, raw.current.name);
  assert.equal(live.current.dj, raw.current.host);
  assert.equal(live.next.name, raw.next.name);
  assert.equal(live.current.song, '');
  assert.equal(live.current.artist, '');
  raw.track = ['invalid'];
  assert.throws(() => n.normalizeNowPlaying(raw, profile), /track/);
});
