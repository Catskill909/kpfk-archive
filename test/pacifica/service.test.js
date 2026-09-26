'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createService } = require('../../lib/pacifica/service');
const { fetchBounded } = require('../../lib/pacifica/fetch-json');
const { validateProfile } = require('../../lib/station-config');
const profile = validateProfile(require('../../stations/kpfk.json'));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14/fe_catalog_kpfk.json'), 'utf8'));
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
function rig(t, responder) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-service-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let time = 1800000000000;
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, headers: options.headers }); return responder(url, options); };
  const options = { profile, dataDir, writeJsonAtomic: write, fetchImpl, now: () => time };
  return { options, service: createService(options), requests, tick: () => { time += 360000; } };
}
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', etag: 'catalog-v1' } });
test('single flight, durable restart, conditional 304 and outage preserve complete last-good data', async t => {
  let mode = 'ok';
  const r = rig(t, async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (mode === 'fail') throw new Error('offline');
    if (mode === '304') return new Response(null, { status: 304 });
    return json(raw);
  });
  const data = await Promise.all(Array.from({ length: 20 }, () => r.service.catalog()));
  assert.equal(r.requests.length, 1); assert.ok(data.every(d => d.count === 1143));
  r.tick(); mode = '304'; const unchanged = await r.service.catalog();
  assert.equal(r.requests[1].headers['If-None-Match'], 'catalog-v1');
  assert.equal(unchanged.revision, data[0].revision); assert.ok(unchanged.validatedAt > data[0].validatedAt);
  r.tick(); mode = 'fail'; const stale = await r.service.catalog(); assert.equal(stale.stale, true); assert.equal(stale.count, 1143);
  const restart = createService(r.options); const recovered = await restart.catalog();
  assert.equal(recovered.count, 1143); assert.equal(recovered.revision, data[0].revision);
});
// Feeds refresh lazily — only when a request needs them — so a quiet spell
// longer than a TTL is normal and the next request refreshes. /healthz read
// "past TTL" as stale and flagged healthy feeds (now-playing, 15s TTL, most of
// every minute). Stale must mean "the last refresh failed; serving last-good".
test('health: idle past TTL is not stale; a failed refresh is', async t => {
  let mode = 'ok';
  const r = rig(t, async () => { if (mode === 'fail') throw new Error('offline'); return json(raw); });
  await r.service.catalog();
  r.tick(); // 6 min, past the catalog's 5-min TTL, with no request in between
  const idle = r.service.health();
  assert.ok(Object.keys(idle).length > 0);
  for (const [name, h] of Object.entries(idle)) assert.equal(h.stale, false, `${name} idle past its TTL reported stale`);
  // the same probe must still see a real failure
  mode = 'fail'; const served = await r.service.catalog();
  assert.equal(served.stale, true); assert.equal(served.count, 1143);
  assert.equal(r.service.health().catalog.stale, true);
});
test('valid catalog replacement follows omissions and even empty catalogs; malformed refresh does not', async t => {
  let response = raw;
  const r = rig(t, () => json(response)); await r.service.catalog();
  response = { ...raw, episodes: {} }; r.tick(); assert.equal((await r.service.catalog()).count, 0);
  response = { updated: 1, episodes: {} }; r.tick();
  const invalid = await r.service.catalog(); assert.equal(invalid.count, 0); assert.equal(invalid.stale, true);
});
test('304 without saved body retries once unconditionally', async t => {
  let n = 0; const r = rig(t, () => ++n === 1 ? new Response(null, { status: 304 }) : json(raw));
  assert.equal((await r.service.catalog()).count, 1143); assert.equal(r.requests.length, 2);
  assert.equal(r.requests[1].headers['If-None-Match'], undefined);
});
test('write failure cannot publish nondurable candidate', async t => {
  let response = raw; const r = rig(t, () => json(response));
  const initial = await r.service.catalog();
  const existing = createService({ ...r.options, writeJsonAtomic() { throw new Error('disk full'); } });
  response = { ...raw, episodes: {} }; r.tick(); const failed = await existing.catalog();
  assert.equal(failed.count, initial.count); assert.equal(failed.stale, true);
});
test('bounded fetch rejects HTML, oversized body, external redirects and malformed UTF-8', async () => {
  const opts = { origins: profile.origins.feeds };
  const url = profile.feeds.catalog;
  await assert.rejects(fetchBounded(url, { ...opts, fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) }), /content type/);
  await assert.rejects(fetchBounded(url, { ...opts, maxBytes: 2, fetchImpl: async () => json({ a: 123 }) }), /size limit/);
  await assert.rejects(fetchBounded(url, { ...opts, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://unapproved.example/' } }) }), /unapproved/);
  await assert.rejects(fetchBounded(url, { ...opts, fetchImpl: async () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }) }), /encoded|encoding/i);
});

