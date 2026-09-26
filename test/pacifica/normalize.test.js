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
// 2026-09-26: one malformed record used to reject the whole catalog, freezing the site (and
// the Flutter app and Discovery via /api/archive) at last-good. Every kind of record fault
// must now cost only that record, be named in `skipped`, and never go missing silently.
const firstEpisode = raw => { const [slug, dates] = Object.entries(raw.episodes['2kpfk'])[0]; const date = Object.keys(dates)[0]; return { slug, date, e: dates[date] }; };
const episodeFaults = {
  'identity disagrees with outer keys': e => { e.altid = 'wrong'; },
  'invalid episode id': e => { e.id = 'x'; },
  'invalid or unapproved URL': e => { e.mp3Url = 'https://evil.example/a.mp3'; },
  'expected array': e => { e.pub = 'text'; },
  'expected object': (e, dates, date) => { dates[date] = 'not a record'; },
};
for (const [issue, spoil] of Object.entries(episodeFaults)) {
  test(`one bad episode (${issue}) is skipped and named; the rest of the catalog is kept`, () => {
    const good = n.normalizeCatalog(catalog(), profile), raw = catalog(), { slug, date, e } = firstEpisode(raw);
    spoil(e, raw.episodes['2kpfk'][slug], date);
    const data = n.normalizeCatalog(raw, profile);
    assert.equal(data.count, good.count - 1);
    assert.equal(data.skipped.count, 1);
    assert.match(data.skipped.records[0].issue, new RegExp(issue.replace(/[()]/g, '\\$&')));
    assert.deepEqual([data.skipped.records[0].source, data.skipped.records[0].altid, data.skipped.records[0].date], ['2kpfk', slug, date]);
    assert.equal(data.skipped.records[0].path.startsWith(`episodes.kpfk.2kpfk.${slug}`), true);
  });
}
test('duplicate episode id: the first is kept, the second skipped', () => {
  const good = n.normalizeCatalog(catalog(), profile), raw = catalog();
  const list = Object.values(Object.values(raw.episodes.kpfk)[0]); list[1].id = list[0].id;
  const data = n.normalizeCatalog(raw, profile);
  assert.equal(data.count, good.count - 1); assert.equal(data.skipped.count, 1);
  assert.match(data.skipped.records[0].issue, /duplicate episode id/);
  assert.ok(data.shows.some(r => r.upstreamId === String(list[0].id)));
});
test('a bad show record is skipped once; its episodes are counted as dropped with it, not as separate faults', () => {
  const good = n.normalizeCatalog(catalog(), profile), raw = catalog();
  const show = raw.shows['2kpfk'].find(s => raw.episodes['2kpfk'][s.altid]);
  const episodes = Object.keys(raw.episodes['2kpfk'][show.altid]).length;
  show.plistid = 'kpfk';
  const data = n.normalizeCatalog(raw, profile);
  assert.equal(data.skipped.count, 1); assert.equal(data.skipped.droppedWithShow, episodes);
  assert.equal(data.count, good.count - episodes);
  assert.equal(data.directory[`kpfk.2kpfk.${show.altid}`], undefined);
});
test('a duplicate show keeps the first record and its episodes', () => {
  const good = n.normalizeCatalog(catalog(), profile), raw = catalog();
  raw.shows.kpfk.push({ ...raw.shows.kpfk[0] });
  const data = n.normalizeCatalog(raw, profile);
  assert.equal(data.skipped.count, 1); assert.match(data.skipped.records[0].issue, /duplicate show/);
  assert.equal(data.count, good.count); assert.equal(data.skipped.droppedWithShow, 0);
});
test('episodes for a show that is not in the directory are skipped and named', () => {
  const good = n.normalizeCatalog(catalog(), profile), raw = catalog(), { slug, date } = firstEpisode(raw);
  raw.shows['2kpfk'] = raw.shows['2kpfk'].filter(s => s.altid !== slug);
  const lost = Object.keys(raw.episodes['2kpfk'][slug]).length;
  const data = n.normalizeCatalog(raw, profile);
  assert.equal(data.count, good.count - lost); assert.equal(data.skipped.count, lost);
  assert.ok(data.skipped.records.some(r => r.date === date && /show missing/.test(r.issue)));
});
test('the fixture itself has nothing to skip', () => {
  assert.deepEqual(n.normalizeCatalog(catalog(), profile).skipped, { count: 0, droppedWithShow: 0, records: [] });
});
test('many malformed records mean a changed feed format: the whole catalog is rejected (last-good kept)', () => {
  const raw = catalog(); let spoiled = 0;
  for (const dates of Object.values(raw.episodes.kpfk)) for (const e of Object.values(dates)) { if (spoiled < 100) { e.mp3Url = ''; spoiled++; } }
  assert.throws(() => n.normalizeCatalog(raw, profile), /100 of \d+ records malformed.*feed format may have changed/);
});
test('document-level faults still reject the whole catalog', () => {
  for (const spoil of [r => { r.shows = []; }, r => { r.episodes = null; }, r => { r.updated = 'soon'; }, r => { r.channels = {}; }]) {
    const raw = catalog(); spoil(raw);
    assert.throws(() => n.normalizeCatalog(raw, profile), n.FeedError);
  }
});
test('a code bug inside a record is not mistaken for bad data', () => {
  const raw = catalog(), { e } = firstEpisode(raw);
  Object.defineProperty(e, 'pub', { get() { throw new TypeError('bug'); } });
  assert.throws(() => n.normalizeCatalog(raw, profile), TypeError);
});
test('malformed joins and duplicate IDs never lose records silently', () => {
  const raw = catalog(), group = Object.values(raw.episodes.kpfk)[0], date = Object.keys(group)[0];
  group[date].altid = 'wrong';
  const data = n.normalizeCatalog(raw, profile);
  assert.equal(data.count + data.skipped.count + data.skipped.droppedWithShow, n.normalizeCatalog(catalog(), profile).count);
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
// 2026-09-26: "Español" was mapped to 'special', so 17 Spanish-language shows were listed
// as Special Programming. Only the feed's own "Special Program" label may land there.
test('no feed category except Special Program is filed under Special Programming', () => {
  const data = n.normalizeCatalog(catalog(), profile);
  const wrong = Object.values(data.directory).filter(s => s.cat === 'special' && s.categoryLabel !== 'Special Program' && Object.hasOwn(profile.categories, s.categoryLabel));
  assert.deepEqual(wrong.map(s => `${s.name} (${s.categoryLabel})`), []);
  for (const [label, key] of Object.entries(profile.categories)) if (label !== 'Special Program') assert.notEqual(key, 'special', label);
  assert.equal(profile.categories['Español'], 'espanol');
});
// 2026-09-26: seven upload shows are typed Music in Confessor while every episode is Talk, so
// the Talk-only Flutter app hid 139 episodes. Corrections come only from station showTypes.
test('showTypes corrects only the listed show records, and each correction is recorded', () => {
  const raw = catalog(), show = raw.shows['2kpfk'].find(s => raw.episodes['2kpfk'][s.altid]);
  show.type = 'Music';
  const other = raw.shows['2kpfk'].find(s => s !== show); other.type = 'Music';
  const p = { ...profile, showTypes: { [`2kpfk.${show.altid}`]: 'Talk' } };
  const data = n.normalizeCatalog(raw, p);
  assert.equal(data.directory[`kpfk.2kpfk.${show.altid}`].type, 'Talk');
  assert.equal(data.directory[`kpfk.2kpfk.${other.altid}`].type, 'Music', 'unlisted shows are never guessed');
  assert.ok(data.diagnostics.some(d => d.path === `kpfk.2kpfk.${show.altid}.type` && /Music corrected to Talk/.test(d.issue)));
  assert.equal(n.normalizeCatalog(raw, { ...profile, showTypes: {} }).directory[`kpfk.2kpfk.${show.altid}`].type, 'Music', 'no config, no change');
});
test('showTypes entries are validated', () => {
  const base = require('../../stations/kpfk.json');
  for (const bad of [{ 'bradcast2': 'Talk' }, { '2kpfk.x': 'talk' }, { '2kpfk.x': 'Podcast' }, []])
    assert.throws(() => validateProfile({ ...base, showTypes: bad }), /showTypes/);
  assert.equal(validateProfile(base).showTypes['2kpfk.bradcast2'], 'Talk');
});
