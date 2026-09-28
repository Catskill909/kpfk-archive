// Popup audit (integration step 2, docs/DESIGN-SYSTEM.md): open every popup at phone
// (390 px) and desktop (1280 px) width with an episode playing, screenshot it, and measure
//   player      is the player bar on screen and clickable (elementFromPoint at its centre)
//   emptyRight  width between the card's right edge and its rightmost content
//   wideButtons buttons 120 px+ and at least 1.8x wider than their label
// Needs: the app running with Discovery on (AUDIT_URL, default http://127.0.0.1:8091) and
// Chrome started with --remote-debugging-port=9333 --autoplay-policy=no-user-gesture-required.
// Run: node --experimental-websocket tools/popup-audit/audit.cjs
// Writes <AUDIT_OUT>/<popup>-<phone|desktop>.png and results.json (default: a temp folder).
const fs = require('fs'), path = require('path'), os = require('os');
const { connect } = require('./cdp.cjs');
const OUT = process.env.AUDIT_OUT || path.join(os.tmpdir(), 'popup-audit'), O = process.env.AUDIT_URL || 'http://127.0.0.1:8091';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickText = (sel, re) => `const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>${re}.test(e.textContent)&&e.offsetParent);if(!el)return 'missing';el.click();return 'ok';`;
// Start an episode from the first show's sheet, wait for the bar, close the sheet.
const MAIN_PLAY = `return (async()=>{document.querySelector('#rows .row:not(.head), #rows [data-id], #rows article, #rows li')?.click();await new Promise(r=>setTimeout(r,1200));const p=document.querySelector('#showSheet .sheet-play');if(!p)return 'no play';p.click();await new Promise(r=>setTimeout(r,2500));document.getElementById('sheetClose').click();await new Promise(r=>setTimeout(r,800));return document.getElementById('playerBar').hidden?'bar hidden':'playing'})()`;
const DISC_PLAY = `return (async()=>{const s=document.querySelector('.rv-showcard, .rv-showlink');if(!s)return 'no show';s.click();await new Promise(r=>setTimeout(r,1200));const p=[...document.querySelectorAll('#detail button')].find(b=>/play latest/i.test(b.textContent));if(!p)return 'no play';p.click();await new Promise(r=>setTimeout(r,2500));document.getElementById('close').click();await new Promise(r=>setTimeout(r,800));return document.getElementById('player').hidden?'bar hidden':'playing'})()`;

// popup: css selector of the open popup's box. open: steps (page JS) to reach it.
const CASES = [
  { name: 'main-show-sheet', url: O + '/', box: '#showSheet', open: [MAIN_PLAY, `document.querySelector('#rows .row:not(.head), #rows [data-id], #rows article, #rows li')?.click();return 'ok'`] },
  { name: 'main-past-episodes', url: O + '/', box: '#showSheet', open: [MAIN_PLAY, `document.querySelector('#rows .row:not(.head), #rows [data-id], #rows article, #rows li')?.click();return 'ok'`, clickText('#showSheet button', '/past episodes|episodes/i')] },
  { name: 'main-schedule', url: O + '/', box: '#schedModal', open: [MAIN_PLAY, `document.getElementById('scheduleBtn').click();return 'ok'`] },
  { name: 'main-live-player', url: O + '/', box: '#livePlayer', open: [MAIN_PLAY, `document.getElementById('onAirBtn').click();return 'ok'`] },
  { name: 'main-live-info', url: O + '/', box: '#lpInfo', open: [MAIN_PLAY, `document.getElementById('onAirBtn').click();return 'ok'`, `const b=document.getElementById('lpInfoBtn');if(b.disabled)return 'disabled';b.click();return 'ok'`] },
  { name: 'main-menu', url: O + '/', box: '#menuPanel', open: [MAIN_PLAY, `document.getElementById('menuBtn').click();return 'ok'`] },
  { name: 'main-donate', url: O + '/', box: '#donateModal', open: [MAIN_PLAY, `document.getElementById('donateBtn').click();return 'ok'`] },
  { name: 'main-lightbox', url: O + '/', box: '#artLightbox', open: [MAIN_PLAY, `document.querySelector('#rows .row:not(.head), #rows [data-id], #rows article, #rows li')?.click();return 'ok'`, `const a=document.querySelector('#showSheet .sheet-art');if(!a)return 'missing';a.click();return 'ok'`] },
  { name: 'discover-show', url: O + '/discover', box: '#detail', open: [DISC_PLAY, `const b=document.querySelector('.rv-showcard, .rv-showlink');if(!b)return 'missing';b.click();return 'ok'`] },
  { name: 'discover-episode', url: O + '/discover', box: '#detail', open: [DISC_PLAY, `const s=document.querySelector('.rv-showcard, .rv-showlink');s.click();return 'ok'`, `const e=document.querySelector('#detail .rv-episode button:not([aria-label^="Play"]), #detail .rv-episode a, #detail .rv-episode');if(!e)return 'missing';e.click();return 'ok'`] },
  { name: 'discover-along', url: O + '/discover', box: '#along', open: [DISC_PLAY, `const t=document.getElementById('alongToggle');if(!t||t.hidden)return 'no toggle';t.click();return 'ok'`] },
];

