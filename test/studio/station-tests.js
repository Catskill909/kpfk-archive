'use strict';

/**
 * Studio: Station & appearance in a real browser (station template, 2026-09-29; redesigned the
 * same day: summary cards, one edit panel per part, a bar for unpublished changes). Real mouse
 * clicks and typing: edit the name, remove a link, see the draft on the cards and the bar,
 * Review & publish, see the listener page change, a bad link refused, phone widths, Undo. Leaves
 * the station as it found it (Undo) — run it against a local copy, never the live station.
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
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  async function click(selector) {
    const r = JSON.parse(await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'null';
      el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`));
    if (!r) throw new Error('no element ' + selector);
    for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await wait(350);
  }
  async function typeInto(selector, text) {
    await click(selector);
    await ev(`document.querySelector(${JSON.stringify(selector)}).select()`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    if (text) await c.send('Input.insertText', { text });
    await wait(150);
  }
  const dialogOpen = () => ev(`document.getElementById('stDialog').open`);
  const listener = async () => JSON.parse(await ev(`fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((t) => JSON.stringify({
    title: (t.match(/<title>([^<]*)/) || [])[1], volunteer: /Volunteer/.test(t) }))`));
  const cards = async () => JSON.parse(await ev(`JSON.stringify({
    name: stNameView.textContent, sub: stSubView.textContent, nameChanged: stNameView.classList.contains('is-changed'), logo: stLogoView.naturalWidth > 0,
    links: [...document.querySelectorAll('#stLinksView .st-row')].map((li) => li.textContent),
    changedRows: [...document.querySelectorAll('#stationSection .st-row.is-changed')].map((li) => li.textContent),
    social: document.querySelectorAll('#stSocialView .st-row').length,
    bar: !document.getElementById('stBar').hidden, barText: stBarText.textContent,
    undo: !document.getElementById('stUndo').hidden,
    sources: [...document.querySelectorAll('#stSourcesView .st-row')].map((li) => li.textContent), words: document.getElementById('stationSection').textContent,
    stats: document.getElementById('main').getClientRects().length > 0 })`));

  // ---- sign in, open the tab
  await size(1280);
  await c.send('Page.navigate', { url: BASE + '/studio' }); await wait(1800);
  if (await ev("!!document.getElementById('loginForm')")) {
    await ev(`(function(){ document.getElementById('password').value = ${JSON.stringify(PASSWORD)}; document.getElementById('loginForm').requestSubmit(); })()`);
    await wait(1800);
    await c.send('Page.navigate', { url: BASE + '/studio' }); await wait(1800);
  }
  await click('[data-studio-tab="discovery"]'); await wait(800);
  console.log('\n1. the summary reads like the site');
  const start = await cards();
  ok('Station card: name, frequency · city and the logo', !!start.name && / · /.test(start.sub) && start.logo, JSON.stringify(start));
  ok('Links card lists the links in use, one row each', start.links.length >= 5 && start.links.some((t) => /^Station website/.test(t)), JSON.stringify(start.links));
  ok('Social card lists the accounts in use', start.social >= 1);
  ok('no bar while nothing has changed; the stats are not on this tab', !start.bar && !start.stats, JSON.stringify(start));
  ok('plain words: no "profile" jargon', !/profile/i.test(start.words));
  ok('Data sources lists every endpoint, marked not editable yet', /Not editable yet/.test(start.words)
    && ['Catalog feed', 'Channels feed', 'Live stream', 'Time zone', 'Allowed hosts'].every((l) => start.sources.some((t) => t.startsWith(l)))
    && start.sources.some((t) => /^Catalog feedhttps:\/\/\S+\.json$/.test(t)), JSON.stringify(start.sources));
  await ev(`document.getElementById('stationSection').scrollIntoView({ block: 'start' })`); await wait(300);
  await shot('1-cards');
  const before = await listener();

  console.log('\n2. edit panels collect a draft');
  await click('[data-edit="station"]');
  ok('Edit opens the Station panel', (await dialogOpen()) && (await ev('stDialogTitle.textContent')) === 'Station');
  await shot('2-station-panel');
  await typeInto('#stDialogBody [data-field="name"]', 'KPFK Browser Test');
  await click('#stDialogOk');
  let now = await cards();
  ok('Done closes it; the card shows the new name, marked as changed', !(await dialogOpen()) && now.name === 'KPFK Browser Test' && now.nameChanged, JSON.stringify(now));
  ok('the bar says 1 change is not yet on the site', now.bar && /^1 change/.test(now.barText), now.barText);
  ok('nothing is published yet', (await listener()).title === before.title);
  if (before.volunteer) {
    await click('[data-edit="links"]');
    await shot('3-links-panel');
    await click('#stDialogBody [aria-label="Remove Volunteer"]');
    await click('#stDialogOk');
    now = await cards();
    ok('removing a link: the card shows it as Removed; the bar counts 2', now.changedRows.some((t) => /Volunteer.*Removed/.test(t)) && /^2 changes/.test(now.barText), JSON.stringify(now));
  }
  await shot('4-draft-bar');

  console.log('\n3. a bad link is refused in the panel');
  await click('[data-edit="links"]');
  await typeInto('#stDialogBody [data-key="donate"]', 'http://insecure.example.org');
  await click('#stDialogOk');
  ok('Done refuses it and says why; the panel stays open', (await dialogOpen()) && /https/.test(await ev('stDialogStatus.textContent')), await ev('stDialogStatus.textContent'));
  await click('#stDialogCancel');
  ok('Cancel leaves the draft as it was', (await cards()).barText === now.barText);

  console.log('\n4. review & publish');
  await click('#stReview'); await wait(700);
  const rev = JSON.parse(await ev(`JSON.stringify({ title: stDialogTitle.textContent, items: [...document.querySelectorAll('#stDialogBody li')].map((li) => li.textContent),
    publish: !stDialogOk.disabled, label: stDialogOk.textContent })`));
  ok('Review lists exactly the changes and offers Publish once checked', rev.title === 'Review & publish' && rev.publish && rev.label === 'Publish'
    && rev.items.length === (before.volunteer ? 2 : 1) && rev.items.some((t) => /Name: .*KPFK Browser Test/.test(t)), JSON.stringify(rev));
  await shot('5-review');
  await click('#stDialogOk'); await wait(900);
  const pub = await cards();
  ok('published: the bar is gone and Undo last publish appears', !pub.bar && pub.undo && /Published/.test(await ev('stStatus.textContent')), JSON.stringify(pub));
  const after = await listener();
  ok('the listener site shows the new name', /^KPFK Browser Test/.test(after.title || ''), after.title);
  if (before.volunteer) ok('and the Volunteer link has left its menu', after.volunteer === false);

  console.log('\n5. phone width');
  for (const w of [390, 360]) {
    await size(w); await wait(400);
    const fit = JSON.parse(await ev(`(() => { const s = document.getElementById('stationSection'), vw = document.documentElement.clientWidth;
      const out = [...s.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
        .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
      return JSON.stringify({ out: out.slice(0, 4), sideways: document.documentElement.scrollWidth > vw + 1 }); })()`));
    ok(`${w}px — the cards fit, nothing sideways`, fit.out.length === 0 && !fit.sideways, JSON.stringify(fit));
    await click('[data-edit="links"]');
    const dfit = JSON.parse(await ev(`(() => { const d = document.getElementById('stDialog').getBoundingClientRect(), vw = document.documentElement.clientWidth;
      return JSON.stringify({ left: Math.round(d.left), right: Math.round(d.right), vw, sideways: stDialog.scrollWidth > stDialog.clientWidth + 1 }); })()`));
    ok(`${w}px — the edit panel fits the screen`, dfit.left >= 0 && dfit.right <= dfit.vw && !dfit.sideways, JSON.stringify(dfit));
    if (w === 390) await shot('6-phone-panel');
    await click('#stDialogCancel');
    if (w === 390) { await ev(`document.getElementById('stationSection').scrollIntoView({ block: 'start' })`); await wait(300); await shot('7-phone-cards'); }
  }
  await size(1280);

  console.log('\n6. undo last publish');
  await click('#stUndo'); await wait(400);
  await click('dialog.studio-dialog [data-answer="yes"]'); await wait(900);
  const undone = await listener();
  ok('Undo puts the listener site back', undone.title === before.title && undone.volunteer === before.volunteer, JSON.stringify(undone));
  ok('and the cards back to the station as it was', (await cards()).name === start.name);

  console.log(failures ? `\n${failures} failure(s)` : '\nOK — all Station & appearance checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
