'use strict';

/**
 * Studio: Station & appearance (station template slice 1, 2026-09-29) in a real browser.
 * Real mouse clicks and key presses: open the tab, edit the name and take a link out, Preview,
 * Apply through the in-app confirm dialog, see the listener page change, Undo, and check the
 * form fits a phone. Leaves the station as it found it (Undo), so it is safe to run against a
 * local copy; do not run it against the live station.
 *
 *   CDP_PORT=9225 BASE=http://localhost:8091 STUDIO_PASSWORD=… node --experimental-websocket station-tests.js
 * SHOTS=<dir> also saves screenshots.
 */
const fs = require('fs');
const path = require('path');
const cdp = require('../live-stream/cdp.js');

const PORT = Number(process.env.CDP_PORT || 9225);
const BASE = process.env.BASE || 'http://localhost:8080';
const PASSWORD = process.env.STUDIO_PASSWORD || 'local-dev-password';
const SHOTS = process.env.SHOTS || '';
let failures = 0;
function ok(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond && detail !== undefined) console.log(`       ${detail}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const c = await cdp.connect(PORT);
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const ev = async (e) => (await c.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value;
  const size = (w, h = 900) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  const shot = async (name) => {
    if (!SHOTS) return;
    const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  async function click(selector) {
    const r = JSON.parse(await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'null';
      el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`));
    if (!r) throw new Error('no element ' + selector);
    for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await wait(300);
  }
  async function typeInto(selector, text) {
    await click(selector);
    await ev(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.select(); return true; })()`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    if (text) await c.send('Input.insertText', { text });
    await wait(150);
  }
  const listenerTitle = async () => ev(`fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((t) => (t.match(/<title>([^<]*)/) || [])[1])`);
  const listenerHasVolunteer = async () => ev(`fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((t) => /Volunteer/.test(t))`);

  // ---- sign in, open the tab
  await size(1280);
  await c.send('Page.navigate', { url: BASE + '/studio' }); await wait(1800);
  if (await ev("!!document.getElementById('loginForm')")) {
    await ev(`(function(){ document.getElementById('password').value = ${JSON.stringify(PASSWORD)}; document.getElementById('loginForm').requestSubmit(); })()`);
    await wait(1800);
    await c.send('Page.navigate', { url: BASE + '/studio' }); await wait(1800);
  }
  console.log('\n1. the Station & appearance form');
  await click('[data-studio-tab="discovery"]'); await wait(800);
  const form = JSON.parse(await ev(`JSON.stringify({ shown: document.getElementById('stationSection').getClientRects().length > 0,
    name: stName.value, frequency: stFrequency.value, city: stCity.value,
    links: document.querySelectorAll('#stLinks input').length, social: document.querySelectorAll('#stSocial input').length,
    website: (document.getElementById('st-links-website') || {}).value, logo: document.getElementById('stLogo').naturalWidth > 0,
    apply: document.getElementById('stApply').disabled, stats: document.getElementById('main').getClientRects().length > 0 })`));
  ok('the form is on screen with the station\'s values', form.shown && !!form.name && !!form.frequency && !!form.city && /^https:/.test(form.website || ''), JSON.stringify(form));
  ok('every link and social account has a field', form.links >= 13 && form.social === 6, JSON.stringify(form));
  ok('the current logo is shown', form.logo);
  ok('Apply starts locked (preview first)', form.apply === true);
  ok('the stats are not on this tab', form.stats === false);
  await shot('1-form');
  const titleBefore = await listenerTitle();
  const hadVolunteer = await listenerHasVolunteer();

  // ---- edit, preview, apply
  console.log('\n2. edit → preview → apply');
  await typeInto('#stName', 'KPFK Browser Test');
  await typeInto('#st-links-volunteer', '');
  await click('#stPreview'); await wait(700);
  const pv = JSON.parse(await ev(`JSON.stringify({ changes: [...document.querySelectorAll('#stChanges li')].map((li) => li.textContent),
    apply: document.getElementById('stApply').disabled, status: document.getElementById('stStatus').textContent })`));
  ok('Preview lists exactly the two changes', pv.changes.length === 2 && pv.changes.some((t) => /Name: .*KPFK Browser Test/.test(t))
    && pv.changes.some((t) => /Volunteer link: removed/.test(t)) === hadVolunteer, JSON.stringify(pv));
  ok('and unlocks Apply', pv.apply === false, JSON.stringify(pv));
  ok('the listener site has not changed yet', (await listenerTitle()) === titleBefore);
  await shot('2-preview');
  await click('#stApply'); await wait(400);
  const dlg = await ev(`(() => { const d = document.querySelector('dialog.studio-dialog'); return d && d.open ? d.querySelector('#studioDialogTitle').textContent : null; })()`);
  ok('Apply asks first, in the studio\'s own dialog (no browser pop-up)', /Apply to the listener site/.test(dlg || ''), String(dlg));
  await click('dialog.studio-dialog [data-answer="yes"]'); await wait(900);
  const done = JSON.parse(await ev(`JSON.stringify({ status: document.getElementById('stStatus').textContent, when: document.getElementById('stWhen').textContent,
    undo: document.getElementById('stUndo').disabled })`));
  ok('applied, and the form says so', /Applied/.test(done.status) && /Edited here/.test(done.when) && done.undo === false, JSON.stringify(done));
  ok('the listener site shows the new name', /^KPFK Browser Test/.test(await listenerTitle() || ''), await listenerTitle());
  if (hadVolunteer) ok('and the Volunteer link is gone from its menu', (await listenerHasVolunteer()) === false);

  // ---- phone width: the form fits
  console.log('\n3. phone width');
  for (const w of [390, 360]) {
    await size(w); await wait(400);
    const fit = JSON.parse(await ev(`(() => { const s = document.getElementById('stationSection'), b = s.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      const out = [...s.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
        .map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + String(el.className).split(' ')[0]));
      return JSON.stringify({ out: out.slice(0, 4), sideways: document.documentElement.scrollWidth > vw + 1 }); })()`));
    ok(`${w}px — nothing in the form runs off the screen`, fit.out.length === 0 && !fit.sideways, JSON.stringify(fit));
    if (w === 390) { await ev(`document.getElementById('stationSection').scrollIntoView({ block: 'start' })`); await wait(300); await shot('3-phone'); }
  }
  await size(1280);

  // ---- undo
  console.log('\n4. undo');
  await click('#stUndo'); await wait(400);
  await click('dialog.studio-dialog [data-answer="yes"]'); await wait(900);
  ok('Undo puts the listener site back', (await listenerTitle()) === titleBefore, await listenerTitle());
  if (hadVolunteer) ok('with the Volunteer link back in the menu', (await listenerHasVolunteer()) === true);
  ok('and the form back to the station\'s values', (await ev('stName.value')) === form.name);

  console.log(failures ? `\n${failures} failure(s)` : '\nOK — all Station & appearance checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
