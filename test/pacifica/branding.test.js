'use strict';
// This app is a copy of wbai-archive. The station rename replaced names and
// references but left WBAI's image files in place under their old filenames —
// and code kept pointing at them: the lock-screen artwork, the studio favicon,
// the old manifest. Nothing looked wrong in the listing, so nothing caught it
// until a live audit (2026-09-15). Filenames prove nothing here, so compare bytes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');

// SHA-256 of every image asset tracked in wbai-archive at f2ea8e8 (test/, docs/
// and desktop/ excluded — they are not served by this app).
const WBAI_ASSETS = new Map([
  ['54f6a9eb750fe07d1923bd0d56e010b80b1d0fe7d531c44a20d7f054e5071350', 'public/assets/app_icon_1024.png'],
  ['77c46951972c01253a5a32deaec4457c06bddeb27a235c0b16509f38a29b9d0b', 'public/assets/header.png'],
  ['3a21a8dfa3c2ec015237ec7622396a3c15228ba309122a5ad710bc46eede2f14', 'public/assets/icon-192.png'],
  ['8bf614523fea6565be89e59017c531effbcbc5304d4c0648a6430945e94f1e1e', 'public/assets/icon-256.png'],
  ['f48c8eb749eae63af0757d723060ad445757c4fc1b36063f9bcab0443b10a4e5', 'public/assets/icon-512.png'],
  ['5f43eb5f18eb9cc30b2ea5660fd32e2e9bf3c6c6f3d352b3735178f6e2c2d520', 'public/assets/icon-maskable-192.png'],
  ['19bd1c4cd98f42ac6603ff805626f2f25240331da32dcf873c7c98651ed36669', 'public/assets/icon-maskable-512.png'],
]);
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
function servedFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...servedFiles(full)); else out.push(full);
  }
  return out;
}

test('the fingerprint method recognises a real WBAI asset from this repo\'s history', t => {
  const git = spawnSync('git', ['show', 'f2ea8e8:public/assets/icon-512.png'], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  if (git.status !== 0) return t.skip('git history unavailable (not a clone)');
  assert.equal(WBAI_ASSETS.get(sha(git.stdout)), 'public/assets/icon-512.png');
});

test('no file this app serves is byte-identical to a WBAI asset', () => {
  const offenders = ['public', 'admin'].flatMap(d => servedFiles(path.join(root, d)))
    .filter(f => WBAI_ASSETS.has(sha(fs.readFileSync(f))))
    .map(f => `${path.relative(root, f)} is WBAI's ${WBAI_ASSETS.get(sha(fs.readFileSync(f)))}`);
  assert.deepEqual(offenders, []);
});

test('share and home-screen assets are raster, and exist', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
  for (const key of ['share', 'touchIcon']) {
    assert.match(profile.assets[key], /\.png$/, `assets.${key} must be PNG — crawlers and iOS ignore SVG`);
    assert.ok(fs.existsSync(path.join(root, 'public', profile.assets[key])), `${profile.assets[key]} exists`);
  }
});
