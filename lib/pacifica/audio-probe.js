'use strict';

// Real length of a published mp3, from its first bytes (2026-09-26). The feed's durationSec is
// sometimes 0 or wrong (Law and Disorder 3 Aug: 0 s for a 57 MB hour), and a station outage
// can publish a recording of a few seconds where an hour was scheduled (Democracy Now 10 Aug:
// 99 KB). One small ranged read per file gives the total size (Content-Range) and the MPEG
// header; results are kept on disk so each file is read once, ever.
const fs = require('fs');
const path = require('path');

const KBPS = {
  1: { 1: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 1: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };
const READ = 16384;

function frameAt(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const version = [2.5, null, 2, 1][(buf[i + 1] >> 3) & 3], layer = [null, 3, 2, 1][(buf[i + 1] >> 1) & 3];
  const bIdx = buf[i + 2] >> 4, rIdx = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
  if (!version || !layer || bIdx === 0 || bIdx === 15 || rIdx === 3) return null;
  const kbps = KBPS[version === 1 ? 1 : 2][layer][bIdx - 1], rate = RATES[version][rIdx];
  const samples = layer === 1 ? 384 : layer === 2 || version === 1 ? 1152 : 576;
  const length = layer === 1 ? (Math.floor(12000 * kbps / rate) + pad) * 4 : Math.floor(samples / 8 * 1000 * kbps / rate) + pad;
  return { version, layer, kbps, rate, samples, length, mono: (buf[i + 3] >> 6) === 3 };
}
function id3Size(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  return 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f)) + (buf[5] & 0x10 ? 10 : 0);
}
// buf starts at the audio (after any ID3 tag); total is the audio's byte count.
function durationOf(buf, audioBytes) {
  for (let i = 0; i + 4 <= buf.length; i++) {
    const f = frameAt(buf, i);
    if (!f) continue;
    // A real frame starts a run of frames of the same format. One matching neighbour is not
    // enough: a recording cut mid-stream (Law and Disorder 3 Aug) had a false header at byte 243
    // followed by one chance match, which read as 24 kbps and 5.3 hours instead of 1 hour.
    let ok = true;
    for (let j = i + f.length, k = 0; k < 3 && j + 4 <= buf.length; k++) {
      const g = frameAt(buf, j);
      if (!g || g.version !== f.version || g.layer !== f.layer || g.rate !== f.rate) { ok = false; break; }
      j += g.length;
    }
    if (!ok) continue;
    const side = f.version === 1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17);
    const x = i + 4 + side, tag = buf.toString('latin1', x, x + 4);
    if ((tag === 'Xing' || tag === 'Info') && buf.length >= x + 12 && (buf.readUInt32BE(x + 4) & 1)) {
      return { seconds: buf.readUInt32BE(x + 8) * f.samples / f.rate, kbps: f.kbps, method: 'xing' };
    }
    if (buf.toString('latin1', i + 36, i + 40) === 'VBRI' && buf.length >= i + 36 + 18) {
      return { seconds: buf.readUInt32BE(i + 36 + 14) * f.samples / f.rate, kbps: f.kbps, method: 'vbri' };
    }
    return { seconds: (audioBytes - i) * 8 / (f.kbps * 1000), kbps: f.kbps, method: 'cbr' };
  }
  return null;
}
async function readRange(url, start, fetchImpl) {
  const r = await fetchImpl(url, { headers: { Range: `bytes=${start}-${start + READ - 1}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (r.status === 404 || r.status === 410) return { missing: r.status };
  if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const total = r.status === 206 ? Number((/\/(\d+)$/.exec(r.headers.get('content-range') || '') || [])[1])
    : Number(r.headers.get('content-length'));
  // A server that ignores Range sends the whole file: keep only the first READ bytes.
  const chunks = []; let got = 0;
  for await (const chunk of r.body) { chunks.push(chunk); got += chunk.length; if (got >= READ) break; }
  if (r.body.cancel) r.body.cancel().catch(() => {});
  return { total, buf: Buffer.concat(chunks).subarray(0, READ) };
}
// → { bytes, seconds, kbps, method } | { missing: 404 } | { bytes, seconds: null } (no MPEG frame).
// Throws on transport errors, which are not results and are retried later.
async function probe(url, fetchImpl) {
  const first = await readRange(url, 0, fetchImpl);
  if (first.missing) return { missing: first.missing };
  if (!Number.isSafeInteger(first.total) || first.total < 0) throw new Error('no file size');
  const skip = id3Size(first.buf);
  const audio = skip === 0 ? first.buf : skip + 4 <= first.buf.length ? first.buf.subarray(skip) : (await readRange(url, skip, fetchImpl)).buf || Buffer.alloc(0);
  const d = durationOf(audio, Math.max(0, first.total - skip));
  return d ? { bytes: first.total, seconds: Math.round(d.seconds), kbps: d.kbps, method: d.method } : { bytes: first.total, seconds: null };
}

// Store: url → result, on disk, limited to URLs still in the catalog. `run(urls)` reads the
// ones not yet known, two at a time, in the background; `get(url)` is synchronous.
function createProbeStore({ dataDir, fetchImpl, origins, writeJsonAtomic }) {
  const file = dataDir && path.join(dataDir, 'pacifica', 'audio-probes.json');
  let known = new Map();
  if (file && fs.existsSync(file)) {
    try { known = new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).results || {})); }
    catch (e) { console.warn(`[pacifica] audio probe cache unreadable (${e.message}); probing again`); }
  }
  let running = null;
  const allowed = url => { try { const u = new URL(url); return u.protocol === 'https:' && origins.includes(u.origin); } catch { return false; } };
  function run(urls, limit = 400) {
    if (running) return running;
    const todo = urls.filter(u => !known.has(u) && allowed(u)).slice(0, limit);
    if (!todo.length) return Promise.resolve(0);
    running = (async () => {
      let done = 0, failures = 0, first = '';
      const worker = async () => {
        for (let u = todo.shift(); u; u = todo.shift()) {
          // Caught: a timeout or network error is not a fact about the file; it is left
          // unknown (shown as the feed describes it) and retried on the next run.
          try { known.set(u, await probe(u, fetchImpl)); done++; }
          catch (e) { failures++; first = first || `${u}: ${e.message}`; }
        }
      };
      await Promise.all([worker(), worker()]);
      if (failures) console.warn(`[pacifica] audio check: ${failures} file(s) not readable this run, will retry (first: ${first})`);
      const live = new Set(urls);
      for (const u of known.keys()) if (!live.has(u)) known.delete(u);
      if (file && done) writeJsonAtomic(file, { schemaVersion: 1, results: Object.fromEntries(known) });
      return done;
    })().finally(() => { running = null; });
    return running;
  }
  return { get: url => known.get(url), run, idle: () => running || Promise.resolve(0), size: () => known.size };
}

module.exports = { probe, durationOf, id3Size, frameAt, createProbeStore };
