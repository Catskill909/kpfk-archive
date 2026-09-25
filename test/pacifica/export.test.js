'use strict';
// Studio exports, phase 1: the `listening` dataset (docs/exports.md).
//
// Unit tests pin the CSV writer and the pure builder; the HTTP test boots the
// real server on the pinned fixtures with seeded stats files, downloads the
// files a station manager would, parses them with an independent parser, and
// compares them to the seeded counters and to the dashboard's own report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { toCsv } = require('../../lib/export/csv');
const L = require('../../lib/export/listening');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The documented columns, written out here rather than read from the module:
// a column added to COLUMNS without a docs/exports.md change must fail this.
const DOCUMENTED = {
  daily: ['station', 'date_utc', 'page_views', 'episode_plays', 'live_tune_ins', 'searches', 'shares',
    'seconds_listened_on_demand', 'seconds_listened_live'],
  shows: ['station', 'show_key', 'show_title', 'plays', 'seconds_listened'],
  reach: ['station', 'bucket', 'label', 'page_views'],
};

/** RFC 4180 parser, independent of the writer under test. Strips the BOM. */
function parseCsv(text) {
  assert.equal(text.charCodeAt(0), 0xFEFF, 'CSV starts with a BOM');
  const rows = []; let row = [], cell = '', i = 1, quoted = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else if (c === '\n') throw new Error('bare LF outside quotes at ' + i);
    else cell += c;
  }
  assert.equal(cell + row.join(''), '', 'file ends with CRLF');
  const [head, ...body] = rows;
  return { head, rows: body.map(r => { assert.equal(r.length, head.length, 'row width'); return Object.fromEntries(head.map((h, j) => [h, r[j]])); }) };
}

test('CSV writer: quoting, BOM, CRLF, formula cells, raw numbers', () => {
  const tricky = ['Radio "Maíz", en Español', 'line one\nline two', 'carriage\rreturn', '', 'plain'];
  const rows = tricky.map((t, n) => ({ title: t, n: n * 1.5, neg: -n }));
  rows.push({ title: null, n: 0, neg: 0 }, { title: '=HYPERLINK("x")', n: 1, neg: 1 }, { title: '-1 Show', n: 2, neg: 2 });
  const csv = toCsv(['title', 'n', 'neg'], rows);
  assert.deepEqual([...Buffer.from(csv, 'utf8').subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'UTF-8 BOM is the first three bytes');
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.head, ['title', 'n', 'neg']);
  assert.deepEqual(parsed.rows.slice(0, tricky.length).map(r => r.title), tricky, 'text round-trips exactly');
  assert.deepEqual(parsed.rows.map(r => r.n), ['0', '1.5', '3', '4.5', '6', '0', '1', '2'], 'numbers unrounded');
  assert.equal(parsed.rows[1].neg, '-1', 'a negative number is not treated as a formula');
  assert.equal(parsed.rows[5].title, '', 'null is an empty cell');
  assert.equal(parsed.rows[6].title, '\'=HYPERLINK("x")', 'formula-looking text is neutralised');
  assert.equal(parsed.rows[7].title, "'-1 Show");
  assert.throws(() => toCsv(['n'], [{ n: NaN }]), /non-finite/);
});

function month(days) { return days; }
const ZONES = [{ key: 'local', label: 'America/Los_Angeles' }, { key: 'national', label: 'Elsewhere in the US' },
  { key: 'intl', label: 'International' }, { key: 'unknown', label: 'Not reported' }];
function build(from, to, store, titleFor = () => '') {
  return L.buildListeningExport({ station: 'kpfk', stationTimezone: 'America/Los_Angeles', from, to,
    monthDays: m => store[m] || {}, titleFor, zones: ZONES, generatedAt: '2026-09-16T00:00:00.000Z' });
}

