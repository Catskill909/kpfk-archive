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
function build(period, store, today, titleFor = () => '') {
  return L.buildListeningExport({ station: 'kpfk', stationTimezone: 'America/Los_Angeles', period,
    months: Object.keys(store).sort(), monthDays: m => store[m] || {}, today, titleFor, zones: ZONES, generatedAt: '2026-09-16T00:00:00.000Z' });
}

test('builder: every day of the month, totals equal the day records, columns are exactly the documented set', () => {
  const store = {
    '2026-08': month({
      '2026-08-03': { pageviews: 5, plays: 2, live: 1, searches: 1, shares: 0, listenSeconds: 400, liveSeconds: 30,
        byShow: { 'kpfk.kpfk.a': 2 }, secondsByShow: { 'kpfk.kpfk.a': 400 }, byZone: { local: 4, intl: 1 } },
      // An older build's record: no listenSeconds, no maps. Zeros, never NaN.
      '2026-08-31': { pageviews: 1, plays: 1, live: 0, searches: 0, shares: 1 },
    }),
    '2026-09': month({ '2026-09-02': { pageviews: 2, plays: 3, byShow: { 'kpfk.kpfk.b': 3 }, secondsByShow: { 'kpfk.kpfk.b': 50, 'kpfk.kpfk.a': 60 }, byZone: { national: 2 } } }),
  };
  const aug = build('2026-08', store, '2026-09-16', k => (k === 'kpfk.kpfk.a' ? 'Show A' : ''));
  assert.equal(aug.daily.length, 31, 'a whole month, including days with no activity');
  assert.equal(aug.daily[0].date_utc, '2026-08-01'); assert.equal(aug.daily[30].date_utc, '2026-08-31');
  const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
  assert.equal(sum(aug.daily, 'episode_plays'), 3); assert.equal(sum(aug.daily, 'page_views'), 6);
  assert.equal(sum(aug.daily, 'seconds_listened_on_demand'), 400); assert.equal(sum(aug.daily, 'shares'), 1);
  assert.deepEqual(aug.shows, [{ station: 'kpfk', show_key: 'kpfk.kpfk.a', show_title: 'Show A', plays: 2, seconds_listened: 400 }]);
  assert.deepEqual(aug.reach.map(r => [r.bucket, r.page_views]), [['local', 4], ['national', 0], ['intl', 1], ['unknown', 0]]);

  // The current month stops at today — future days are not "no activity".
  const sep = build('2026-09', store, '2026-09-16');
  assert.equal(sep.daily.length, 16); assert.equal(sep.manifest.last_date_utc, '2026-09-16');
  assert.deepEqual(sep.shows.map(s => [s.show_key, s.plays, s.seconds_listened, s.show_title]),
    [['kpfk.kpfk.a', 0, 60, ''], ['kpfk.kpfk.b', 3, 50, '']], 'ranked by seconds; an unnamed show has an empty title');

  const all = build('all', store, '2026-09-16');
  assert.equal(all.daily.length, 31 + 16); assert.equal(sum(all.daily, 'episode_plays'), 6);
  assert.equal(all.manifest.first_date_utc, '2026-08-01'); assert.equal(all.manifest.days_covered, 47);

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
  const x = build('2026-09', {}, '2026-09-03');
  assert.equal(x.daily.length, 3); assert.ok(x.daily.every(r => r.episode_plays === 0 && r.page_views === 0));
  assert.deepEqual(x.shows, []); assert.ok(x.reach.every(r => r.page_views === 0));
  const csv = parseCsv(toCsv(L.COLUMNS.shows, x.shows));
  assert.deepEqual(csv.head, DOCUMENTED.shows); assert.equal(csv.rows.length, 0);
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

  const good = '/api/studio/export?dataset=listening&period=2020-02&format=csv&table=shows';
  // Signed out: refused, and not because the URL is wrong — the same URL works signed in below.
  for (const p of ['/api/studio/exports', good, '/api/studio/export?dataset=listening&period=all&format=json']) {
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

  for (const bad of ['../stats/2020-02', '2026-99', '2019-01', '', '2020-02.json']) {
    const r = await get('/api/studio/export?dataset=listening&format=csv&period=' + encodeURIComponent(bad));
    assert.equal(r.status, 400, `period ${JSON.stringify(bad)} refused`);
  }
  for (const q of ['dataset=inventory&period=2020-02&format=csv', 'dataset=listening&period=2020-02&format=xlsx',
    'dataset=listening&period=2020-02&format=csv&table=ip']) {
    assert.equal((await get('/api/studio/export?' + q)).status, 400, q);
  }

  // Shows CSV: titles from the archive and from the catalog mirror; an empty cell,
  // never a key, when nothing names the show.
  const showsRes = await get(good);
  assert.equal(showsRes.status, 200);
  assert.equal(showsRes.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(showsRes.headers.get('content-disposition'), 'attachment; filename="kpfk-listening-shows-2020-02.csv"');
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
  const daily = parseCsv(await bytes(await get('/api/studio/export?dataset=listening&period=2020-02&format=csv&table=daily')));
  assert.deepEqual(daily.head, DOCUMENTED.daily);
  assert.equal(daily.rows.length, 29, 'leap February, zero days included');
  const total = (rows, k) => rows.reduce((n, r) => n + Number(r[k]), 0);
  const seeded = k => Object.values(past.days).reduce((n, d) => n + d[k], 0);
  assert.equal(total(daily.rows, 'episode_plays'), seeded('plays'));
  assert.equal(total(daily.rows, 'page_views'), seeded('pageviews'));
  assert.equal(total(daily.rows, 'seconds_listened_on_demand'), seeded('listenSeconds'));
  assert.equal(total(daily.rows, 'seconds_listened_live'), seeded('liveSeconds'));

  const reach = parseCsv(await bytes(await get('/api/studio/export?dataset=listening&period=2020-02&format=csv&table=reach')));
  assert.deepEqual(reach.rows.map(r => [r.bucket, r.label, r.page_views]),
    [['local', 'America/Los_Angeles', '5'], ['national', 'Elsewhere in the US', '0'], ['intl', 'International', '2'], ['unknown', 'Not reported', '1']]);

  // The export and the dashboard read today's counters identically.
  const usage = await (await get('/api/studio/usage?days=7')).json();
  const todayDash = usage.days[usage.days.length - 1];
  const now = parseCsv(await bytes(await get(`/api/studio/export?dataset=listening&period=${thisMonth}&format=csv&table=daily`)));
  const todayExp = now.rows[now.rows.length - 1];
  assert.equal(todayExp.date_utc, todayDash.day);
  assert.ok(todayDash.plays > 0 && todayDash.listenSeconds > 0, 'beacons landed, so the comparison is not 0 = 0');
  assert.deepEqual(
    [todayExp.page_views, todayExp.episode_plays, todayExp.live_tune_ins, todayExp.searches, todayExp.shares, todayExp.seconds_listened_on_demand, todayExp.seconds_listened_live].map(Number),
    [todayDash.pageviews, todayDash.plays, todayDash.live, todayDash.searches, todayDash.shares, todayDash.listenSeconds, todayDash.liveSeconds]);

  // JSON: the whole export in one file, same numbers as the CSVs.
  const jsonRes = await get('/api/studio/export?dataset=listening&period=all&format=json');
  assert.equal(jsonRes.headers.get('content-disposition'), 'attachment; filename="kpfk-listening-all.json"');
  const json = await jsonRes.json();
  assert.deepEqual(Object.keys(json), ['manifest', 'daily', 'shows', 'reach']);
  assert.equal(json.manifest.station, 'kpfk'); assert.equal(json.manifest.schema_version, 1);
  assert.equal(json.manifest.station_timezone, 'America/Los_Angeles'); assert.equal(json.manifest.first_date_utc, '2020-02-01');
  for (const [table, cols] of Object.entries(DOCUMENTED)) for (const row of json[table]) assert.deepEqual(Object.keys(row), cols);
  assert.equal(json.daily.filter(r => r.date_utc.startsWith('2020-02')).reduce((n, r) => n + r.episode_plays, 0), seeded('plays'));

  const readme = await get('/api/studio/export?dataset=listening&period=2020-02&format=readme');
  assert.equal(readme.headers.get('content-disposition'), 'attachment; filename="kpfk-listening-2020-02-README.txt"');
  const text = await readme.text();
  assert.match(text, /never collects an IP address/); assert.match(text, /UTC calendar day/);
  for (const cols of Object.values(DOCUMENTED)) for (const c of cols) assert.match(text, new RegExp(`  ${c}: `));
});
