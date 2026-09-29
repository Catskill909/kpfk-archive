'use strict';
// Station template, slice 1 (step 5b, 2026-09-29): Station & appearance edits in the studio.
// Unit tests pin the rules (lib/station-overrides.js); the HTTP test runs a real server and
// asserts what a listener and a link preview actually receive after an edit — every place the
// station is shown, so a value copied at boot (the bug this design has to avoid) cannot hide.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { validateProfile } = require('../../lib/station-config');
const O = require('../../lib/station-overrides');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const raw = () => JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }

/** A real, tiny PNG (1×1), built here so the test does not trust the code under test. */
function png(seed = 0) {
  const crc = b => { const x = Buffer.alloc(4); x.writeUInt32BE(zlib.crc32(b) >>> 0); return x; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([len, td, crc(td)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, seed & 255, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}

test('rules: only the listed fields, text checked, links through the profile validation; no edits = the same station', () => {
  const base = validateProfile(raw());
  const { siteUrl, musicWindowDays, musicShows, episodeCorrections, hiddenShows, showTypes, ...min } = raw();
  for (const b of [base, validateProfile(min)]) assert.deepEqual(O.effectiveProfile(b, {}), b, 'no edits changes nothing');
  assert.deepEqual(O.checkValues({ name: ' KPFK-2 ', links: { volunteer: '' } }), { ok: true, values: { name: 'KPFK-2', links: { volunteer: '' } } });
  for (const [bad, re] of [[{ feeds: {} }, /cannot be changed/], [{ timezone: 'UTC' }, /cannot be changed/], [{ name: '' }, /empty/],
    [{ name: 'x'.repeat(81) }, /longer than/], [{ city: '<b>LA</b>' }, /< or >/], [{ links: { myspace: 'https://x.org' } }, /Unknown link/],
    [{ social: { tiktok: 'https://x.org' } }, /Unknown social/], [{ logo: '/assets/other.png' }, /uploaded here/]]) {
    const r = O.checkValues(bad);
    assert.ok(!r.ok && r.errors.some(e => re.test(e)), JSON.stringify(bad) + ' → ' + JSON.stringify(r));
  }
  const e = O.effectiveProfile(base, { name: 'KPFK-2', links: { volunteer: '' }, social: { bluesky: 'https://bsky.app/profile/kpfk.org' } });
  assert.equal(e.name, 'KPFK-2'); assert.equal(e.links.volunteer, undefined); assert.equal(e.social.bluesky, 'https://bsky.app/profile/kpfk.org');
  assert.throws(() => O.effectiveProfile(base, { links: { donate: 'http://insecure.example.org/' } }), /HTTPS/);
  assert.throws(() => O.effectiveProfile(base, { links: { website: '' } }), /website and archive/);
});

test('store: apply, history, undo, persistence across restart; logos by content only', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-st-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const base = validateProfile(raw());
  const mk = () => O.createStationOverrides({ dataDir: dir, base, writeJsonAtomic: write });
  const s = mk();
  assert.equal(s.station().name, 'KPFK'); assert.deepEqual(s.history(), []);
  assert.equal(s.apply({ links: { donate: 'http://x.org' } }).ok, false, 'a bad edit is refused');
  assert.equal(fs.existsSync(path.join(dir, 'station', 'overrides.json')), false, 'and writes nothing');
  assert.ok(s.apply({ name: 'First' }).ok); assert.ok(s.apply({ name: 'Second', city: 'Pasadena' }).ok);
  assert.equal(s.station().name, 'Second'); assert.equal(s.history().length, 2);
  assert.equal(mk().station().city, 'Pasadena', 'survives a restart');
  assert.ok(s.undo().ok); assert.equal(s.station().name, 'First'); assert.equal(s.station().city, 'Los Angeles');
  assert.ok(s.undo().ok); assert.equal(s.station().name, 'KPFK', 'back to the profile');
  assert.equal(s.undo().ok, false, 'nothing left to undo');
  // Logos: a real PNG is stored by content hash; a disguised file or an oversized one is refused.
  const good = s.saveLogo(png(1));
  assert.ok(good.ok && /^\/station-assets\/logo-[a-f0-9]{16}\.png$/.test(good.logo), JSON.stringify(good));
  assert.deepEqual(s.saveLogo(png(1)), good, 'same bytes, same name');
  assert.ok(s.assetFile(good.logo.split('/').pop()));
  for (const bad of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.from('not an image'), Buffer.alloc(O.LOGO_MAX_BYTES + 1, 0x89)])
    assert.equal(s.saveLogo(bad).ok, false);
  assert.equal(s.assetFile('../overrides.json'), null, 'no path escapes');
  assert.ok(s.apply({ logo: good.logo }).ok); assert.equal(s.station().assets.logo, good.logo);
});

// ---------------------------------------------------------------- real HTTP
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[k]; return env; }
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('real HTTP: an edit reaches every place the station is shown, at once; undo puts it all back; backup carries it', { timeout: 120000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-st-http-'));
  const upstream = http.createServer((req, res) => {
    const name = path.basename(req.url), file = path.join(fixtureDir, name);
    if (!name.startsWith('fe_') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = raw();
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_feed/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_feed/fe_channels.json';
  const profileFile = path.join(tmp, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));
  const children = [];
  t.after(async () => {
    for (const ch of children) if (ch.exitCode === null) { ch.kill(); await new Promise(r => ch.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  async function boot(name) {
    const port = await freePort(), url = `http://127.0.0.1:${port}`;
    let logs = '';
    const child = spawn(process.execPath, ['server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw', PORT: String(port), DATA_DIR: path.join(tmp, name), ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
    children.push(child); child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
    for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }
    const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const csrf = (await (await fetch(url + '/api/studio/health', { headers: { Cookie: cookie } })).json()).csrf;
    const get = p => fetch(url + p, { headers: { Cookie: cookie } });
    const post = (p, body, type = 'application/json', extra = {}) => fetch(url + p, { method: 'POST', body, headers: { Cookie: cookie, 'Content-Type': type, 'X-Studio-CSRF': csrf, ...extra } });
    return { url, get, post, logs: () => logs };
  }
  // Everything a listener, a share preview or a browser receives that names the station.
  async function shown(srv) {
    const page = await (await fetch(srv.url + '/')).text();
    const csp = (await fetch(srv.url + '/')).headers.get('content-security-policy');
    return {
      title: (page.match(/<title>([^<]*)<\/title>/) || [])[1],
      ogSite: (page.match(/<meta property="og:site_name" content="([^"]*)"/) || [])[1],
      manifest: (await (await fetch(srv.url + '/manifest.webmanifest')).json()).name,
      api: (await (await fetch(srv.url + '/api/station')).json()).name,
      stationJs: /KPFK-TEST-NAME/.test(await (await fetch(srv.url + '/station.js')).text()),
      volunteerInMenu: /Volunteer/.test(page),
      frameSrc: (csp.match(/frame-src ([^;]*)/) || [])[1],
      logo: (page.match(/<img[^>]+src="(\/station-assets\/[^"?]+)/) || [])[1] || null,
    };
  }

  const A = await boot('a');
  const before = await shown(A);
  // Positive controls: the probe sees the profile's values in every place.
  assert.match(before.title, /^KPFK 90\.7 FM/); assert.equal(before.api, 'KPFK'); assert.ok(before.volunteerInMenu);
  assert.match(before.manifest, /KPFK/); assert.match(before.ogSite, /KPFK/); assert.equal(before.stationJs, false);
  assert.match(before.frameSrc, /docs\.pacifica\.org/);

  assert.equal((await fetch(A.url + '/api/studio/station')).status, 401, 'signed-in only');
  assert.equal((await fetch(A.url + '/api/studio/station/apply', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await A.post('/api/studio/station/preview', JSON.stringify({ links: { donate: 'http://x.org' } }))).status, 422, 'bad edit refused');
  const logo = await (await A.post('/api/studio/station/logo', png(7), 'image/png')).json();
  assert.ok(logo.ok, JSON.stringify(logo));
  assert.equal((await A.post('/api/studio/station/logo', Buffer.from('<svg/>'), 'image/png')).status, 422, 'not an image: refused whatever it claims');
  const edit = { name: 'KPFK-TEST-NAME', links: { volunteer: '', donate: 'https://donate.example.org/give' }, logo: logo.logo };
  const preview = await (await A.post('/api/studio/station/preview', JSON.stringify(edit))).json();
  assert.ok(preview.ok && preview.preview.name === 'KPFK-TEST-NAME', JSON.stringify(preview));
  assert.equal((await shown(A)).api, 'KPFK', 'a preview changes nothing');
  const applied = await (await A.post('/api/studio/station/apply', JSON.stringify(edit))).json();
  assert.ok(applied.ok, JSON.stringify(applied));

  const after = await shown(A);
  assert.match(after.title, /^KPFK-TEST-NAME 90\.7 FM/, 'page title');
  assert.match(after.ogSite, /KPFK-TEST-NAME/, 'link-preview site name');
  assert.match(after.manifest, /KPFK-TEST-NAME/, 'installed-app name');
  assert.equal(after.api, 'KPFK-TEST-NAME', '/api/station');
  assert.equal(after.stationJs, true, '/station.js');
  assert.equal(after.volunteerInMenu, false, 'a removed link leaves the menu');
  assert.match(after.frameSrc, /https:\/\/donate\.example\.org/, 'the Donate frame follows the new link');
  assert.equal(after.logo, logo.logo, 'the header shows the uploaded logo');
  const img = await fetch(A.url + logo.logo);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), png(7), 'served exactly as uploaded');

  // Backup carries the edits and the logo; a fresh server restores them; undo reverses them.
  const backup = await (await A.get('/api/studio/backup')).text();
  const B = await boot('b');
  assert.equal((await shown(B)).api, 'KPFK', 'B starts as the profile');
  const pv = await (await B.post('/api/studio/import/preview', backup)).json();
  assert.ok(pv.ok, JSON.stringify(pv));
  const row = pv.settings.find(x => x.group === 'station');
  assert.deepEqual([row.backup, row.server, row.action], [3, 0, 'set'], JSON.stringify(row));   // name, links, logo
  const restored = await (await B.post('/api/studio/import/apply', backup, 'application/json', { 'X-Import-Token': pv.token })).json();
  assert.ok(restored.ok && restored.settings.station, JSON.stringify(restored));
  const onB = await shown(B);
  assert.equal(onB.api, 'KPFK-TEST-NAME'); assert.match(onB.title, /^KPFK-TEST-NAME/); assert.equal(onB.volunteerInMenu, false);
  assert.equal(onB.logo, logo.logo, 'the logo came with the backup');
  assert.deepEqual(Buffer.from(await (await fetch(B.url + logo.logo)).arrayBuffer()), png(7));
  await sleep(3100);   // the import cooldown
  const undone = await (await B.post('/api/studio/import/undo', '')).json();
  assert.ok(undone.ok && undone.settings.station, JSON.stringify(undone));
  assert.equal((await shown(B)).api, 'KPFK', 'undo puts B back to its profile');

  // Undo in the studio puts every place back on A too.
  const back = await (await A.post('/api/studio/station/undo', '')).json();
  assert.ok(back.ok, JSON.stringify(back));
  assert.deepEqual(await shown(A), before, 'every place shows the profile again');
});
