'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanEnv() { const env = { ...process.env }; for (const key of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[key]; return env; }
async function freePort() {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
test('missing profile and foreign DATA_DIR fail before boot writes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-guard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const missing = spawnSync(process.execPath, ['server.js'], { cwd: root, env: { ...cleanEnv(), DATA_DIR: dir }, encoding: 'utf8' });
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /STATION_PROFILE is required/); assert.deepEqual(fs.readdirSync(dir), []);
  fs.writeFileSync(path.join(dir, '.instance.json'), JSON.stringify({ station: 'wbai', id: 'existing' }));
  const foreign = spawnSync(process.execPath, ['server.js'], { cwd: root,
    env: { ...cleanEnv(), STATION_PROFILE: 'stations/kpfk.json', DATA_DIR: dir }, encoding: 'utf8' });
  assert.notEqual(foreign.status, 0); assert.match(foreign.stderr, /different station/);
  assert.deepEqual(fs.readdirSync(dir), ['.instance.json']);
});
// The listener archive shows only programs in the published schedule (policy
// 2026-09-15). Expected membership is computed here straight from the fixture
// files, independently of the service code under test.
function fixtureScheduledArchive() {
  const catalog = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fe_catalog_kpfk.json'), 'utf8'));
  const altids = new Set();
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.altid === 'string') altids.add(node.altid);
    Object.values(node).forEach(walk);
  };
  for (const f of fs.readdirSync(fixtureDir).filter(f => /^fe_schedule_kpfk_\d+\.json$/.test(f))) walk(JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8')));
  const onAir = catalog.episodes.kpfk;
  const episodes = [...altids].reduce((n, a) => n + Object.keys(onAir[a] || {}).length, 0);
  const programs = catalog.shows.kpfk.filter(s => altids.has(s.altid)).map(s => s.altid);
  return { altids, episodes, programs, allEpisodes: Object.values(catalog.episodes).reduce((n, g) => n + Object.values(g).reduce((m, e) => m + Object.keys(e).length, 0), 0) };
}
test('real HTTP archive serves every episode of scheduled programs only, exact show metadata, branding and durable restart', async t => {
  const expected = fixtureScheduledArchive();
  assert.ok(expected.episodes > 0 && expected.episodes < expected.allEpisodes, 'fixture has both scheduled and hidden episodes');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-http-'));
  const requested = [];
  let online = true;
  const upstream = http.createServer((req, res) => {
    requested.push(req.url);
    const name = path.basename(req.url);
    if (!online) { res.writeHead(503); return res.end(); }
    const file = path.join(fixtureDir, name);
    if (!name.startsWith('fe_') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json')));
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_feed/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_feed/fe_channels.json';
  const profileFile = path.join(dir, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));
  const preload = path.join(dir, 'network.cjs');
  fs.writeFileSync(preload, `const original=global.fetch;global.fetch=(url,options)=>{if(new URL(url).origin!==${JSON.stringify(base)}){console.error('UNEXPECTED_UPSTREAM '+url);throw new Error('Unexpected upstream');}return original(url,options)};`);
  let child, logs = '';
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    await new Promise(resolve => upstream.close(resolve)); fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  async function boot() {
    child = spawn(process.execPath, ['--require', preload, 'server.js'], { cwd: root,
      env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(url + '/healthz')).ok) return; } catch {}
      await sleep(30);
    }
    throw new Error('Server not ready: ' + logs);
  }
  await boot();
  const archive = await (await fetch(url + '/api/archive')).json();
  assert.equal(archive.count, expected.episodes); assert.equal(archive.shows.length, expected.episodes);
  assert.ok(archive.shows.every(r => r.archiveSource === 'kpfk' && expected.altids.has(r.upstreamAltId)), 'only scheduled on-air programs');
  assert.equal(archive.shows.filter(r => r.upstreamAltId === 'dn').length, 69);
  assert.equal(archive.shows.filter(r => r.archiveSource === '2kpfk').length, 0, 'archive-only uploads are not served');
  const info = await (await fetch(url + '/api/showinfo')).json(); assert.equal(info.count, expected.programs.length);
  const detail = await (await fetch(url + '/api/showinfo/kpfk.kpfk.' + expected.programs[0])).json(); assert.ok(detail.info.name);
  const head = await (await fetch(url + '/api/archive/head')).json(); assert.equal(head.revision, archive.revision);
  const home = await (await fetch(url)).text(); assert.match(home, /KPFK/); assert.doesNotMatch(home, /WBAI|wbai\.org|\{\{station\./);
  const settings = await (await fetch(url + '/api/station')).json(); assert.equal(settings.id, 'kpfk');
  assert.doesNotMatch(JSON.stringify(settings), /feeds|origins|password/);
  const manifest = await (await fetch(url + '/manifest.webmanifest')).json(); assert.match(manifest.name, /KPFK/);
  assert.equal((await fetch(url + '/data/shows-fallback.json')).status, 404);
  assert.equal((await fetch(url + '/pix/wbai_med_1.jpg')).status, 404);
  const sched = await (await fetch(url + '/api/schedule')).json(); assert.equal(sched.weeks.length, 3);
  const week = await (await fetch(url + '/api/schedule?weekStart=' + sched.weeks[0].weekStart)).json(); assert.equal(week.days.length, 7);
  assert.equal((await fetch(url + '/api/schedule?weekStart=bad')).status, 400);
  const health = await (await fetch(url + '/healthz')).json(); assert.equal(health.station, 'kpfk'); assert.equal(health.ready, true);
  assert.equal(health.archiveFilter.basis, 'schedule'); assert.equal(health.archiveFilter.hiddenEpisodes, expected.allEpisodes - expected.episodes);
  assert.equal(requested.filter(p => p.endsWith('fe_catalog_kpfk.json')).length, 1);
  assert.doesNotMatch(logs, /UNEXPECTED_UPSTREAM/);
  const identity = health.storage.instanceId;
  child.kill(); await new Promise(resolve => child.once('exit', resolve)); online = false;
  await boot(); const recovered = await (await fetch(url + '/api/archive')).json();
  // Offline restart: the saved schedule, not just the saved catalog, must come
  // back — a primary-channel fallback here would change both count and revision.
  assert.equal(recovered.revision, archive.revision); assert.equal(recovered.count, expected.episodes);
  assert.equal((await (await fetch(url + '/healthz')).json()).storage.instanceId, identity);
});