const MEASURE = box => `
  const vw=innerWidth,vh=innerHeight,box=document.querySelector(${JSON.stringify(box)});
  const vis=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'?r:null};
  const r=vis(box);
  const player=document.querySelector('#playerBar:not([hidden]), #player:not([hidden])'),pr=vis(player);
  let playerState='no player bar shown';
  if(pr){const x=pr.left+pr.width/2,y=pr.top+pr.height/2,hit=document.elementFromPoint(x,y);
    playerState=(pr.bottom>vh+1||pr.top>=vh)?'off screen':(hit&&player.contains(hit))?'visible and clickable':'covered by '+(hit?(hit.id||hit.className||hit.tagName):'nothing')}
  // Popups that show an episode must keep a visible Play/Pause of their own (2026-09-28:
  // hiding the sheet's player copy also hid the sheet's Pause).
  // Tappable = drawn AND the button itself is what a tap at its centre reaches.
  const tappable=b=>{const q=vis(b);if(!q)return false;const hit=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);return !!hit&&b.contains(hit)};
  const play=box&&[...box.querySelectorAll('.sheet-play, .rv-detailplay')].find(tappable);
  const out={playControl:box&&box.querySelector('.sheet-play, .rv-detailplay')?(play?'tappable':'HIDDEN OR COVERED'):'n/a',open:!!r,box:r&&{w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)},viewport:[vw,vh],player:playerState};
  if(r){
    // Buttons at least 1.8x wider than their text and 120px+ wide.
    out.wideButtons=[...box.querySelectorAll('button,a.btn,[role=button]')].map(b=>{const br=vis(b);if(!br)return null;const range=document.createRange();range.selectNodeContents(b);const tw=range.getBoundingClientRect().width;return {label:(b.textContent||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,30),w:Math.round(br.width),text:Math.round(tw),h:Math.round(br.height)}}).filter(b=>b&&b.w>=120&&b.text>0&&b.w>b.text*1.8);
    // Empty right: rightmost visible text/content edge vs the card's inner right edge.
    let right=r.left;const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){if(!n.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(n);for(const q of rg.getClientRects())if(q.width&&q.bottom>r.top&&q.top<r.bottom)right=Math.max(right,q.right)}
    for(const im of box.querySelectorAll('img,button,input,select,iframe')){const q=vis(im);if(q&&q.bottom>r.top&&q.top<r.bottom)right=Math.max(right,q.right)}
    out.emptyRight=Math.round(r.right-right);out.emptyRightPct=Math.round((r.right-right)/r.width*100);
    // How many of the card's direct content rows are full-width stacked blocks.
    out.scrolls=[...box.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+2}).map(e=>e.id||e.className.toString().split(' ')[0]).slice(0,4);
  }
  return out;`;

// Keyboard: real Tab presses (DevTools input events) from inside the open popup. Passes when
// focus reaches the player bar and then comes back into the popup without wandering
// anywhere else (2026-09-28: every popup trapped Tab inside itself, so keyboard users could
// not reach the player while one was open).
async function keyboardProbe(c, box) {
  let sawBar = false, sawBack = false; const strays = [];
  for (let i = 0; i < 40 && !sawBack; i++) {
    for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const where = await c.eval(`const a=document.activeElement,b=document.querySelector(${JSON.stringify(box)}),p=document.querySelector('#playerBar:not([hidden]), #player:not([hidden])');return a&&p&&p.contains(a)?'bar':(a&&b&&b.contains(a)?'popup':(a?(a.id||String(a.className).split(' ')[0]||a.tagName):'none'))`);
    if (where === 'bar') sawBar = true; else if (where === 'popup') { if (sawBar) sawBack = true; } else strays.push(where);
  }
  return sawBar && sawBack && !strays.length ? 'reaches the bar and returns' : `bar:${sawBar} back:${sawBack}${strays.length ? ' strays:' + [...new Set(strays)].slice(0, 3).join(',') : ''}`;
}

(async () => {
  const c = await connect(9333);
  await c.send('Page.enable'); await c.send('Runtime.enable');
  const results = [];
  for (const [label, w, h, mobile] of [['phone', 390, 844, true], ['desktop', 1280, 800, false]]) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    for (const k of CASES.filter(k => !process.env.AUDIT_ONLY || process.env.AUDIT_ONLY.split(',').includes(k.name))) {
      // Blank page first: the site reopens whatever the saved history entry says was open
      // (a reload with the live player open reopens it, by design), which leaked one
      // case's popup into the next when the same address was reloaded.
      await c.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await c.send('Page.navigate', { url: k.url }); await sleep(3500);
      const steps = [];
      // A step that never settles is reported as 'timeout' rather than hanging the whole run.
      const timed = p => Promise.race([p, sleep(15000).then(() => 'timeout')]);
      for (const s of k.open) { try { steps.push(await timed(c.eval(s))); } catch (e) { steps.push('threw: ' + e.message.slice(0, 80)); } await sleep(1500); }
      let m; try { m = await Promise.race([c.eval(MEASURE(k.box)), sleep(15000).then(() => ({ error: 'measure timeout' }))]); } catch (e) { m = { error: e.message.slice(0, 120) }; }
      if (m.open) { try { m.keyboard = await Promise.race([keyboardProbe(c, k.box), sleep(30000).then(() => 'timeout')]); } catch (e) { m.keyboard = 'threw: ' + e.message.slice(0, 60); } }
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      const file = `${k.name}-${label}.png`; fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
      results.push({ popup: k.name, width: label, steps, ...m, file });
      console.log(k.name, label, JSON.stringify(steps), m.open ? `open ${m.box.w}x${m.box.h}` : 'NOT OPEN', '| player:', m.player, '| play control:', m.playControl, '| keyboard:', m.keyboard, '| empty right:', m.emptyRight, 'px', m.emptyRightPct + '%', '| wide buttons:', (m.wideButtons || []).map(b => `${b.label} ${b.w}/${b.text}`).join('; '));
    }
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  c.close();
})().catch(e => { console.error(e); process.exit(1); });
