// The Show view (docs/kpfk/show-view-plan.md, 2026-09-29). Live browser check against a running
// app (APP_URL, default :8081) with Chrome remote debugging on CDP_PORT. Real clicks, phone and
// desktop: every way in lands on the right view (show or one episode) at the right address; Back
// and close walk out exactly as far as they came in; "Show 20 more" adds rows without moving the
// list; the playing mark follows the audio; the mini player is never covered; nothing runs off
// the screen; desktop shows the show and its episodes side by side.
const { connect, sleep } = require('../live-stream/cdp.js');
const fs = require('fs');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  const errors = []; p.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '')); });
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const shot = async f => { if (process.env.SHOTS) fs.writeFileSync(process.env.SHOTS + '/' + f, Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
  const OPEN = `document.getElementById('showSheet').classList.contains('show')`;
  const state = () => p.eval(`const s = document.getElementById('showSheet'), v = s.querySelector('.sv');
    return { open: s.classList.contains('show'), path: location.pathname, view: !v ? null : v.classList.contains('view-episode') ? 'episode' : 'show',
      rows: s.querySelectorAll('.sv-side .sheet-episode-list > .sheet-episode').length, epTitle: (document.getElementById('sheetEpTitle') || {}).textContent || '',
      showTitle: (document.getElementById('sheetTitle') || {}).textContent || '' };`);
  const settle = () => sleep(600);
  // Navigate and wait for the NEW document: a wait that runs first on the old page can pass on
  // its still-open panel before the address has even loaded.
  const go = async url => { try { await p.eval(`window.__oldPage = 1; return 1;`); } catch { /* first load */ }
    await p.send('Page.navigate', { url }); await until(`return !window.__oldPage && document.readyState !== 'loading';`, 30000); };
  // Everything inside the panel stays within the panel's width (no sideways run, nothing cut).
  const fits = () => p.eval(`const s = document.getElementById('showSheet'), b = s.getBoundingClientRect();
    const bad = [...s.querySelectorAll('.sv *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.left < b.left - 1 || r.right > b.right + 1); });
    return bad.length ? bad.slice(0, 3).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().right) + '>' + Math.round(b.right)).join(', ') : '';`);
  // The mini player: on screen, the thing a tap there reaches, and the panel ends above it.
  const barFree = () => p.eval(`const b = document.getElementById('playerBar'); if (b.hidden) return 'bar hidden';
    const t = document.getElementById('playerToggle').getBoundingClientRect(), hit = document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2);
    const s = document.getElementById('showSheet').getBoundingClientRect(), bb = b.getBoundingClientRect();
    return (hit && hit.closest('#playerBar') ? '' : 'tap reaches ' + (hit && (hit.id || hit.className))) + (s.bottom <= bb.top + 1 ? '' : ' panel overlaps bar ' + Math.round(s.bottom) + '>' + Math.round(bb.top));`);

  // ---------------- phone ----------------
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await go(base + '/');
  await until(`return document.querySelectorAll('#rows .card-wrap .show-open').length > 0 && !!document.querySelector('.ja-text');`, 30000);

  // 1. a show card → the Show view, at the show's own address
  await p.click('#rows .card-wrap .show-open');
  await until(`return ${OPEN};`, 4000); await settle();
  let s = await state();
  check('phone: a show card opens the Show view at /show/<code>', s.open && s.view === 'show' && /^\/show\/[^/]+$/.test(s.path), JSON.stringify(s));
  check('the episodes are right there (up to 20)', s.rows > 0 && s.rows <= 20, JSON.stringify(s));
  const firstRowTop = await p.eval(`const r = document.querySelector('#showSheet .sheet-episode'); return r.getBoundingClientRect().top < innerHeight;`);
  check('the first episode is visible without scrolling, and Play latest too', firstRowTop && await p.eval(`const b = document.querySelector('#showSheet .sheet-head-play').getBoundingClientRect(); return b.bottom < innerHeight / 2;`));
  const rowH = await p.eval(`const r = [...document.querySelectorAll('#showSheet .sheet-episode')].slice(0, 5).map(e => e.getBoundingClientRect().height); return Math.max(...r);`);
  check('rows are compact (≤ 110px)', rowH <= 110, rowH);
  check('nothing runs off the side', !(await fits()), await fits());
  await shot('sv-phone-show.png');

  // 3. an episode row → the Episode view; Back → the Show view; Back → closed, listing address
  const showPath = s.path;
  await p.click('#showSheet .sheet-episode:nth-child(2) .sheet-episode-open');
  await settle();
  s = await state();
  check('tapping an episode opens its Episode view at /show/<code>/<episode>', s.view === 'episode' && s.path.startsWith(showPath + '/') && !!s.epTitle, JSON.stringify(s));
  check('phone: the Episode view has the whole panel (show column hidden)', await p.eval(`return getComputedStyle(document.querySelector('#showSheet .sv-show')).display === 'none';`));
  await p.eval(`history.back(); return 1;`); await settle();
  s = await state();
  check('Back returns to the Show view', s.open && s.view === 'show' && s.path === showPath, JSON.stringify(s));
  await p.eval(`history.back(); return 1;`); await settle();
  s = await state();
  check('Back again closes the panel, at the listing', !s.open && s.path === '/', JSON.stringify(s));

  // 4. show → episode → the × closes all the way (no dead history entries left behind)
  await p.click('#rows .card-wrap .show-open'); await until(`return ${OPEN};`, 4000); await settle();
  await p.click('#showSheet .sheet-episode:nth-child(1) .sheet-episode-open'); await settle();
  await p.click('#sheetClose'); await settle();
  s = await state();
  check('× from an Episode view inside a show closes the panel', !s.open && s.path === '/', JSON.stringify(s));
  // × stepped back over exactly its two entries: Forward is the Show view it opened with, not
  // the Episode view (× went back one) and not the Episode view's successor (× went back three).
  await p.eval(`history.forward(); return 1;`); await settle();
  s = await state();
  check('…exactly over its own history entries (Forward is the Show view)', s.open && s.view === 'show', JSON.stringify(s));
  await p.click('#sheetClose'); await settle();
  await go(base + '/');
  await until(`return !!document.querySelector('.ja-text');`, 30000);

  // 5. Just aired → straight to that episode's Episode view; Back closes (it was opened directly)
  const jaId = await p.eval(`return document.querySelector('.ja-text').dataset.id;`);
  await p.click('.ja-text'); await until(`return ${OPEN};`, 4000); await settle();
  s = await state();
  check('Just aired opens the Episode view of that episode', s.view === 'episode' && s.path.endsWith('/' + jaId.split('.').pop()), JSON.stringify(s) + ' ' + jaId);
  const back = await p.eval(`return document.querySelector('#showSheet .sheet-back .sheet-back-show').textContent;`);
  check('its back link names the show', back.length > 1 && back === s.showTitle, back);
  await p.click('#showSheet .sheet-back'); await settle();
  s = await state();
  check('the back link goes to the Show view', s.open && s.view === 'show' && /^\/show\/[^/]+$/.test(s.path), JSON.stringify(s));
  await p.click('#sheetClose'); await settle();
  check('× closes it', !(await state()).open);

  // 6. playing from a row: the mark follows the audio, the mini player stays free and works
  await p.click('#rows .card-wrap .show-open'); await until(`return ${OPEN};`, 4000); await settle();
  await p.click('#showSheet .sheet-episode:nth-child(2) .sheet-episode-play');
  check('a row\'s play button starts that episode', await until(`return !document.getElementById('playerBar').hidden && !document.getElementById('mainAudio').paused;`, 15000));
  check('that row is marked playing', await until(`const r = document.querySelector('#showSheet .sheet-episode:nth-child(2)'); return r.classList.contains('is-playing') && !document.querySelector('#showSheet .sheet-episode:nth-child(1)').classList.contains('is-playing');`, 4000));
  await sleep(400);
  let bf = await barFree();
  check('the mini player is not covered by the Show view', !bf, bf);
  await p.click('#playerToggle');
  check('the mini player pauses with the panel open', await until(`return document.getElementById('mainAudio').paused;`, 3000));
  check('and the row\'s mark follows (no longer playing)', await until(`return !document.querySelector('#showSheet .sheet-episode:nth-child(2)').classList.contains('is-playing');`, 3000));
  await p.click('#showSheet .sheet-episode:nth-child(2) .sheet-episode-open'); await settle();
  bf = await barFree();
  check('the mini player is not covered by the Episode view', !bf, bf);
  check('nothing runs off the side in the Episode view', !(await fits()), await fits());
  await shot('sv-phone-episode.png');
  await p.click('#sheetClose'); await settle();

  // 7. addresses: a show link → Show view, an episode link → Episode view. Uses the show with
  // the most episodes, so there are rows to link to and more than one page of them.
  const richPath = await p.eval(`return fetch('/api/archive').then(r => r.json()).then(j => { const n = {};
    j.shows.forEach(e => { n[e.sho] = (n[e.sho] || 0) + 1; }); const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return ShowLinks.showPath(top); });`);
  const code = richPath.split('/')[2];
  await go(base + richPath);
  await until(`return ${OPEN} && !!document.querySelector('#showSheet .sv');`, 30000); await settle();
  s = await state();
  check('a /show/<code> link opens the Show view', s.view === 'show' && s.path === richPath, JSON.stringify(s));
  const epPath = await p.eval(`return ShowLinks.episodePath({ sho: 'x.x.${code}', id: document.querySelector('#showSheet .sheet-episode:nth-child(3)').dataset.id });`);
  // "Show 20 more": more rows, same scroll position
  if (await p.eval(`return !!document.querySelector('#showSheet .sheet-show-more');`)) {
    await p.eval(`const b = document.querySelector('#showSheet .sheet-body'); b.scrollTop = b.scrollHeight; return 1;`);
    await sleep(200);
    await p.click('#showSheet .sheet-show-more');
    await sleep(300);
    const after = await state();
    // What the listener sees: the first new row appears where the button was, not a jump elsewhere.
    const seen = await p.eval(`const b = document.querySelector('#showSheet .sheet-body').getBoundingClientRect(), r = document.querySelectorAll('#showSheet .sheet-episode-list > .sheet-episode')[20];
      const t = r && r.getBoundingClientRect(); return !!t && t.top >= b.top - 1 && t.bottom <= b.bottom + 1;`);
    check('"Show 20 more" adds rows, the first new one in view where the button was', after.rows > s.rows && seen, JSON.stringify({ before: s.rows, after: after.rows, seen }));
    await p.eval(`document.querySelector('#showSheet .sheet-body').scrollTop = 0; return 1;`);
  } else check('the show with the most episodes offers "Show 20 more"', false, JSON.stringify(s));

  await go(base + epPath);
  await until(`return ${OPEN} && !!document.querySelector('#showSheet .sv');`, 30000); await settle();
  s = await state();
  check('a /show/<code>/<episode> link opens that Episode view', s.view === 'episode' && s.path === epPath, JSON.stringify(s) + ' ' + epPath);

  // ---------------- desktop ----------------
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await go(base + richPath);
  await until(`return ${OPEN} && !!document.querySelector('#showSheet .sv');`, 30000); await settle();
  const cols = await p.eval(`const a = document.querySelector('#showSheet .sv-show').getBoundingClientRect(), b = document.querySelector('#showSheet .sv-side').getBoundingClientRect();
    return { side: a.right <= b.left + 1 && Math.abs(a.top - b.top) < 2, showW: Math.round(a.width), listW: Math.round(b.width), iw: innerWidth, sv: getComputedStyle(document.querySelector('#showSheet .sv')).display, cls: document.querySelector('#showSheet .sv').className, sheetW: Math.round(document.getElementById('showSheet').getBoundingClientRect().width) };`);
  check('desktop: the show and its episodes sit side by side', cols.side && cols.listW > cols.showW, JSON.stringify(cols));
  check('desktop: the episode list scrolls on its own', await p.eval(`const e = document.querySelector('#showSheet .sv-side'); return getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight;`));
  await p.click('#showSheet .sheet-episode:nth-child(2) .sheet-episode-open'); await settle();
  s = await state();
  const showVisible = await p.eval(`const e = document.querySelector('#showSheet .sv-show'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 200;`);
  check('desktop: the Episode view opens on the right, the show stays on the left', s.view === 'episode' && showVisible, JSON.stringify(s));
  check('desktop: its back link reads "All episodes"', await p.eval(`const b = document.querySelector('#showSheet .sheet-back .sheet-back-all'); return getComputedStyle(b).display !== 'none' && b.textContent === 'All episodes';`));
  await p.click('#showSheet .sheet-ep-actions .sheet-play');
  await until(`return !document.getElementById('playerBar').hidden && !document.getElementById('mainAudio').paused;`, 15000);
  await sleep(500);
  bf = await barFree();
  check('desktop: the bar is not covered', !bf, bf);
  check('desktop: nothing runs off the side', !(await fits()), await fits());
  await shot('sv-desk-episode.png');
  await p.click('#sheetClose'); await settle();
  // the bar's show info → the Episode view of what is playing
  await p.click('#playerInfoBtn');
  await until(`return ${OPEN};`, 4000); await settle();
  s = await state();
  check('desktop: the mini player opens the Episode view of what is playing', s.view === 'episode' && await p.eval(`return document.querySelector('#showSheet .sheet-ep-actions .sheet-play').classList.contains('playing');`), JSON.stringify(s));
  await p.click('#sheetClose'); await settle();

  check('no script errors', errors.length === 0, errors.join('\n     '));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