test('builder: every day of the span, totals equal the day records, columns are exactly the documented set', () => {
  const store = {
    '2026-08': month({
      '2026-08-03': { pageviews: 5, plays: 2, live: 1, searches: 1, shares: 0, listenSeconds: 400, liveSeconds: 30,
        byShow: { 'kpfk.kpfk.a': 2 }, secondsByShow: { 'kpfk.kpfk.a': 400 }, byZone: { local: 4, intl: 1 } },
      // An older build's record: no listenSeconds, no maps. Zeros, never NaN.
      '2026-08-31': { pageviews: 1, plays: 1, live: 0, searches: 0, shares: 1 },
    }),
    '2026-09': month({ '2026-09-02': { pageviews: 2, plays: 3, byShow: { 'kpfk.kpfk.b': 3 }, secondsByShow: { 'kpfk.kpfk.b': 50, 'kpfk.kpfk.a': 60 }, byZone: { national: 2 } } }),
  };
  const aug = build('2026-08-01', '2026-08-31', store, k => (k === 'kpfk.kpfk.a' ? 'Show A' : ''));
  assert.equal(aug.daily.length, 31, 'a whole month, including days with no activity');
  assert.equal(aug.daily[0].date_utc, '2026-08-01'); assert.equal(aug.daily[30].date_utc, '2026-08-31');
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
  assert.equal(sum(aug.daily, 'episode_plays'), 3); assert.equal(sum(aug.daily, 'page_views'), 6);
  assert.equal(sum(aug.daily, 'seconds_listened_on_demand'), 400); assert.equal(sum(aug.daily, 'shares'), 1);
  assert.deepEqual(aug.shows, [{ station: 'kpfk', show_key: 'kpfk.kpfk.a', show_title: 'Show A', plays: 2, seconds_listened: 400 }]);
  assert.deepEqual(aug.reach.map(r => [r.bucket, r.page_views]), [['local', 4], ['national', 0], ['intl', 1], ['unknown', 0]]);

  const sep = build('2026-09-01', '2026-09-16', store);
  assert.equal(sep.daily.length, 16); assert.equal(sep.manifest.to_date_utc, '2026-09-16');
  assert.deepEqual(sep.shows.map(s => [s.show_key, s.plays, s.seconds_listened, s.show_title]),
    [['kpfk.kpfk.a', 0, 60, ''], ['kpfk.kpfk.b', 3, 50, '']], 'ranked by seconds; an unnamed show has an empty title');

  const all = build('2026-08-01', '2026-09-16', store);
  assert.equal(all.daily.length, 31 + 16); assert.equal(sum(all.daily, 'episode_plays'), 6);
  assert.equal(all.manifest.from_date_utc, '2026-08-01'); assert.equal(all.manifest.days_covered, 47);

  // A span cuts at days, not months: only what falls inside it is counted.
  const cut = build('2026-08-04', '2026-09-01', store);
  assert.equal(cut.daily.length, 29); assert.equal(sum(cut.daily, 'episode_plays'), 1, 'only 2026-08-31 is inside');
  assert.deepEqual(cut.shows, [], 'the 31st named no show');
  assert.equal(build('2026-09-02', '2026-09-02', store).daily.length, 1, 'a single day is a span');
  assert.equal(L.exportFilename(cut.manifest, 'shows', 'csv'), 'kpfk-listening-shows-2026-08-04_2026-09-01.csv');

  for (const [table, cols] of Object.entries(DOCUMENTED)) {
    assert.deepEqual(L.COLUMNS[table], cols, `${table} columns are the documented set`);
    for (const row of all[table]) assert.deepEqual(Object.keys(row), cols, `${table} row carries only documented fields`);
    assert.deepEqual(all.manifest.tables[table].map(c => c.column), cols);
    assert.ok(all.manifest.tables[table].every(c => c.meaning), `${table}: every column is explained`);
  }
  assert.match(all.manifest.personal_data, /never collects an IP address/);
  assert.match(L.manifestText(all.manifest), /seconds_listened_on_demand: /);
});

test('builder: a station with no data exports zero-filled days, no show rows, zero reach', () => {
  const x = build('2026-09-01', '2026-09-03', {});
  assert.equal(x.daily.length, 3); assert.ok(x.daily.every(r => r.episode_plays === 0 && r.page_views === 0));
  assert.deepEqual(x.shows, []); assert.ok(x.reach.every(r => r.page_views === 0));
  const csv = parseCsv(toCsv(L.COLUMNS.shows, x.shows));
  assert.deepEqual(csv.head, DOCUMENTED.shows); assert.equal(csv.rows.length, 0);
});

const INV = require('../../lib/export/inventory');
const COV = require('../../lib/export/coverage');

test('inventory builder: air dates in the station clock decide the span, titles never ids', () => {
  // 2026-09-01T02:30Z is 7:30 pm on 2026-08-31 in Los Angeles.
  const lateLA = Date.UTC(2026, 8, 1, 2, 30) / 1000, noon = Date.UTC(2026, 8, 1, 19, 0) / 1000;
  const rows = [
    { id: 'kpfk.kpfk.1', sho: 'kpfk.kpfk.a', dt: lateLA, durationSec: 3600, episodeTitle: 'Late', categoryLabel: 'News', host: 'H', mp3: 'https://x/1.mp3', expiresAt: null },
    { id: 'kpfk.kpfk.2', sho: 'kpfk.kpfk.a', dt: noon, durationSec: 1800, episodeTitle: 'Noon', categoryLabel: 'News', host: 'H', mp3: 'https://x/2.mp3', expiresAt: noon + 86400 * 30 },
    { id: 'kpfk.kpfk.3', sho: 'kpfk.kpfk.nameless', dt: noon, durationSec: 60, episodeTitle: '', categoryLabel: '', host: '', mp3: '', expiresAt: null },
  ];
  const build = (from, to) => INV.buildInventory({ station: 'kpfk', stationTimezone: 'America/Los_Angeles', from, to, rows,
    titleFor: k => (k === 'kpfk.kpfk.a' ? 'Show A' : ''), scheduleBasis: 'schedule', generatedAt: 'g' });
  const aug31 = build('2026-08-31', '2026-08-31');
  assert.deepEqual(aug31.episodes.map(e => e.episode_id), ['kpfk.kpfk.1'], 'the 7:30 pm LA episode is an August 31 episode');
  assert.equal(aug31.episodes[0].air_time_local, '19:30'); assert.equal(aug31.episodes[0].air_datetime_utc, '2026-09-01T02:30:00.000Z');
  assert.deepEqual(build('2026-09-01', '2026-09-01').episodes.map(e => e.episode_id), ['kpfk.kpfk.2', 'kpfk.kpfk.3'],
    'and not a September 1 one, although that is its UTC date');
  const all = build('2026-08-01', '2026-09-30');
  assert.equal(all.episodes.length, 3);
  assert.deepEqual(all.shows.map(s => [s.show_key, s.show_title, s.episodes, s.total_seconds, s.oldest_air_date_local, s.newest_air_date_local]),
    [['kpfk.kpfk.nameless', '', 1, 60, '2026-09-01', '2026-09-01'], ['kpfk.kpfk.a', 'Show A', 2, 5400, '2026-08-31', '2026-09-01']]);
  assert.equal(all.episodes[1].expires_utc, new Date((noon + 86400 * 30) * 1000).toISOString());
  assert.equal(all.episodes[0].expires_utc, '');
  for (const [t, cols] of Object.entries(INV.COLUMNS)) for (const r of all[t]) assert.deepEqual(Object.keys(r), cols);
  assert.equal(INV.exportFilename(all.manifest, 'episodes', 'csv'), 'kpfk-archive-episodes-2026-08-01_2026-09-30.csv');
  assert.match(INV.manifestText(all.manifest), /no listener data of any kind/);
});

