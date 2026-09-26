'use strict';
// Class (2026-09-26): the feed's durationSec can be 0 or wrong, and a station outage can
// publish a recording of a few seconds. The file itself is the truth: every way of reading
// its length must be right, a cut or garbled start must not be misread, and in the listener
// view a failed recording is hidden and a wrong duration corrected — each one recorded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { probe, durationOf, id3Size } = require('../../lib/pacifica/audio-probe');
const { createService } = require('../../lib/pacifica/service');
const { validateProfile } = require('../../lib/station-config');
const profile = validateProfile(require('../../stations/kpfk.json'));

// MPEG-1 Layer III, 128 kbps, 44.1 kHz, joint stereo: 417-byte frames.
const FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x44]), Buffer.alloc(413, 0x11)]);
const frames = n => Buffer.concat(Array(n).fill(FRAME));
const id3 = size => Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]), Buffer.alloc(size)]);

test('constant bitrate: length from size and bitrate', () => {
  assert.equal(Math.round(durationOf(frames(40), 1e6).seconds * 10) / 10, 62.5);
  assert.equal(durationOf(frames(40), 1e6).method, 'cbr');
});
test('an ID3 tag is skipped, including one larger than the first read', async () => {
  assert.equal(id3Size(id3(20)), 30);
  const small = Buffer.concat([id3(20), frames(40)]);
  const big = Buffer.concat([id3(20000), frames(40)]);
  for (const file of [small, big]) {
    const total = 57600000 + file.length - frames(40).length;
    const r = await probe('https://archive.kpfk.org/a.mp3', ranged(file, total));
    assert.equal(r.seconds, Math.round((total - id3Size(file)) * 8 / 128000));
  }
});
test('variable bitrate: frame count from the Xing header wins over size', () => {
  const first = Buffer.from(FRAME); first.write('Xing', 4 + 32, 'latin1'); first.writeUInt32BE(1, 4 + 36); first.writeUInt32BE(3000, 4 + 40);
  const d = durationOf(Buffer.concat([first, frames(40)]), 1e6);
  assert.equal(d.method, 'xing'); assert.equal(Math.round(d.seconds), Math.round(3000 * 1152 / 44100));
});
test('a recording cut mid-stream with a false header before the real frames is not misread', () => {
  // MPEG-2.5 Layer II, 24 kbps, 11.025 kHz: 313-byte frames. Two in a row (a chance match),
  // then the real stream — as in Law and Disorder 3 Aug, read as 5.3 h before the fix.
  const fake = Buffer.concat([Buffer.from([0xff, 0xe5, 0x30, 0x00]), Buffer.alloc(309, 0x22)]);
  const buf = Buffer.concat([Buffer.from([0x84, 0xcd, 0x4c]), fake, fake, frames(40)]);
  const d = durationOf(buf, 57660400);
  assert.equal(d.kbps, 128); assert.equal(Math.round(d.seconds / 60), 60);
});
test('no MPEG audio at all gives seconds null; a missing file is reported as missing', async () => {
  assert.equal(durationOf(Buffer.alloc(9000, 0x41), 9000), null);
  assert.deepEqual(await probe('https://archive.kpfk.org/x.mp3', async () => new Response('gone', { status: 404 })), { missing: 404 });
  const garbage = await probe('https://archive.kpfk.org/x.mp3', ranged(Buffer.alloc(9000, 0x41), 98763, Buffer.from([0x41])));
  assert.deepEqual(garbage, { bytes: 98763, seconds: null });
});

// A fake server that honours Range over a virtual file: `head` bytes, then silence to `total`.
function ranged(head, total, fill = FRAME) {
  return async (url, opts) => {
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const start = Number(a), end = Math.min(Number(b), total - 1);
    const body = Buffer.alloc(Math.max(0, end - start + 1));
    if (start < head.length) head.copy(body, 0, start, Math.min(head.length, end + 1));
    for (let i = Math.max(start, head.length); i <= end; i++) body[i - start] = fill[(i - head.length) % fill.length];
    return new Response(body, { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${total}` } });
  };
}

test('listener view: a failed recording is hidden, a wrong duration corrected, both recorded', async t => {
  const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-probe-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'fe_catalog_kpfk.json'), 'utf8'));
  const eps = Object.values(catalog.episodes['2kpfk']).flatMap(d => Object.values(d)).filter(e => e.airDate < 1789435100 && e.durationSec > 600);
  const [failed, wrong] = eps;
  const files = new Map();
  for (const g of Object.values(catalog.episodes)) for (const d of Object.values(g)) for (const e of Object.values(d)) files.set(e.mp3Url, (e.durationSec >= 60 ? e.durationSec : 1800) * 16000 + 100);
  files.set(failed.mp3Url, 9800);                              // 0.6 s of audio
  files.set(wrong.mp3Url, (wrong.durationSec + 1800) * 16000); // half an hour longer than the feed says
  const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };
  const service = createService({ profile, dataDir, writeJsonAtomic: write, now: () => 1789435100000, fetchImpl: async (url, opts) => {
    if (url.includes('/mp3/')) return ranged(Buffer.alloc(0), files.get(url))(url, opts);
    return new Response(fs.readFileSync(path.join(dir, path.basename(new URL(url).pathname))), { headers: { 'content-type': 'application/json' } });
  } });
  const before = await service.archive();
  assert.equal(before.filter.failedRecordings.length, 0, 'unknown until checked: shown as the feed says');
  for (let i = 0; i < 4; i++) { await service.archive(); await service.probesIdle(); }
  const view = service.peekArchive();
  const failedId = `kpfk.2kpfk.${failed.id}`, wrongId = `kpfk.2kpfk.${wrong.id}`;
  assert.ok(!view.shows.some(r => r.id === failedId), 'failed recording hidden');
  assert.deepEqual(view.filter.failedRecordings.map(f => f.id), [failedId], 'only the failed one; every other file is a full recording');
  assert.equal(view.shows.find(r => r.id === wrongId).durationSec, wrong.durationSec + 1800);
  assert.deepEqual(view.filter.durationCorrected.find(c => c.id === wrongId), { id: wrongId, show: wrong.altid, dt: wrong.airDate, feed: wrong.durationSec, file: wrong.durationSec + 1800 });
  assert.ok(view.filter.durationCorrected.every(c => Math.abs(c.file - c.feed) > 60), 'only real disagreements are corrected');
  assert.notEqual(view.revision, before.revision);
  // Checked once, ever: a restart reads the saved results instead of the files.
  let reads = 0;
  const again = createService({ profile, dataDir, writeJsonAtomic: write, now: () => 1789435100000, fetchImpl: async (url, opts) => {
    if (url.includes('/mp3/')) { reads++; return ranged(Buffer.alloc(0), files.get(url))(url, opts); }
    return new Response(fs.readFileSync(path.join(dir, path.basename(new URL(url).pathname))), { headers: { 'content-type': 'application/json' } });
  } });
  await again.archive(); await again.probesIdle();
  assert.equal(reads, 0); assert.ok(!again.peekArchive().shows.some(r => r.id === failedId));
});
