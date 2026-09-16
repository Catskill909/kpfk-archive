'use strict';
// Backup and import (docs/exports.md "1c"): moving a station's data to another
// server. Unit tests pin the validator's allow-list; the HTTP test runs two real
// servers — A makes a backup, B (a fresh install with its own traffic) restores
// it — and compares what a station manager would see: the exported files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const B = require('../../lib/export/backup');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const THIS_MONTH = '2026-09';
function day(extra = {}) {
  return { pageviews: 4, plays: 2, live: 1, searches: 0, shares: 0, listenSeconds: 120, liveSeconds: 30,
    byShow: { 'kpfk.kpfk.dn': 2 }, secondsByShow: { 'kpfk.kpfk.dn': 120 }, byZone: { local: 3, intl: 1 }, ...extra };
}
function backupOf(months) {
  return B.buildBackup({ station: 'kpfk', createdAt: 'x', appVersion: 'v', sourceInstanceId: 'i', months });
}
/** Re-sign after an edit, so the test reaches the rule it means to test rather than the checksum. */
function resign(b) { for (const m of Object.keys(b.stats)) b.checksums[m] = B.monthChecksum(b.stats[m]); return b; }
const errorsOf = b => { const v = B.validateBackup(b, { station: 'kpfk', thisMonth: THIS_MONTH }); return v.ok ? [] : v.errors; };

test('validator: a backup this app makes is accepted, and every rule refuses what it names', () => {
  const good = backupOf({ '2026-08': { station: 'kpfk', month: '2026-08', days: { '2026-08-02': day() } } });
  assert.deepEqual(errorsOf(good), [], 'a fresh backup validates');
  assert.deepEqual(errorsOf(JSON.parse(JSON.stringify(good))), [], 'and still validates after a JSON round trip');

  const cases = [
    ['not a backup', b => { b.format = 'other'; }, /not a backup made by this app/],
    ['newer format', b => { b.formatVersion = 2; }, /format version 2/],
    ['another station', b => { b.station = 'wbai'; }, /belongs to station "wbai"/],
    ['edited count, checksum kept', b => { b.stats['2026-08'].days['2026-08-02'].plays = 999; }, /does not match its checksum/],
    ['path-like month key', b => { b.stats['../x'] = b.stats['2026-08']; resign(b); }, /Month "..\/x" is not a month/],
    ['future month', b => { b.stats['2026-10'] = { station: 'kpfk', month: '2026-10', days: {} }; resign(b); }, /is in the future/],
    ['identifier field in a day', b => { b.stats['2026-08'].days['2026-08-02'].ip = '203.0.113.9'; resign(b); }, /unexpected field "ip"/],
    ['extra month field', b => { b.stats['2026-08'].sessions = []; resign(b); }, /unexpected field "sessions"/],
    ['day outside its month', b => { b.stats['2026-08'].days['2026-09-01'] = day(); resign(b); }, /is not a date in 2026-08/],
    ['impossible date', b => { b.stats['2026-08'].days['2026-08-32'] = day(); resign(b); }, /is not a date in 2026-08/],
    ['negative counter', b => { b.stats['2026-08'].days['2026-08-02'].plays = -1; resign(b); }, /"plays" must be a whole number/],
    ['fractional counter', b => { b.stats['2026-08'].days['2026-08-02'].listenSeconds = 1.5; resign(b); }, /"listenSeconds" must be a whole number/],
    ['unknown zone', b => { b.stats['2026-08'].days['2026-08-02'].byZone.Europe_Paris = 1; resign(b); }, /"byZone" has an unexpected key/],
    ['show key with a space', b => { b.stats['2026-08'].days['2026-08-02'].byShow['a b'] = 1; resign(b); }, /"byShow" has an unexpected key/],
    ['unknown setting', b => { b.settings = { timezone: 'X' }; }, /setting "timezone" that this version/],
    ['month stamped for another station', b => { b.stats['2026-08'].station = 'wbai'; resign(b); }, /stamped for station "wbai"/],
    ['no months', b => { b.stats = {}; b.checksums = {}; }, /contains no months/],
  ];
  for (const [name, edit, re] of cases) {
    const b = JSON.parse(JSON.stringify(good)); edit(b);
    const errs = errorsOf(b);
    assert.ok(errs.some(e => re.test(e)), `${name}: expected ${re}, got ${JSON.stringify(errs)}`);
  }
});