test('coverage builder: every catalog show, gaps as booleans, unknown schedule left empty', () => {
  const now = Date.UTC(2026, 8, 16, 12) / 1000;
  const directory = {
    'kpfk.kpfk.a': { archiveSource: 'kpfk', categoryLabel: 'News', photoUrl: 'https://c/a.jpg', desc: 'd', dj: 'H' },
    'kpfk.kpfk.b': { archiveSource: 'kpfk', categoryLabel: '', photoUrl: '', desc: '', shortdesc: '', dj: '' },
    'kpfk.2kpfk.c': { archiveSource: '2kpfk', photoUrl: '', desc: '', shortdesc: 'short', dj: '' },
  };
  const rows = [{ sho: 'kpfk.kpfk.a', dt: now - 86400 * 3 - 60 }, { sho: 'kpfk.kpfk.a', dt: now - 86400 * 10 }, { sho: 'kpfk.2kpfk.c', dt: now - 86400 * 40 }];
  const build = scheduleKeys => COV.buildCoverage({ station: 'kpfk', stationTimezone: 'America/Los_Angeles', directory, rows,
    listenerKeys: new Set(['kpfk.kpfk.a']), scheduleKeys, titleFor: k => ({ 'kpfk.kpfk.a': 'A', 'kpfk.2kpfk.c': 'C' })[k] || '',
    now: now * 1000, generatedAt: '2026-09-16T12:00:00.000Z' });
  // The feed's generic station picture, shared by 4+ shows, is not artwork.
  const generic = 'https://c/STATION_med.jpg';
  const withGeneric = { ...directory };
  for (const k of ['kpfk.kpfk.g1', 'kpfk.kpfk.g2', 'kpfk.kpfk.g3', 'kpfk.kpfk.g4']) withGeneric[k] = { archiveSource: 'kpfk', photoUrl: generic };
  withGeneric['kpfk.kpfk.pair1'] = { archiveSource: 'kpfk', photoUrl: 'https://c/pair.jpg' };
  withGeneric['kpfk.kpfk.pair2'] = { archiveSource: 'kpfk', photoUrl: 'https://c/pair.jpg' };
  const g = COV.buildCoverage({ station: 'kpfk', stationTimezone: 'America/Los_Angeles', directory: withGeneric, rows: [],
    listenerKeys: new Set(), scheduleKeys: new Set(), titleFor: () => '', now: now * 1000, generatedAt: '2026-09-16T12:00:00.000Z' });
  const art = Object.fromEntries(g.shows.map(r => [r.show_key, r.has_artwork]));
  assert.equal(art['kpfk.kpfk.g1'], false, 'a picture on four shows is the generic one');
  assert.equal(art['kpfk.kpfk.pair1'], true, 'two shows sharing a real image still have artwork');
  assert.deepEqual(g.manifest.generic_artwork, [{ url: generic, shows: 4 }]);

  const c = build(new Set(['kpfk.kpfk.a']));
  assert.deepEqual(c.shows.map(r => [r.show_key, r.show_title, r.in_published_schedule, r.shown_to_listeners, r.has_artwork, r.has_description, r.has_host, r.episodes_in_catalog, r.days_since_newest_episode]), [
    ['kpfk.2kpfk.c', 'C', false, false, false, true, false, 1, 40],
    ['kpfk.kpfk.a', 'A', true, true, true, true, true, 2, 3],
    ['kpfk.kpfk.b', '', false, false, false, false, false, 0, ''],
  ]);
  assert.deepEqual(c.manifest.summary, { in_published_schedule: 1, shown_to_listeners: 1, without_artwork: 2, without_description: 1, without_episodes: 1 });
  const unknown = build(null);
  assert.ok(unknown.shows.every(r => r.in_published_schedule === ''), 'no schedule, no guess');
  assert.equal(unknown.manifest.summary.in_published_schedule, null);
  for (const r of c.shows) assert.deepEqual(Object.keys(r), COV.COLUMNS.shows);
  assert.equal(COV.exportFilename(c.manifest, 'shows', 'csv'), 'kpfk-coverage-shows-2026-09-16.csv');
  assert.deepEqual(parseCsv(toCsv(COV.COLUMNS.shows, c.shows)).rows[1].has_artwork, 'true');
});

