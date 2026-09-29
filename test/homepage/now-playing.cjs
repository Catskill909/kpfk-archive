// Now Playing on phones (public/now-playing.js, 2026-09-29). Live browser check against a
// running app (APP_URL, default :8081) with Chrome remote debugging on CDP_PORT. Real clicks at a
// phone size: the tester switch, play an episode, tap the mini player, the sheet's controls,
// "More from this show", close by × and by the back button; with the switch off, the old
// behaviour (the show sheet) — which also proves the probe can tell the two apart.
const { connect, sleep } = require('../live-stream/cdp.js');
const fs = require('fs');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  const errors = []; p.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); });
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const shot = async f => { if (process.env.SHOTS) fs.writeFileSync(process.env.SHOTS + '/' + f, Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 1. phone size: Now Playing is on for everyone (the ?np=on tester switch was removed)
  await p.send('Page.navigate', { url: base + '/' });
  await until(`return document.querySelectorAll('#rows .play-btn').length > 0;`, 30000);
  check('Now Playing is active at phone width, with no special address', await p.eval(`return !!window.NowPlaying && NowPlaying.active();`));

  // 2. play something (a Just aired play button: the gallery's cards open shows on phones), tap the mini player
  const PLAY = await p.eval(`return document.querySelector('.ja-play') ? '.ja-play' : 'button.play-btn[data-mp3]';`);
  await p.click(PLAY);
  check('an episode loads in the player bar', await until(`return !document.getElementById('playerBar').hidden && document.getElementById('playerTitle').textContent.length > 1;`));
  await until(`const a = document.getElementById('mainAudio'); return a.currentTime > 0.5;`, 20000);
  await p.click('#playerInfoBtn');
  check('tapping the mini player opens Now Playing', await until(`return document.getElementById('nowPlaying') && document.getElementById('nowPlaying').open;`, 3000));
  check('the show sheet did not open instead', await p.eval(`return !document.getElementById('showSheet').classList.contains('show');`));
  await sleep(500);
  const np = await p.eval(`const d = document.getElementById('nowPlaying'), q = s => d.querySelector(s);
    const t = q('.np-title'); return { show: q('.np-show').textContent, title: t.textContent, cut: t.scrollWidth > t.clientWidth + 1,
      bar: document.getElementById('playerTitle').textContent, art: !!q('.np-art img').getAttribute('src') || q('.np-art').classList.contains('is-empty'),
      toggle: q('.np-toggle').getAttribute('aria-label'), dur: q('.np-dur').textContent, more: d.querySelectorAll('.np-ep').length,
      focus: document.activeElement === q('.np-close'),
      artBox: (b => [Math.round(b.width), Math.round(b.height)])(q('.np-art').getBoundingClientRect()),
      playing: !document.getElementById('mainAudio').paused,
      actionsOneRow: new Set([...d.querySelectorAll('.np-action:not([hidden])')].map(b => Math.round(b.getBoundingClientRect().top))).size === 1,
      fits: [...d.querySelectorAll('.np-sheet *')].every(e => { const r = e.getBoundingClientRect(); return !r.width || (r.left >= -1 && r.right <= innerWidth + 1); }) };`);
  check('it shows the show, the whole episode title, artwork and the duration', !!np.show && !!np.title && !np.cut && np.art && np.dur !== '0:00', JSON.stringify(np));
  check('focus starts on the close button', np.focus);
  check('the artwork is square, not squashed', np.artBox[0] > 200 && Math.abs(np.artBox[0] - np.artBox[1]) <= 2, JSON.stringify(np.artBox));
  check('the button is right the moment it opens (Pause while playing)', np.playing ? np.toggle === 'Pause' : np.toggle === 'Play', JSON.stringify(np));
  check('the actions sit on one row', np.actionsOneRow);
  check('no repeated headline: the big title is not the show name', np.title !== np.show, JSON.stringify(np));
  check('nothing runs off the phone screen', np.fits);
  await shot('np-1-open.png');
  // Nothing covers the mini player (Paul): it is on screen, it is what a tap there hits, and it works.
  const bar = await p.eval(`const b = document.getElementById('playerBar').getBoundingClientRect(), t = document.getElementById('playerToggle').getBoundingClientRect();
    const hit = document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2), sheet = document.querySelector('#nowPlaying .np-sheet').getBoundingClientRect();
    return JSON.stringify({ visible: b.height > 0 && b.bottom <= innerHeight + 1, hitsBar: !!hit && !!hit.closest('#playerBar'), sheetEndsAboveBar: sheet.bottom <= b.top + 1 });`);
  const barState = JSON.parse(bar);
  check('the mini player stays on screen, above everything, while Now Playing is open', barState.visible && barState.hitsBar && barState.sheetEndsAboveBar, bar);
  await p.click('#playerToggle');
  check('and its own play/pause works with the sheet open', await until(`return document.getElementById('mainAudio').paused;`, 3000));
  await p.click('#playerToggle');
  await until(`return !document.getElementById('mainAudio').paused;`, 8000);

  // 3. controls act on the one player
  const t0 = await p.eval(`return document.getElementById('mainAudio').currentTime;`);
  await p.click('#nowPlaying .np-skip[data-skip="1"]');
  check('+15 moves the audio forward', await until(`return document.getElementById('mainAudio').currentTime >= ${t0} + 10;`, 4000), 'from ' + t0);
  await p.click('#nowPlaying .np-toggle');
  check('the big button pauses, and says Play', await until(`return document.getElementById('mainAudio').paused && document.querySelector('#nowPlaying .np-toggle').getAttribute('aria-label') === 'Play';`, 3000));
  await p.click('#nowPlaying .np-toggle');
  check('and plays again', await until(`return !document.getElementById('mainAudio').paused;`, 8000));
  if (np.more) {
    const other = await p.eval(`return document.querySelector('#nowPlaying .np-ep').dataset.id;`);
    await p.click('#nowPlaying .np-ep');
    check('"More from this show" plays that episode; the sheet follows it',
      await until(`const d = document.getElementById('nowPlaying'); return d.open && document.getElementById('playerTitle').textContent.length > 1 && ![...d.querySelectorAll('.np-ep')].some(b => b.dataset.id === ${JSON.stringify(other)});`, 8000));
  } else console.log('  (this show has no other episodes — "More" not tested)');
  await shot('np-2-after-controls.png');

  // 4. closing
  await p.click('#nowPlaying .np-close');
  check('× closes it', await until(`return !document.getElementById('nowPlaying').open;`, 2000));
  check('the mini player is still there and playing', await p.eval(`return !document.getElementById('playerBar').hidden && !document.getElementById('mainAudio').paused;`));
  await p.click('#playerInfoBtn');
  await until(`return document.getElementById('nowPlaying').open;`, 3000);
  await p.click('#playerInfoBtn');
  check('tapping the mini player again closes Now Playing', await until(`return !document.getElementById('nowPlaying').open;`, 2000));
  await p.click('#playerInfoBtn');
  await until(`return document.getElementById('nowPlaying').open;`, 3000);
  await p.eval(`history.back(); return 1;`);
  check('the phone back button closes it (and does not leave the page)', await until(`return !document.getElementById('nowPlaying').open;`, 3000) && await p.eval(`return location.pathname === '/';`));

  // 5. the show sheet on a phone reaches up to a thin gap (it used to leave a tall dark band)
  await p.click('.ja-text, #rows .card-wrap .show-open, #rows .card-wrap');
  await until(`return document.getElementById('showSheet').classList.contains('show');`, 4000);
  await sleep(700);
  const gap = await p.eval(`return Math.round(document.getElementById('showSheet').getBoundingClientRect().top);`);
  check('the show sheet fills up to a thin gap at the top', gap >= 0 && gap <= 24, 'top at ' + gap + 'px');
  await shot('np-3-show-sheet.png');
  await p.click('#sheetClose');
  await until(`return !document.getElementById('showSheet').classList.contains('show');`, 4000);

  // 6. wide screens keep the old behaviour: the mini player opens the show sheet (and the probe
  // can tell the two apart)
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  check('wide screen: Now Playing is not active', await p.eval(`return !NowPlaying.active();`));
  await p.click('#playerInfoBtn');
  check('wide screen: the mini player opens the show sheet, as before', await until(`return document.getElementById('showSheet').classList.contains('show');`, 3000)
    && await p.eval(`return !document.getElementById('nowPlaying').open;`));

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(failed ? `\n${failed} failure(s)` : '\nOK — Now Playing checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