test('backupMonth drops only what the app already deletes; planImport names each action', () => {
  const legacy = { station: 'kpfk', month: '2026-08', days: { '2026-08-02': day({ terms: { news: 3 } }) }, terms: { x: 1 } };
  const shaped = B.backupMonth(legacy, 'kpfk', '2026-08');
  assert.deepEqual(Object.keys(shaped), ['station', 'month', 'days']);
  assert.equal(shaped.days['2026-08-02'].terms, undefined, 'legacy search terms never enter a backup');
  assert.equal(shaped.days['2026-08-02'].plays, 2);
  assert.deepEqual(errorsOf(backupOf({ '2026-08': shaped })), [], 'a legacy month still makes a valid backup');

  const a = { station: 'kpfk', month: '2026-07', days: { '2026-07-01': day() } };
  const b = { station: 'kpfk', month: '2026-08', days: { '2026-08-01': day() } };
  const b2 = { station: 'kpfk', month: '2026-08', days: { '2026-08-01': day({ plays: 9 }) } };
  const c = { station: 'kpfk', month: '2026-09', days: {} };
  const plan = B.planImport({ '2026-07': a, '2026-08': b }, { '2026-08': b2, '2026-09': c });
  assert.deepEqual(plan.map(p => [p.month, p.action]), [['2026-09', 'kept'], ['2026-08', 'replace'], ['2026-07', 'new']]);
  assert.equal(plan[1].backup.plays, 2); assert.equal(plan[1].server.plays, 9);
  assert.deepEqual(B.planImport({ '2026-08': b }, { '2026-08': JSON.parse(JSON.stringify(b)) }).map(p => p.action), ['identical']);
});

// ---------------------------------------------------------------- real HTTP
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[k]; return env; }
async function freePort() {
  const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
}
/** Every file under a directory, path → bytes. */
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p); else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}