// Every image URL an endpoint hands the browser must be same-origin: the app is
// served CSP `img-src 'self'`, so an absolute upstream URL is silently never
// drawn. The schedule once shipped slots with no proxied `photo` at all and
// rendered without artwork while the catalog's images worked. Walks every
// `photo` field on every Pacifica-backed payload, not just the schedule.
function foreignPhotos(value, where = '$', found = []) {
  if (Array.isArray(value)) value.forEach((v, i) => foreignPhotos(v, `${where}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'photo' && !(typeof v === 'string' && v.startsWith('/') && !v.startsWith('//'))) found.push(`${where}.photo=${JSON.stringify(v)}`);
      else foreignPhotos(v, `${where}.${k}`, found);
    }
  }
  return found;
}
test('every photo the service hands the browser is same-origin, schedule slots included', async t => {
  // The probe must still be able to see a violation, or "no violations" means nothing.
  assert.deepEqual(foreignPhotos({ a: [{ photo: 'https://confessor.kpfk.org/pix/x.jpg' }, { photo: '/api/artwork/ok' }, { photo: undefined }] }).length, 2);
  const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-photo-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const fetchImpl = async url => json(JSON.parse(fs.readFileSync(path.join(dir, path.basename(new URL(url).pathname)), 'utf8')));
  const service = createService({ profile, dataDir, writeJsonAtomic: write, fetchImpl, now: () => 1789435100000 });
  const index = await service.schedule();
  // Week first, catalog second: the week is normalized with no directory to
  // borrow artwork from, which is the ordering a fresh boot can produce.
  const early = await service.schedule(index.weeks[0].weekStart);
  const catalog = await service.catalog();
  const week = await service.schedule(index.weeks[0].weekStart);
  const live = await service.live();
  for (const [name, payload] of Object.entries({ catalog, early, week, live })) assert.deepEqual(foreignPhotos(payload), [], name);
  const slots = week.days.flatMap(d => d.slots);
  assert.ok(slots.length > 100 && slots.every(s => typeof s.photo === 'string'), 'every slot carries a photo');
  const withArt = slots.filter(s => (catalog.directory[s.showKey] || {}).photoUrl);
  assert.ok(withArt.length > 0 && withArt.every(s => s.photo.startsWith('/api/artwork/')),
    'a slot whose show has catalog artwork gets the proxied image, even if the week loaded before the catalog');
});

// Display policy (2026-09-15, uploads 2026-09-25): the listener archive shows on-air
// programs in the published schedule plus every upload show (`2kpfk`) with episodes.
// On-air programs no longer scheduled stay in the catalog mirror but are not served.
function fixtureService(t, fail = () => false) {
  const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-scheduled-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const fetchImpl = async url => {
    const name = path.basename(new URL(url).pathname);
    if (fail(name)) throw new Error(`offline: ${name}`);
    return json(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  };
  return createService({ profile, dataDir, writeJsonAtomic: write, fetchImpl, now: () => 1789435100000 });
}
test('archive() serves the scheduled programs plus upload shows; the catalog mirror keeps everything', async t => {
  const service = fixtureService(t);
  const catalog = await service.catalog();
  // Not yet measured: must not claim a schedule outage ("primary-channel"); uploads are served.
  const early = service.peekArchive();
  assert.equal(early.filter.basis, "pending");
  // Aired uploads are served; future-dated ones are held until air time (2026-09-26).
  const aired = r => r.dt <= 1789435100;
  assert.equal(early.shows.filter(r => r.archiveSource === "2kpfk").length, catalog.shows.filter(r => r.archiveSource === "2kpfk" && aired(r)).length);
  const index = await service.schedule();
  const scheduled = new Set();
  for (const w of index.weeks) (await service.schedule(w.weekStart)).days.forEach(d => d.slots.forEach(s => scheduled.add(s.showKey)));
  // Positive controls: the fixture really contains uploads and programs that must be hidden.
  const uploads = catalog.shows.filter(r => r.archiveSource === '2kpfk');
  const unscheduledOnAir = catalog.shows.filter(r => r.archiveSource === 'kpfk' && !scheduled.has(r.sho));
  assert.ok(uploads.length > 100, 'fixture has archive-only uploads');
  const view = await service.archive();
  assert.equal(view.filter.basis, 'schedule');
  assert.ok(unscheduledOnAir.length > 0, 'fixture has unscheduled on-air programs');
  assert.deepEqual(new Set(view.shows.map(r => r.sho)), new Set(catalog.shows.map(r => r.sho).filter(k => scheduled.has(k) || k.split('.')[1] === '2kpfk')));
  assert.equal(view.shows.filter(r => r.archiveSource === '2kpfk').length, uploads.filter(aired).length, 'every aired upload episode served');
  assert.equal(view.shows.filter(r => unscheduledOnAir.includes(r)).length, 0, 'no unscheduled on-air shows served');
  assert.ok(Object.keys(view.directory).every(k => scheduled.has(k) || uploads.some(r => r.sho === k)), 'directory: scheduled programs and upload shows with episodes');
  const future = catalog.shows.filter(r => !aired(r) && (scheduled.has(r.sho) || r.archiveSource === '2kpfk'));
  assert.ok(future.length > 0, 'fixture has future-dated episodes');
  assert.deepEqual(view.filter.heldUntilAir.map(h => h.id).sort(), future.map(r => r.id).sort(), 'held, and named');
  assert.equal(view.count, view.shows.length); assert.equal(view.filter.hiddenEpisodes, catalog.count - view.count - future.length);
  assert.equal((await service.catalog()).count, 1143, 'catalog mirror is untouched');
  assert.notEqual(view.revision, catalog.revision, 'membership is part of the archive revision');
  assert.equal(service.peekArchive().count, view.count, 'the synchronous view agrees');
});
test('a held episode appears by itself at its air time, and the listing revision moves', async t => {
  const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-held-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let clock = 1789435100000;
  const service = createService({ profile, dataDir, writeJsonAtomic: write, now: () => clock,
    fetchImpl: async url => json(JSON.parse(fs.readFileSync(path.join(dir, path.basename(new URL(url).pathname)), 'utf8'))) });
  const before = await service.archive();
  const next = before.filter.heldUntilAir.reduce((a, h) => (a && a.airs <= h.airs ? a : h), null);
  assert.ok(next, 'fixture holds something');
  assert.ok(!before.shows.some(r => r.id === next.id));
  clock = next.airs * 1000;
  const after = service.peekArchive();
  assert.ok(after.shows.some(r => r.id === next.id), 'released at air time');
  assert.ok(!after.filter.heldUntilAir.some(h => h.id === next.id));
  assert.notEqual(after.revision, before.revision);
});
test('a schedule outage limits the archive to the on-air channel, labelled, instead of emptying it', async t => {
  const service = fixtureService(t, name => name !== 'fe_catalog_kpfk.json');
  const catalog = await service.catalog();
  const view = await service.archive();
  assert.equal(view.filter.basis, 'primary-channel');
  assert.ok(view.count > 0);
  assert.equal(view.count, catalog.shows.filter(r => r.dt <= 1789435100).length, 'on-air channel plus uploads, aired only');
  assert.ok(view.shows.filter(r => r.archiveSource === '2kpfk').length > 0, 'uploads stay served during the outage');
});

// Artwork memory cache (2026-09-24): repeats used to go back to Pacifica every time
// (~0.4 s per image). Class: no request after the first may reach upstream until the
// refresh interval, and a stale copy is served at once while it refreshes.
test('artwork is fetched once, shared while in flight, served stale while refreshing, and warmed', async t => {
  let version = 'v1';
  const r = rig(t, async url => {
    if (/\.(jpe?g|png)$/i.test(new URL(url).pathname)) {
      await new Promise(resolve => setTimeout(resolve, 5));
      return new Response(Buffer.from('img-' + version + '-' + url), { headers: { 'content-type': 'image/jpeg' } });
    }
    return json(raw);
  });
  const catalog = await r.service.catalog();
  const ids = [...new Set(JSON.stringify(catalog).match(/\/api\/artwork\/[a-f0-9]{64}/g).map(p => p.slice(13)))];
  assert.ok(ids.length > 10, 'fixture has artwork');
  const images = () => r.requests.filter(q => /\.(jpe?g|png)$/i.test(new URL(q.url).pathname)).length;
  const [a, b] = await Promise.all([r.service.artwork(ids[0]), r.service.artwork(ids[0])]);
  assert.equal(images(), 1, 'concurrent requests share one upstream fetch');
  assert.equal(a.etag, b.etag); assert.match(a.etag, /^"[A-Za-z0-9_-]+"$/);
  await r.service.artwork(ids[0]);
  assert.equal(images(), 1, 'a repeat is served from memory');
  for (let i = 0; i < 61; i++) r.tick(); // past the 6-hour refresh interval
  version = 'v2';
  const stale = await r.service.artwork(ids[0]);
  assert.equal(stale.etag, a.etag, 'the stale copy is answered immediately');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(images(), 2, 'one background refresh');
  assert.notEqual((await r.service.artwork(ids[0])).etag, a.etag, 'changed art arrives after the refresh');
  const warmed = await r.service.warmArtwork();
  assert.equal(warmed.cached, warmed.requested); assert.equal(images(), 2 + warmed.requested);
  await r.service.artwork(ids[1]); assert.equal(images(), 2 + warmed.requested, 'warmed images need no fetch');
});