// ---------------------------------------------------------------- real HTTP
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[k]; return env; }
async function freePort() {
  const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
}

test('real HTTP: studio exports are gated, validated, titled, and agree with the dashboard', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-export-'));
  // Upstream titles with the characters KPFK's live feed has, on shows that have
  // left the schedule — so the catalog fallback, the quoting and an empty name
  // are all exercised through the real normalizer, not a stub.
  const catalog = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fe_catalog_kpfk.json'), 'utf8'));
  const rename = (altid, name) => { const s = catalog.shows.kpfk.find(x => x.altid === altid); assert.ok(s, altid); s.name = name; };
  rename('buildingbridges', 'Radio "Maíz", en Español');
  rename('biketalka', '');
  // As the live feed does since 2026-09-16: no image → the generic station picture.
  const GENERIC = 'https://confessor.kpfk.org/pix/KPFK_med.jpg';
  const noImage = new Set();
  for (const [src, list] of Object.entries(catalog.shows)) for (const x of list) if (!x.photoUrl) { noImage.add(`kpfk.${src}.${x.altid}`); x.photoUrl = GENERIC; }
  assert.ok(noImage.size > 20, 'the fixture has shows without artwork to stand in for');
  const upstream = http.createServer((req, res) => {
    const name = path.basename(req.url), file = path.join(fixtureDir, name);
    if (name === 'fe_catalog_kpfk.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(catalog)); }
    if (!name.startsWith('fe_') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json')));
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_feed/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_feed/fe_channels.json';
  const profileFile = path.join(dir, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));

  // A past month on disk, as production has. Keys: a scheduled show whose title
  // has a comma, two unscheduled shows (one renamed above, one emptied), and a
  // key no feed has ever named.
  const SEEDED = {
    'kpfk.kpfk.covidraceanddemocr': 'Capitalism, Race and Democracy',
    'kpfk.kpfk.buildingbridges': 'Radio "Maíz", en Español',
    'kpfk.kpfk.biketalka': '',
    'kpfk.kpfk.nosuchshowever': '',
  };
  const keys = Object.keys(SEEDED);
  const past = { station: 'kpfk', month: '2020-02', days: {
    '2020-02-10': { pageviews: 7, plays: 4, live: 2, searches: 3, shares: 1, listenSeconds: 1234, liveSeconds: 99,
      byShow: { [keys[0]]: 1, [keys[1]]: 2, [keys[2]]: 1 }, secondsByShow: { [keys[0]]: 600, [keys[1]]: 500, [keys[3]]: 134 }, byZone: { local: 5, intl: 2 } },
    '2020-02-29': { pageviews: 1, plays: 1, live: 0, searches: 0, shares: 0, listenSeconds: 10, liveSeconds: 0,
      byShow: { [keys[0]]: 1 }, secondsByShow: { [keys[0]]: 10 }, byZone: { unknown: 1 } },
  } };
  fs.mkdirSync(path.join(dir, 'data', 'stats'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'stats', '2020-02.json'), JSON.stringify(past));

  let child, logs = '';
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: root,
    env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'test-studio', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  let up = false;
  for (let i = 0; i < 200 && !up; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { up = (await fetch(url + '/healthz')).ok; } catch {}
    if (!up) await sleep(30);
  }
  assert.ok(up, 'server ready: ' + logs);
  await (await fetch(url + '/api/archive')).json();   // settle the scheduled filter

  const FEB = 'from=2020-02-01&to=2020-02-29';
  const good = `/api/studio/export?dataset=listening&${FEB}&format=csv&table=shows`;
  // Signed out: refused, and not because the URL is wrong — the same URL works signed in below.
  for (const p of ['/api/studio/exports', good, `/api/studio/export?dataset=listening&${FEB}&format=json`]) {
    const r = await fetch(url + p); assert.equal(r.status, 401, p); assert.doesNotMatch(await r.text(), /Capitalism/);
  }

  const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-studio' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = p => fetch(url + p, { headers: { Cookie: cookie } });
  // Response.text() strips a leading BOM while decoding, so read the bytes the
  // server actually sent: the BOM is what keeps Excel from mangling `Español`.
  const bytes = async r => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer());

  // Live traffic in the current month, so "today" has something to disagree about.
  const archive = await (await fetch(url + '/api/archive')).json();
  const played = archive.shows[0];
  const beacon = body => fetch(url + '/api/ev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const b of [{ t: 'pageview', z: 'Europe/Paris' }, { t: 'play', u: played.mp3 }, { t: 'listen', u: played.mp3, s: 45 }, { t: 'search' }]) {
    assert.equal((await beacon(b)).status, 204);
  }

  const index = await (await get('/api/studio/exports')).json();
  const thisMonth = new Date().toISOString().slice(0, 7);
  assert.equal(index.hasData, true);
  assert.deepEqual(index.months.map(m => m.month), [thisMonth, '2020-02'], 'newest first, only months that exist');
  assert.equal(index.months[1].daysWithData, 2);
  const todayUtc = new Date().toISOString().slice(0, 10);
  assert.equal(index.firstDate, '2020-02-01', 'spans start at the oldest month on disk');
  assert.equal(index.today, todayUtc);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const [from, to] of [['2020-02-10', '2020-02-09'], ['2020-01-31', '2020-02-29'], ['2020-02-01', tomorrow],
    ['2020-02-30', '2020-03-01'], ['../stats/2020-02', '2020-02-29'], ['2020-2-1', '2020-02-29'], ['', '2020-02-29'], [null, null]]) {
    const q = [from !== null && 'from=' + encodeURIComponent(from), to !== null && 'to=' + encodeURIComponent(to)].filter(Boolean).join('&');
    const r = await get('/api/studio/export?dataset=listening&format=csv&' + q);
    assert.equal(r.status, 400, `span ${from}..${to} refused`);
  }
  for (const q of [`dataset=nosuch&${FEB}&format=csv`, `dataset=inventory&format=csv&table=episodes`,
    `dataset=coverage&format=csv&table=daily`, `dataset=listening&${FEB}&format=xlsx`,
    `dataset=listening&${FEB}&format=csv&table=ip`]) {
    assert.equal((await get('/api/studio/export?' + q)).status, 400, q);
  }

  // Shows CSV: titles from the archive and from the catalog mirror; an empty cell,
  // never a key, when nothing names the show.
  const showsRes = await get(good);
  assert.equal(showsRes.status, 200);
  assert.equal(showsRes.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(showsRes.headers.get('content-disposition'), 'attachment; filename="kpfk-listening-shows-2020-02-01_2020-02-29.csv"');
  assert.equal(showsRes.headers.get('cache-control'), 'private, no-store');
  assert.equal(showsRes.headers.get('vary'), 'Cookie');
  const shows = parseCsv(await bytes(showsRes));
  assert.deepEqual(shows.head, DOCUMENTED.shows);
  assert.deepEqual(shows.rows.map(r => r.show_key), [keys[0], keys[1], keys[3], keys[2]], 'every seeded show, ranked by seconds');
  for (const r of shows.rows) {
    assert.equal(r.show_title, SEEDED[r.show_key], `${r.show_key} title`);
    assert.ok(!r.show_title.includes('kpfk.') && r.show_title !== r.show_key.split('.').pop(), 'no id in a title cell');
  }
  assert.deepEqual(shows.rows.map(r => [r.plays, r.seconds_listened]), [['2', '610'], ['2', '500'], ['0', '134'], ['1', '0']]);

  // Daily CSV totals equal the seeded file, every day of February present.
  const daily = parseCsv(await bytes(await get(`/api/studio/export?dataset=listening&${FEB}&format=csv&table=daily`)));
  assert.deepEqual(daily.head, DOCUMENTED.daily);
  assert.equal(daily.rows.length, 29, 'leap February, zero days included');
  const total = (rows, k) => rows.reduce((n, r) => n + Number(r[k]), 0);
  const seeded = k => Object.values(past.days).reduce((n, d) => n + d[k], 0);
  assert.equal(total(daily.rows, 'episode_plays'), seeded('plays'));
  assert.equal(total(daily.rows, 'page_views'), seeded('pageviews'));
  assert.equal(total(daily.rows, 'seconds_listened_on_demand'), seeded('listenSeconds'));
  assert.equal(total(daily.rows, 'seconds_listened_live'), seeded('liveSeconds'));

  // A span inside the month counts only its own days: the 10th is outside this one.
  const late = parseCsv(await bytes(await get('/api/studio/export?dataset=listening&from=2020-02-11&to=2020-02-29&format=csv&table=daily')));
  assert.equal(late.rows.length, 19); assert.equal(total(late.rows, 'episode_plays'), 1);

  const reach = parseCsv(await bytes(await get(`/api/studio/export?dataset=listening&${FEB}&format=csv&table=reach`)));
  assert.deepEqual(reach.rows.map(r => [r.bucket, r.label, r.page_views]),
    [['local', 'America/Los_Angeles', '5'], ['national', 'Elsewhere in the US', '0'], ['intl', 'International', '2'], ['unknown', 'Not reported', '1']]);

  // The export and the dashboard read today's counters identically.
  const usage = await (await get('/api/studio/usage?days=7')).json();
  const todayDash = usage.days[usage.days.length - 1];
  const now = parseCsv(await bytes(await get(`/api/studio/export?dataset=listening&from=${thisMonth}-01&to=${todayUtc}&format=csv&table=daily`)));
  const todayExp = now.rows[now.rows.length - 1];
  assert.equal(todayExp.date_utc, todayDash.day);
  assert.ok(todayDash.plays > 0 && todayDash.listenSeconds > 0, 'beacons landed, so the comparison is not 0 = 0');
  assert.deepEqual(
    [todayExp.page_views, todayExp.episode_plays, todayExp.live_tune_ins, todayExp.searches, todayExp.shares, todayExp.seconds_listened_on_demand, todayExp.seconds_listened_live].map(Number),
    [todayDash.pageviews, todayDash.plays, todayDash.live, todayDash.searches, todayDash.shares, todayDash.listenSeconds, todayDash.liveSeconds]);

  // JSON: the whole export in one file, same numbers as the CSVs.
  const jsonRes = await get(`/api/studio/export?dataset=listening&from=2020-02-01&to=${todayUtc}&format=json`);
  assert.equal(jsonRes.headers.get('content-disposition'), `attachment; filename="kpfk-listening-2020-02-01_${todayUtc}.json"`);
  const json = await jsonRes.json();
  assert.deepEqual(Object.keys(json), ['manifest', 'daily', 'shows', 'reach']);
  assert.equal(json.manifest.station, 'kpfk'); assert.equal(json.manifest.schema_version, 1);
  assert.equal(json.manifest.station_timezone, 'America/Los_Angeles'); assert.equal(json.manifest.from_date_utc, '2020-02-01');
  assert.equal(json.manifest.to_date_utc, todayUtc);
  for (const [table, cols] of Object.entries(DOCUMENTED)) for (const row of json[table]) assert.deepEqual(Object.keys(row), cols);
  assert.equal(json.daily.filter(r => r.date_utc.startsWith('2020-02')).reduce((n, r) => n + r.episode_plays, 0), seeded('plays'));

  // ---- Archive (inventory) and coverage, on the pinned fixtures
  const idx = await (await get('/api/studio/exports')).json();
  const inv = idx.datasets.find(d => d.name === 'inventory'), cov = idx.datasets.find(d => d.name === 'coverage');
  assert.deepEqual(idx.datasets.map(d => [d.name, d.span]), [['listening', 'utc'], ['inventory', 'local'], ['coverage', null], ['profile', null], ['report', 'mixed']]);
  assert.equal(inv.hasData, true); assert.equal(cov.hasData, true);
  // Local air dates computed here with a separate formatter, not the app's.
  const la = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const laDate = sec => { const p = Object.fromEntries(la.formatToParts(sec * 1000).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
  const localDates = archive.shows.map(r => laDate(r.dt)).sort();
  assert.equal(inv.firstDate, localDates[0], 'archive span starts at the oldest local air date');
  const episodesCsv = parseCsv(await bytes(await get(`/api/studio/export?dataset=inventory&from=${inv.firstDate}&to=${inv.today}&format=csv&table=episodes`)));
  assert.deepEqual(episodesCsv.head, INV.COLUMNS.episodes);
  assert.deepEqual(episodesCsv.rows.map(r => r.episode_id).sort(), archive.shows.map(r => r.id).sort(), 'every episode listeners can play, once');
  const titleOfShow = new Map(archive.shows.map(r => [r.sho, r.title]));
  for (const r of episodesCsv.rows) {
    assert.equal(r.show_title, titleOfShow.get(r.show_key) === r.show_key.split('.').pop() ? '' : titleOfShow.get(r.show_key), r.show_key);
    assert.equal(r.air_date_local, laDate(Date.parse(r.air_datetime_utc) / 1000));
  }
  const invShows = parseCsv(await bytes(await get(`/api/studio/export?dataset=inventory&from=${inv.firstDate}&to=${inv.today}&format=csv&table=shows`)));
  assert.equal(invShows.rows.length, new Set(archive.shows.map(r => r.sho)).size);
  assert.equal(invShows.rows.reduce((n, r) => n + Number(r.episodes), 0), episodesCsv.rows.length, 'show counts add up to the episode rows');
  // The class: an evening episode is the previous day in Los Angeles.
  const evening = archive.shows.find(r => laDate(r.dt) !== new Date(r.dt * 1000).toISOString().slice(0, 10));
  assert.ok(evening, 'the fixture has an episode whose LA date differs from its UTC date');
  const utcDay = new Date(evening.dt * 1000).toISOString().slice(0, 10), laDay = laDate(evening.dt);
  const onLaDay = parseCsv(await bytes(await get(`/api/studio/export?dataset=inventory&from=${laDay}&to=${laDay}&format=csv&table=episodes`)));
  assert.ok(onLaDay.rows.some(r => r.episode_id === evening.id), `in its LA day ${laDay}`);
  if (utcDay <= inv.today) {
    const onUtcDay = parseCsv(await bytes(await get(`/api/studio/export?dataset=inventory&from=${utcDay}&to=${utcDay}&format=csv&table=episodes`)));
    assert.ok(!onUtcDay.rows.some(r => r.episode_id === evening.id), `not in its UTC day ${utcDay}`);
  }
  const invRes = await get(`/api/studio/export?dataset=inventory&from=${laDay}&to=${laDay}&format=json`);
  assert.equal(invRes.headers.get('content-disposition'), `attachment; filename="kpfk-archive-${laDay}_${laDay}.json"`);
  assert.equal((await get(`/api/studio/export?dataset=inventory&from=${localDates[0]}&to=${tomorrow}&format=csv`)).status, 400, 'archive span ends today');

  // Coverage: every show in the catalog as served (after the renames above).
  const covRes = await get('/api/studio/export?dataset=coverage&format=csv&table=shows');
  assert.equal(covRes.status, 200);
  assert.equal(covRes.headers.get('content-disposition'), `attachment; filename="kpfk-coverage-shows-${todayUtc}.csv"`);
  const covCsv = parseCsv(await bytes(covRes));
  assert.deepEqual(covCsv.head, COV.COLUMNS.shows);
  const catalogKeys = Object.entries(catalog.shows).flatMap(([src, list]) => list.map(x => `kpfk.${src}.${x.altid}`)).sort();
  assert.deepEqual(covCsv.rows.map(r => r.show_key), catalogKeys, 'one row per catalog show, every source');
  // From the schedule files themselves — a scheduled program can have no
  // episodes, so the archive's rows are not the schedule.
  const altids = new Set();
  const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return;
    if (typeof n.altid === 'string') altids.add(n.altid); Object.values(n).forEach(walk); };
  for (const f of fs.readdirSync(fixtureDir).filter(f => /^fe_schedule_kpfk_\d+\.json$/.test(f))) walk(JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8')));
  const scheduled = new Set(catalog.shows.kpfk.filter(x => altids.has(x.altid)).map(x => `kpfk.kpfk.${x.altid}`));
  assert.ok([...scheduled].some(k => !archive.shows.some(r => r.sho === k)), 'the fixture has a scheduled program with no episodes');
  const byKey = new Map(covCsv.rows.map(r => [r.show_key, r]));
  for (const k of catalogKeys) {
    assert.equal(byKey.get(k).in_published_schedule, String(scheduled.has(k)), `${k} schedule`);
    // Listeners also get every upload show with episodes (2026-09-25); the schedule column stays schedule-only.
    const upload = k.split('.')[1] === '2kpfk' && archive.shows.some(r => r.sho === k);
    assert.equal(byKey.get(k).shown_to_listeners, String(scheduled.has(k) || upload), `${k} listeners`);
  }
  assert.deepEqual(covCsv.rows.filter(r => r.has_artwork === 'false').map(r => r.show_key).sort(), [...noImage].sort(),
    'shows with only the generic station picture have no artwork');
  assert.equal(byKey.get('kpfk.kpfk.buildingbridges').show_title, 'Radio "Maíz", en Español');
  assert.equal(byKey.get('kpfk.kpfk.buildingbridges').in_published_schedule, 'false');
  assert.equal(byKey.get('kpfk.kpfk.biketalka').show_title, '', 'a show with no name has an empty title, not its id');
  const rawEpisodes = k => { const [, src, alt] = k.split('.'); return Object.keys((catalog.episodes[src] || {})[alt] || {}).length; };
  for (const k of catalogKeys) assert.equal(Number(byKey.get(k).episodes_in_catalog), rawEpisodes(k), `${k} episodes`);
  const covJson = await (await get('/api/studio/export?dataset=coverage&format=json')).json();
  assert.equal(covJson.manifest.summary.without_episodes, catalogKeys.filter(k => rawEpisodes(k) === 0).length);
  assert.equal(covJson.manifest.schedule_known, true);
  assert.deepEqual(covJson.manifest.generic_artwork, [{ url: GENERIC, shows: noImage.size }]);
  assert.match(await (await get('/api/studio/export?dataset=coverage&format=readme')).text(), /Without artwork: +\d+/);
  for (const p of ['/api/studio/export?dataset=coverage&format=csv', `/api/studio/export?dataset=inventory&from=${laDay}&to=${laDay}&format=csv`]) {
    assert.equal((await fetch(url + p)).status, 401, 'signed out: ' + p);
  }

  // ---- The studio's own screens name shows the same way: a show that has left
  // the schedule is named from the catalog, not printed as its slug.
  const allUsage = await (await get('/api/studio/usage?days=all')).json();
  const usageTitle = k => (allUsage.topShows.find(x => x.slug === k) || {}).title;
  assert.equal(usageTitle('kpfk.kpfk.buildingbridges'), 'Radio "Maíz", en Español', 'Most listened shows: off-schedule show by its catalog title');
  assert.equal(usageTitle('kpfk.kpfk.covidraceanddemocr'), 'Capitalism, Race and Democracy');
  assert.equal(usageTitle('kpfk.kpfk.nosuchshowever'), 'kpfk.kpfk.nosuchshowever', 'a show nothing names still prints its slug on screen');
  const history = await (await get('/api/studio/showhistory?slug=kpfk.kpfk.buildingbridges')).json();
  assert.equal(history.title, 'Radio "Maíz", en Español', 'show history: catalog title');

  // ---- Station profile: exactly the public projection, plus the category map
  const profRes = await get('/api/studio/export?dataset=profile&format=json');
  assert.equal(profRes.status, 200);
  assert.equal(profRes.headers.get('content-disposition'), `attachment; filename="kpfk-profile-${todayUtc}.json"`);
  const profText = await profRes.text(), prof = JSON.parse(profText);
  const publicStation = await (await fetch(url + '/api/station')).json();
  assert.deepEqual(prof.profile, { ...publicStation, categories: profile.categories }, 'the profile is /api/station plus the category map');
  // Nothing the public projection refuses — checked against the values, not just the key names.
  for (const secret of [profile.feeds.catalog, profile.feeds.channels, base, 'test-studio']) {
    assert.ok(!profText.includes(secret), `the profile file does not contain ${secret}`);
  }
  assert.doesNotMatch(profText, /"(feeds|origins|password|STUDIO_PASSWORD)"/);
  assert.deepEqual(prof.manifest.exports_available.map(d => d.name), ['listening', 'inventory', 'coverage', 'profile']);
  assert.equal((await get('/api/studio/export?dataset=profile&format=csv')).status, 400, 'no CSV for a nested profile');
  assert.match(await (await get('/api/studio/export?dataset=profile&format=readme')).text(), /no password, no feed address/);
  assert.equal((await fetch(url + '/api/studio/export?dataset=profile&format=json')).status, 401);

  // ---- Printable report: the same numbers as the downloads, CSP-clean, escaped
  const signedOut = await fetch(url + `/studio/report?${FEB}`, { redirect: 'manual' });
  assert.equal(signedOut.status, 302, 'report signed out'); assert.equal(signedOut.headers.get('location'), '/studio');
  assert.doesNotMatch(await signedOut.text(), /Capitalism/);
  const repRes = await get(`/studio/report?${FEB}`);
  assert.equal(repRes.status, 200);
  assert.equal(repRes.headers.get('cache-control'), 'private, no-store');
  assert.match(repRes.headers.get('content-security-policy'), /style-src 'self'/);
  const rep = await repRes.text();
  const unescape = t => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const totals = JSON.parse(unescape(rep.match(/data-totals='([^']+)'/)[1]));
  assert.equal(totals.plays, seeded('plays'), 'report plays = the seeded month = the CSV');
  assert.equal(totals.views, seeded('pageviews')); assert.equal(totals.onDemand, seeded('listenSeconds'));
  assert.match(rep, /Radio &quot;Maíz&quot;, en Español/, 'titles are escaped');
  assert.doesNotMatch(rep, /Radio "Maíz"/, 'and never raw');
  assert.match(rep, /untitled in the feed \(kpfk\.kpfk\.nosuchshowever\)/);
  assert.doesNotMatch(rep, />0m</, 'under a minute is shown in seconds, never as "0m"');
  assert.match(rep, />0s</);
  assert.match(rep, /untitled in the feed \(kpfk\.kpfk\.biketalka\)/);
  assert.doesNotMatch(rep, /\sstyle=|<style|<script(?![^>]*\ssrc=)/, 'no inline style or script: the CSP would void them');
  for (const [, src] of rep.matchAll(/\ssrc="([^"]+)"/g)) assert.ok(src.startsWith('/'), `same-origin: ${src}`);
  assert.match(rep, /href="\/report\.css\?v=[^"]+"/, 'the stylesheet is version-stamped');
  assert.match(rep, /<h2>Program data gaps<\/h2>/); assert.match(rep, /<h2>What the archive aired<\/h2>/);
  const tile = (html, label) => Number(((html.match(new RegExp(`<div class="tile-value">([\\d,]+)</div><div class="tile-label">${label}</div>`)) || [])[1] || 'NaN').replace(/,/g, ''));
  const repAll = await (await get(`/studio/report?from=${inv.firstDate}&to=${todayUtc}`)).text();
  const invAll = parseCsv(await bytes(await get(`/api/studio/export?dataset=inventory&from=${inv.firstDate}&to=${inv.today}&format=csv&table=episodes`)));
  assert.equal(tile(repAll, 'Episodes'), invAll.rows.length, 'report episodes = the Archive CSV');
  const covAll = parseCsv(await bytes(await get('/api/studio/export?dataset=coverage&format=csv')));
  assert.equal(tile(repAll, 'No artwork'), covAll.rows.filter(r => r.in_published_schedule === 'true' && r.has_artwork === 'false').length,
    'report artwork gaps = the Coverage CSV');
  for (const q of [`from=2020-02-10&to=2020-02-09`, `from=2020-02-01&to=${tomorrow}`, `from=1999-01-01&to=2020-02-01`, `from=2020-02-30&to=2020-03-01`]) {
    assert.equal((await get('/studio/report?' + q)).status, 400, 'report span ' + q);
  }
  const reportEntry = (await (await get('/api/studio/exports')).json()).datasets.find(d => d.name === 'report');
  assert.equal(reportEntry.span, 'mixed'); assert.equal(reportEntry.firstDate, '2020-02-01');

  const readme = await get(`/api/studio/export?dataset=listening&${FEB}&format=readme`);
  assert.equal(readme.headers.get('content-disposition'), 'attachment; filename="kpfk-listening-2020-02-01_2020-02-29-README.txt"');
  const text = await readme.text();
  assert.match(text, /never collects an IP address/); assert.match(text, /UTC calendar day/);
  for (const cols of Object.values(DOCUMENTED)) for (const c of cols) assert.match(text, new RegExp(`  ${c}: `));
});
