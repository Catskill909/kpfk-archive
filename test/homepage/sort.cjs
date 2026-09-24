// Homepage: gallery = one card per show, and the sort menu (A–Z · Recently aired ·
// Category). Live browser check against a running app (default :8081) with Chrome
// remote debugging on CDP_PORT (default 9231, dedicated temporary profile).
// Ace's review 2026-09-24: the gallery was an episode feed read as a directory.
const { connect, sleep } = require('../live-stream/cdp.js');
const fs = require('fs');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  const errors = []; p.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); });
  let n = 0; const check = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (v) n++; else process.exitCode = 1; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const shot = async f => { if (process.env.SHOTS) fs.writeFileSync(process.env.SHOTS + '/' + f, Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
  const size = (w, h) => p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 700 ? 2 : 1, mobile: w < 700 });
  const titles = `return [...document.querySelectorAll('#rows .card-title, #rows .show-title')].map(e=>e.textContent);`;

  await size(1280, 900);
  await p.send('Page.navigate', { url: base + '/' });
  await p.eval(`try{localStorage.clear()}catch(e){};return 1;`);
  await p.send('Page.reload', {});
  await until(`return document.querySelectorAll('#rows .card-wrap').length > 0;`, 30000);
  // Expected numbers straight from the same data the page renders.
  const data = await p.eval(`return fetch('/api/archive').then(r=>r.json()).then(a=>({shows:new Set(a.shows.map(r=>r.sho)).size,episodes:a.shows.length}));`);
  console.log('  data:', JSON.stringify(data));

  // List view first: it must still repeat shows, which proves the probe below can see repeats.
  await p.eval(`document.querySelector('.view-btn[data-view=list]').click();return 1;`);
  await until(`return document.querySelectorAll('#rows .row.body').length > 0;`);
  check('list view is still the full table of recordings', await p.eval(`return /episodes found/.test(document.getElementById('resultCount').textContent);`));
  check('list view does repeat shows (the uniqueness probe can see repeats)', await p.eval(`const t=${titles.replace('return ', '')};return new Set(t).size < t.length;`));
  await p.eval(`document.querySelector('.view-btn[data-view=grid]').click();return 1;`);
  await until(`return document.querySelectorAll('#rows .card-wrap').length > 0;`);

  const count = await p.eval(`return document.getElementById('resultCount').textContent;`);
  check('gallery count reads shows and episodes from the data', count === `${data.shows} shows · ${data.episodes} episodes`);
  check('each show appears once in the gallery', await p.eval(`const t=${titles.replace('return ', '')};return new Set(t).size === t.length;`));
  check('A–Z is the default order', await p.eval(`const t=${titles.replace('return ', '')};return t.every((x,i)=>i===0||t[i-1].localeCompare(x)<=0);`));
  check('sort trigger reads A–Z', await p.eval(`return document.getElementById('sortTriggerValue').textContent==='A–Z'&&document.getElementById('sortTrigger').getAttribute('aria-label')==='Sort: A–Z';`));
  await shot('home-az-1280.png');

  // Recently aired
  await p.click('#sortTrigger');
  check('sort menu opens with three choices', await until(`return !document.getElementById('sortMenu').hidden&&document.querySelectorAll('#sortMenu [data-sortpick]').length===3;`, 3000));
  await p.eval(`document.querySelector('[data-sortpick=recent]').click();return 1;`);
  check('Recently aired puts the newest recording first', await until(`return document.getElementById('sortTriggerValue').textContent==='Recently aired';`, 3000)
    && await p.eval(`return fetch('/api/archive').then(r=>r.json()).then(a=>{const newest=a.shows.reduce((m,r)=>r.dt>m.dt?r:m);return document.querySelector('#rows .card-title').textContent===newest.title;});`));
  check('the choice is in the address', await p.eval(`return new URLSearchParams(location.search).get('sort')==='recent';`));
  await p.send('Page.reload', {});
  check('reload keeps the choice', await until(`return document.getElementById('sortTriggerValue').textContent==='Recently aired'&&document.querySelectorAll('#rows .card-wrap').length>0;`, 30000));

  // Category, via the keyboard
  await p.eval(`document.getElementById('sortTrigger').focus();return 1;`);
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  check('ArrowDown opens the menu on the current choice', await until(`return !document.getElementById('sortMenu').hidden&&document.activeElement.dataset.sortpick==='recent';`, 3000));
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  // Class: both dropdowns share the pattern — the opening key must not also move focus.
  await p.eval(`document.getElementById('catTrigger').focus();return 1;`);
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  check('category ArrowDown also lands on the current choice', await until(`return !document.getElementById('catMenu').hidden&&document.activeElement.dataset.cat==='all';`, 3000));
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`return document.getElementById('catMenu').hidden;`, 3000);
  await p.eval(`document.getElementById('sortTrigger').focus();return 1;`);
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await until(`return !document.getElementById('sortMenu').hidden;`, 3000);
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape closes it and returns focus', await until(`return document.getElementById('sortMenu').hidden&&document.activeElement.id==='sortTrigger';`, 3000));
  await p.click('#sortTrigger'); await p.eval(`document.querySelector('[data-sortpick=category]').click();return 1;`);
  check('Category sort adds category headings', await until(`return document.querySelectorAll('#rows .grid-heading').length>1;`, 3000));
  check('headings group their cards (no category repeats)', await p.eval(`const h=[...document.querySelectorAll('#rows .grid-heading')].map(e=>e.textContent);return new Set(h).size===h.length;`));
  await shot('home-category-1280.png');

  // Phone
  await size(390, 844); await sleep(400);
  check('phone: no sideways scroll', await p.eval(`return document.documentElement.scrollWidth<=innerWidth;`));
  check('phone: sort is a compact icon button beside the search', await p.eval(`const s=document.getElementById('sortTrigger').getBoundingClientRect(),q=document.querySelector('.search-field').getBoundingClientRect();return s.width<=48&&Math.abs(s.top-q.top)<4&&q.width>=150;`));
  await shot('home-phone-390.png');
  await p.eval(`try{localStorage.clear()}catch(e){};return 1;`);
  check('no runtime exceptions', errors.length === 0); if (errors.length) console.log(errors);
  console.log(n + ' checks passed'); p.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
