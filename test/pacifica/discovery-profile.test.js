'use strict';
// Station profile settings read by the Discovery plugin (moved in from kpfk-discovery-plugin
// 2026-09-28). Each is explicit per station and never guessed; bad values stop the server.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { loadProfile, validateProfile, publicProfile } = require('../../lib/station-config');
const root = path.join(__dirname, '../..');
const raw = () => JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));

test('plugins: discovery (may have it) and qir are separate booleans; KPFK may have both', () => {
  const kpfk = loadProfile('stations/kpfk.json', { root, env: {} });
  assert.deepEqual(kpfk.plugins, { discovery: true, qir: true });
  // The main page learns only whether Discovery is on; the rest is the plugin's business.
  assert.deepEqual(publicProfile(kpfk).plugins, { discovery: true });
  for (const bad of [{ qir: 'yes' }, { discovery: 1 }]) assert.throws(() => validateProfile({ ...raw(), plugins: bad }), /plugins\./);
  const { plugins, ...none } = raw();
  assert.deepEqual(validateProfile(none).plugins, { discovery: false, qir: false });
});

// Duplicate records (2026-09-25): Confessor keeps old and new records for BradCast and Bike Talk.
test('hiddenShows is an explicit list of show keys, kept out of the main page config', () => {
  const kpfk = loadProfile('stations/kpfk.json', { root, env: {} });
  assert.deepEqual(kpfk.hiddenShows, ['friedman', 'biketalka']);
  for (const key of ['hiddenShows', 'musicShows', 'musicWindowDays', 'episodeCorrections']) assert.equal(Object.hasOwn(publicProfile(kpfk), key), false, key);
  for (const bad of ['friedman', ['../x'], [''], [42]]) assert.throws(() => validateProfile({ ...raw(), hiddenShows: bad }), /hidden/);
  const { hiddenShows, ...none } = raw();
  assert.deepEqual(validateProfile(none).hiddenShows, []);
});

test('musicWindowDays and musicShows: validated, KPFK = 14 days + Special Music Programming', () => {
  const p = validateProfile(raw());
  assert.equal(p.musicWindowDays, 14);
  assert.deepEqual(p.musicShows, ['specialmusicprogramm']);
  for (const bad of [0, -1, 1.5, '14', 366]) assert.throws(() => validateProfile({ ...raw(), musicWindowDays: bad }), /musicWindowDays/);
  for (const bad of ['x', ['../x'], [42]]) assert.throws(() => validateProfile({ ...raw(), musicShows: bad }), /musicShows|music show/);
  const { musicWindowDays, musicShows, ...none } = raw();
  const q = validateProfile(none);
  assert.equal(q.musicWindowDays, null);
  assert.deepEqual(q.musicShows, []);
});

test('episodeCorrections: mp3 file, real show key and a note are all required', () => {
  const p = validateProfile(raw());
  assert.equal(p.episodeCorrections.length, 3);
  assert.ok(p.episodeCorrections.every(c => c.show === 'alanwatts' && /\.mp3$/.test(c.file) && c.note));
  const good = { file: 'kpfk_260726_083000onconta.mp3', show: 'alanwatts', note: 'why' };
  for (const bad of ['x', [{ ...good, file: '../x.mp3' }], [{ ...good, file: 'x.wav' }], [{ ...good, show: '../x' }], [{ ...good, note: ' ' }]]) {
    assert.throws(() => validateProfile({ ...raw(), episodeCorrections: bad }), /episode correction|episodeCorrections/);
  }
  const { episodeCorrections, ...none } = raw();
  assert.deepEqual(validateProfile(none).episodeCorrections, []);
});

test('the show-type rule still applies alongside the Discovery settings', () => {
  assert.equal(validateProfile(raw()).showTypes['2kpfk.biketalk'], 'Talk');
});

test('siteUrl and retiredHosts (step 8): an https origin, and hostnames that are not the site itself', () => {
  // KPFK sets siteUrl but retires no host: kpfk-discovery.pacifica.audio is kept for a future
  // staging app (Paul, 2026-09-29), which a redirect would make unreachable.
  assert.equal(validateProfile(raw()).siteUrl, 'https://podcasts.kpfk.org');
  assert.deepEqual(validateProfile(raw()).retiredHosts, []);
  const p = validateProfile({ ...raw(), retiredHosts: ['old.example.org'] });
  assert.deepEqual(p.retiredHosts, ['old.example.org']);
  for (const bad of ['http://podcasts.kpfk.org', 'https://podcasts.kpfk.org/path', 'podcasts.kpfk.org', 'https://u@podcasts.kpfk.org'])
    assert.throws(() => validateProfile({ ...raw(), siteUrl: bad }), /siteUrl/, bad);
  for (const bad of [['https://old.example'], ['podcasts.kpfk.org'], ['bad host'], 'x'])
    assert.throws(() => validateProfile({ ...raw(), retiredHosts: bad }), /retired host|retiredHosts/, JSON.stringify(bad));
  const { siteUrl, ...noSite } = raw();
  assert.throws(() => validateProfile({ ...noSite, retiredHosts: ['old.example.org'] }), /retiredHosts needs siteUrl/);
  assert.equal(validateProfile(noSite).siteUrl, null);
});