test('real HTTP: back up A, restore on a fresh B, exports match; refusals; idempotent; undo', { timeout: 120000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-backup-'));
  const upstream = http.createServer((req, res) => {
    const name = path.basename(req.url), file = path.join(fixtureDir, name);
    if (!name.startsWith('fe_') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json')));
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_feed/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_feed/fe_channels.json';
  const profileFile = path.join(tmp, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));

  const children = [];
  t.after(async () => {
    for (const ch of children) if (ch.exitCode === null) { ch.kill(); await new Promise(r => ch.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  async function boot(name) {
    const dataDir = path.join(tmp, name), port = await freePort(), url = `http://127.0.0.1:${port}`;
    let logs = '';
    const child = spawn(process.execPath, ['server.js'], { cwd: root,
      env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw-' + name, PORT: String(port), DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(url + '/healthz')).ok) break; } catch {}
      await sleep(30);
    }
    const archive = await (await fetch(url + '/api/archive')).json();
    const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw-' + name }) });
    assert.equal(login.status, 200, name + ' login');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const csrf = (await (await fetch(url + '/api/studio/health', { headers: { Cookie: cookie } })).json()).csrf;
    const get = p => fetch(url + p, { headers: { Cookie: cookie } });
    const post = (p, body, headers = {}) => fetch(url + p, { method: 'POST', body,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Studio-CSRF': csrf, ...headers } });
    const beacon = b => fetch(url + '/api/ev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { url, dataDir, get, post, beacon, archive, logs: () => logs };
  }
  const todayUtc = new Date().toISOString().slice(0, 10), thisMonth = todayUtc.slice(0, 7);
  const statsFile = (srv, m) => path.join(srv.dataDir, 'stats', m + '.json');
  // Counters reach disk on a 5 s debounce. Wait for it, so "the preview wrote
  // nothing" is not confused with "the flush timer wrote something".
  async function settled(srv) {
    for (let i = 0; i < 80 && !fs.existsSync(statsFile(srv, thisMonth)); i++) await sleep(100);
    await sleep(5600);
  }
  const bytes = async r => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer());
  const exportsOf = async (srv, from) => {
    const out = {};
    for (const table of ['daily', 'shows', 'reach']) {
      const r = await srv.get(`/api/studio/export?dataset=listening&from=${from}&to=${todayUtc}&format=csv&table=${table}`);
      assert.equal(r.status, 200, table); out[table] = await bytes(r);
    }
    return out;
  };

  // ---- A: history on disk (with legacy search terms an old build wrote) + live traffic
  const aDir = path.join(tmp, 'a');
  fs.mkdirSync(path.join(aDir, 'stats'), { recursive: true });
  fs.writeFileSync(path.join(aDir, 'stats', '2020-02.json'), JSON.stringify({ station: 'kpfk', month: '2020-02', days: {
    '2020-02-10': day({ terms: { 'democracy now': 2 } }), '2020-02-29': day({ plays: 5, byShow: { 'kpfk.kpfk.dn': 5 } }) } }));
  const A = await boot('a');
  const played = A.archive.shows[0];
  for (const b of [{ t: 'pageview', z: 'America/Chicago' }, { t: 'play', u: played.mp3 }, { t: 'listen', u: played.mp3, s: 75 }]) assert.equal((await A.beacon(b)).status, 204);

  assert.equal((await fetch(A.url + '/api/studio/backup')).status, 401, 'backup is signed-in only');
  const backupRes = await A.get('/api/studio/backup');
  assert.equal(backupRes.headers.get('content-disposition'), `attachment; filename="kpfk-backup-${todayUtc}.json"`);
  assert.equal(backupRes.headers.get('cache-control'), 'private, no-store');
  const backupText = await backupRes.text();
  const backup = JSON.parse(backupText);
  assert.deepEqual(Object.keys(backup.stats), ['2020-02', thisMonth], 'every month, including counters not yet flushed');
  assert.equal(backup.stats[thisMonth].days[todayUtc].plays, 1);
  assert.doesNotMatch(backupText, /democracy now|"terms"/, 'legacy search terms never leave the server');
  const aExports = await exportsOf(A, '2020-02-01');

  // ---- B: a fresh install that has already counted a little of its own
  const Bsrv = await boot('b');
  const bIdentity = (await (await fetch(Bsrv.url + '/healthz')).json()).storage.instanceId;
  for (const b of [{ t: 'pageview', z: 'Europe/Paris' }, { t: 'play', u: played.mp3 }, { t: 'play', u: played.mp3 }, { t: 'play', u: played.mp3 }]) assert.equal((await Bsrv.beacon(b)).status, 204);
  await settled(Bsrv);
  const bOriginalMonth = JSON.parse(fs.readFileSync(statsFile(Bsrv, thisMonth), 'utf8'));
  const bOriginalDaily = (await exportsOf(Bsrv, thisMonth + '-01')).daily;

  // Gates.
  assert.equal((await fetch(Bsrv.url + '/api/studio/import/preview', { method: 'POST', body: backupText })).status, 401, 'preview signed out');
  assert.equal((await Bsrv.post('/api/studio/import/preview', backupText, { 'X-Studio-CSRF': 'nope' })).status, 403, 'preview without CSRF');
  assert.equal((await Bsrv.post('/api/studio/import/apply', backupText)).status, 409, 'apply without a preview token');

  // Preview writes nothing.
  const before = snapshot(Bsrv.dataDir);
  const previewRes = await Bsrv.post('/api/studio/import/preview', backupText);
  assert.equal(previewRes.status, 200);
  const preview = await previewRes.json();
  assert.deepEqual(preview.plan.map(p => [p.month, p.action]), [[thisMonth, 'replace'], ['2020-02', 'new']]);
  assert.equal(preview.changes, 2); assert.equal(preview.backup.sameServer, false);
  assert.equal(preview.plan[0].server.plays, 3); assert.equal(preview.plan[0].backup.plays, 1);
  assert.deepEqual(snapshot(Bsrv.dataDir), before, 'the data directory is byte-identical after a preview');

  // Refusals, through the real route.
  const refused = async (label, edit, re) => {
    const b = JSON.parse(backupText); edit(b);
    const r = await Bsrv.post('/api/studio/import/preview', JSON.stringify(b));
    const body = await r.json();
    assert.equal(r.status, 422, label); assert.ok(body.errors.some(e => re.test(e)), `${label}: ${JSON.stringify(body.errors)}`);
  };
  await refused('another station', b => { b.station = 'wbai'; }, /belongs to station "wbai"/);
  await refused('tampered count', b => { b.stats['2020-02'].days['2020-02-29'].plays = 500; }, /does not match its checksum/);
  await refused('path-like month', b => { b.stats['../../x'] = b.stats['2020-02']; resign(b); }, /is not a month/);
  await refused('planted identifier', b => { b.stats['2020-02'].days['2020-02-10'].ip = '198.51.100.7'; resign(b); }, /unexpected field "ip"/);
  const notJson = await Bsrv.post('/api/studio/import/preview', 'not json at all');
  assert.equal(notJson.status, 422);
  assert.equal((await Bsrv.post('/api/studio/import/apply', backupText.replace('"plays": 5', '"plays": 6'), { 'X-Import-Token': preview.token })).status, 409,
    'a token is bound to the previewed bytes');
  assert.deepEqual(snapshot(Bsrv.dataDir), before, 'nothing refused wrote anything');

  // Apply.
  const applyRes = await Bsrv.post('/api/studio/import/apply', backupText, { 'X-Import-Token': preview.token });
  const applied = await applyRes.json();
  assert.equal(applyRes.status, 200, JSON.stringify(applied));
  assert.deepEqual(applied.replaced, [thisMonth]); assert.deepEqual(applied.added, ['2020-02']);
  assert.equal(applied.lastImport.undoable, true);
  const folder = path.join(Bsrv.dataDir, 'stats', applied.folder);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, thisMonth + '.json'), 'utf8')), bOriginalMonth, "B's own month was copied aside first");

  assert.deepEqual(await exportsOf(Bsrv, '2020-02-01'), aExports, "B's exported files are byte-identical to A's");
  const bHealth = await (await fetch(Bsrv.url + '/healthz')).json();
  assert.equal(bHealth.storage.instanceId, bIdentity, 'B keeps its own identity');
  assert.notEqual(bIdentity, (await (await fetch(A.url + '/healthz')).json()).storage.instanceId);
  const index = await (await Bsrv.get('/api/studio/exports')).json();
  assert.equal(index.firstDate, '2020-02-01', 'the restored month is a real month to the rest of the app');

  // The next beacon lands on the imported counters, not on B's old ones.
  assert.equal((await Bsrv.beacon({ t: 'play', u: played.mp3 })).status, 204);
  const usage = await (await Bsrv.get('/api/studio/usage?days=7')).json();
  assert.equal(usage.days[usage.days.length - 1].plays, 2, "A's 1 play + the new one — not B's 3");

  // Idempotent: the same file again changes nothing. (The new beacon made this
  // month differ, so it is 'replace' again; the historical month is identical.)
  await sleep(3100);
  const again = await (await Bsrv.post('/api/studio/import/preview', backupText)).json();
  assert.equal(again.plan.find(p => p.month === '2020-02').action, 'identical');

  // Undo restores B exactly as it was, and deletes nothing.
  const undoRes = await Bsrv.post('/api/studio/import/undo', '');
  const undone = await undoRes.json();
  assert.equal(undoRes.status, 200, JSON.stringify(undone));
  assert.deepEqual(undone.restored, [thisMonth]); assert.deepEqual(undone.removed, ['2020-02']);
  assert.equal((await exportsOf(Bsrv, thisMonth + '-01')).daily, bOriginalDaily, "B's own figures are back");
  assert.equal(fs.existsSync(statsFile(Bsrv, '2020-02')), false, 'the added month left the live set');
  assert.ok(fs.existsSync(path.join(folder, 'imported-2020-02.json')), '...by moving into the import folder, not by deletion');
  assert.ok(fs.existsSync(path.join(folder, `undone-${thisMonth}.json`)), 'what the import put there is kept as well');
  assert.equal((await (await Bsrv.get('/api/studio/exports')).json()).firstDate, thisMonth + '-01');
  await sleep(3100);
  assert.equal((await Bsrv.post('/api/studio/import/undo', '')).status, 409, 'an import is undone once');
  assert.equal((await (await Bsrv.get('/api/studio/import/status')).json()).lastImport.undoable, false);
  assert.doesNotMatch(A.logs() + Bsrv.logs(), /import request failed|import failed|undo failed/);
});
