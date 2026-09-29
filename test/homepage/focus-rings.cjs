// Focus rings are for the keyboard (2026-09-29, Paul: "green keeps stroking the container of
// selections and close icons"). A closed sheet hands focus back to its opener; after a finger
// tap Safari drew the ring. Real taps at phone size: open a show sheet, close it — the focused
// element must have no ring; then press Tab — a ring must appear (the probe can see one, and
// keyboard users keep theirs). Also for Now Playing, when its switch is on.
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const ring = `const a = document.activeElement, s = a && a !== document.body ? getComputedStyle(a) : null;
    return JSON.stringify({ el: a ? a.tagName + '#' + a.id + '.' + String(a.className).split(' ')[0] : null, outline: s ? s.outlineStyle : 'none', input: document.documentElement.getAttribute('data-input') });`;
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await p.send('Page.navigate', { url: base + '/' });
  await until(`return document.querySelectorAll('.ja-play, #rows .play-btn').length > 0;`, 30000);

  // A show sheet opened and closed by taps.
  await p.click('.ja-text, #rows .card-wrap .show-open, #rows .card-wrap');
  const opened = await until(`return document.getElementById('showSheet').classList.contains('show');`, 4000);
  check('a tap opens a show sheet', opened);
  await sleep(700);
  await p.click('#sheetClose');
  await until(`return !document.getElementById('showSheet').classList.contains('show');`, 4000);
  await sleep(400);
  // Chrome does not draw a ring after a tap-then-programmatic-focus; Safari on iPhone does (the
  // bug). Reproduce Safari: focus the same element again with the ring forced on, as Safari does.
  // Without the fix this reports a solid ring — checked 2026-09-29, the first version was blind.
  // (blur first: focusing the element that already has focus does nothing, which made the
  // first version of this probe blind.)
  await p.eval(`const a = document.activeElement; if (a && a !== document.body) { a.blur(); a.focus({ focusVisible: true }); } return 1;`);
  check('the probe reproduces Safari: the returned focus is in ring-on state', await p.eval(`return document.activeElement.matches(':focus-visible');`));
  const afterTap = JSON.parse(await p.eval(ring));
  check('after closing it with a tap, focus went back to a button…', !!afterTap.el && afterTap.el !== 'BODY#.', JSON.stringify(afterTap));
  check('…and it shows no ring', afterTap.outline === 'none' && afterTap.input === 'pointer', JSON.stringify(afterTap));

  // The keyboard brings rings back (and proves the probe can see one).
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await sleep(300);
  const afterKey = JSON.parse(await p.eval(ring));
  check('after Tab, the focused element shows a ring (keyboard users keep them)', afterKey.outline !== 'none' && afterKey.input === 'keyboard', JSON.stringify(afterKey));

  console.log(failed ? `\n${failed} failure(s)` : '\nOK — focus ring checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
