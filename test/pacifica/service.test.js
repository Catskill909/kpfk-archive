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
