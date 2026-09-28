'use strict';
// Design rule 1 (docs/DESIGN-SYSTEM.md, Paul 2026-09-28): while something plays, the player
// bar stays visible and clickable under every popup. The class of bug: a popup (or its dark
// backdrop) added or changed without the player-frame rule covers the bar. The 2026-09-28
// audit found 9 of 11 popups doing it. This checks every popup on both sides is covered, so
// a new one fails here instead of in a listener's hand. The browser proof is
// tools/popup-audit/audit.cjs; this is the offline guard.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('public/styles.css'), html = read('public/index.html');
const start = css.indexOf('PLAYER FRAME: the bar is never covered');
const frame = start < 0 ? '' : css.slice(start);

test('the player-frame rule exists and lifts the bar above every overlay layer', () => {
  assert.ok(frame, 'player-frame block present in styles.css');
  const barZ = Number((/body\.has-player \.player-bar\{\s*z-index:(\d+)/.exec(frame) || [])[1]);
  const layers = [...css.slice(0, start).matchAll(/z-index\s*:\s*(\d+)/g)].map(m => Number(m[1]));
  assert.ok(barZ > Math.max(...layers), `bar z-index ${barZ} above every other layer (max ${Math.max(...layers)})`);
});

test('every popup backdrop on the page stops at the player bar', () => {
  const scrims = [...new Set([...html.matchAll(/class="([a-z-]+-scrim)\b/g)].map(m => m[1]))];
  assert.ok(scrims.length >= 8, 'the page still has its backdrops: ' + scrims.join(', '));
  const rule = (/body\.has-player :is\(([^)]*)\)\{ bottom:var\(--player-h/.exec(frame) || [])[1] || '';
  for (const s of scrims) assert.ok(rule.includes('.' + s), `${s} stops at the bar`);
});

test('every popup on the page ends above the bar on phones and desktop', () => {
  const popups = [...html.matchAll(/<(?:div|aside)\s+class="([a-z-]+)[^"]*"[^>]*role="(?:alert)?dialog"/g)].map(m => m[1]);
  assert.ok(popups.length >= 7, 'the page still has its popups: ' + popups.join(', '));
  const phone = frame.slice(frame.indexOf('@media (max-width:560px)'));
  const desktop = frame.slice(frame.indexOf('@media (min-width:561px)'), frame.indexOf('@media (max-width:560px)'));
  // Full-screen and drawer popups are sized to the space above the bar at every width.
  const everyWidth = frame.slice(0, frame.indexOf('@media (min-width:561px)'));
  for (const p of popups) {
    if (everyWidth.includes(`body.has-player .${p}{`)) continue;
    assert.ok(desktop.includes('.' + p), `${p} is kept above the bar on desktop`);
    // live-choice and lp-alert are small centred questions at every width; no phone sheet.
    if (!['live-choice', 'lp-alert'].includes(p)) assert.ok(phone.includes('.' + p), `${p} ends above the bar on phones`);
  }
  assert.ok(everyWidth.includes('body.has-player .menu-panel{'), 'the side menu stops above the bar');
});

test('Discovery: its popups never use the blocking modal, and stop above the bar', () => {
  const app = read('plugins/discovery/public/app.js'), dcss = read('plugins/discovery/public/app.css');
  assert.doesNotMatch(app, /\.showModal\(/, 'a modal dialog sits above the player bar and blocks it');
  assert.match(dcss, /\.rv-dialog\[open\]\{position:fixed;inset:0 0 var\(--player-h,0px\)/);
  assert.match(dcss, /body\.detail-open::before\{[^}]*inset:0 0 var\(--player-h,0px\)/);
});
