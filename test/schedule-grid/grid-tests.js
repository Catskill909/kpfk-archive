// The schedule's week grid (docs/schedule-grid-plan.md), against the real app
// in headless Chrome. Every check measures what the reader gets — rendered
// geometry, what is on screen, where each way out lands — not what the code
// declares.
//
//   1. Large tablets and desktop only: no Grid button below 1024px, one from
//      1024px, and a grid left open while the window narrows closes itself.
//   2. A block is as tall as its airtime and sits in its own day's column at
//      its own start time — for EVERY block, not a sample.
//   3. Today's column alone carries the now-line, and the grid opens with it
//      in view.
//   4. Every way out — ✕, Esc, the scrim, Back — lands on the schedule it came
//      from, on the day tab that was selected, and Back never dead-ends.
//   5. It never touches an <audio> element.
//   6. It is dressed in the app's own tokens in dark AND light mode.
//   7. A show opens an info card BESIDE it (right, or left at the edge),
//      wholly inside the visible grid; another show swaps it; Esc closes the
//      card before the grid; a click on empty grid or the card's ✕ closes it.
const { connect, sleep } = require('../live-stream/cdp.js');

const APP = process.env.APP || 'http://localhost:8081/';
const PORT = 9226;
const Q_PX = 22, Q_MIN = 15;   // .grid-sheet --grid-q per GRID_Q minutes

let pass = 0, fail = 0;
function check(name, cond, detail) {
  (cond ? pass++ : fail++);
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  → ' + JSON.stringify(detail) : ''}`);
}
async function viewport(p, width, height = 1000) {
  await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
}
async function key(p, k, code) {
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
  await sleep(500);
}
async function mouseAt(p, x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(500);
}
const STATE = `
  var sel = document.querySelector('.sched-tab.selected');
  return {
    sched: !!document.querySelector('.sched-modal.show'),
    grid: !!document.querySelector('.sched-grid.show'),
    day: sel ? sel.dataset.day : null,
    gridFlag: !!(history.state && history.state.schedGrid),
    schedFlag: !!(history.state && history.state.sched)
  };`;
const AUDIO = `return [].map.call(document.querySelectorAll('audio'), function(a){
  return a.paused + '|' + a.currentSrc + '|' + a.src; }).join(';');`;

(async () => {
  const p = await connect(PORT);
  await p.send('Page.enable');
  await p.send('Runtime.enable');
  await viewport(p, 1400);
  await p.send('Page.navigate', { url: APP });
  await sleep(3000);
  const audioBefore = await p.eval(AUDIO);

  console.log('\n1. large tablets and desktop only');
  await p.eval(`document.getElementById('scheduleBtn').click(); return 1;`);
  await sleep(1500);   // the published week is fetched on open
  const btnVisible = () => p.eval(`var b = document.getElementById('schedGridBtn');
    if(!b) return false; var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0;`);
  check('the Grid button shows at 1400px', await btnVisible());
  await viewport(p, 1024);
  check('and at exactly 1024px', await btnVisible());
  await viewport(p, 1023);
  check('but not at 1023px', !(await btnVisible()));
  await viewport(p, 820);
  check('nor on a small tablet (820px)', !(await btnVisible()));
  await viewport(p, 402);
  check('nor on a phone (402px)', !(await btnVisible()));
  await viewport(p, 1400);

  // Pick a day that is NOT today, so "lands on the same tab" cannot pass by
  // accident of the schedule's default.
  await p.eval(`var t = document.querySelectorAll('.sched-tab')[2]; t && t.click(); return 1;`);
  await sleep(300);
  const before = await p.eval(STATE);
  check('the schedule is open on a chosen day', before.sched && !!before.day, before.day);

  console.log('\n2. blocks are as tall as their airtime, in their own column and row');
  await p.clickInPlace('#schedGridBtn');
  await sleep(900);
  let s = await p.eval(STATE);
  check('the grid opened over the schedule', s.grid && s.sched && s.gridFlag, s);
  const geo = await p.eval(`
    var lines = document.querySelector('.grid-lines');
    if(!lines) return null;
    var origin = lines.getBoundingClientRect().top;
    var days = [].map.call(document.querySelectorAll('.grid-day'), function(d){
      var r = d.getBoundingClientRect(); return { col: d.dataset.col, l: r.left, r: r.right }; });
    var fmt = new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles', hour:'numeric', minute:'numeric', hourCycle:'h23'});
    var bad = [], n = 0, durs = {};
    [].forEach.call(document.querySelectorAll('.grid-block'), function(b){
      n++;
      var r = b.getBoundingClientRect();
      var dur = (b.dataset.end - b.dataset.start) / 60;
      durs[dur] = (durs[dur] || 0) + 1;
      var parts = fmt.formatToParts(new Date(b.dataset.start * 1000)), h = 0, m = 0;
      parts.forEach(function(x){ if(x.type === 'hour') h = +x.value % 24; if(x.type === 'minute') m = +x.value; });
      var wantH = dur / ${Q_MIN} * ${Q_PX}, wantTop = (h * 60 + m) / ${Q_MIN} * ${Q_PX};
      var gotH = r.height + 4, gotTop = r.top - 2 - origin;     // 2px margin top and bottom
      var col = days.filter(function(d){ return d.col === b.dataset.col; })[0];
      var cx = (r.left + r.right) / 2;
      var inCol = !!col && cx > col.l && cx < col.r;
      if(Math.abs(gotH - wantH) > 1.5 || Math.abs(gotTop - wantTop) > 1.5 || !inCol)
        bad.push({ title: b.querySelector('.grid-title').textContent, dur: dur, gotH: gotH, wantH: wantH, gotTop: gotTop, wantTop: wantTop, inCol: inCol });
    });
    return { n: n, days: days.length, durs: durs, bad: bad.slice(0, 5), badCount: bad.length };`);
  check('the week painted blocks across seven days', geo && geo.n > 50 && geo.days === 7, geo && { n: geo.n, days: geo.days });
  check('covering short and long shows', geo && geo.durs[30] > 0 && geo.durs[60] > 0 && geo.durs[120] > 0, geo && geo.durs);
  check('every block: height = airtime, top = start time, in its day column', geo && geo.badCount === 0, geo && geo.bad);
  const clipped = await p.eval(`
    return [].filter.call(document.querySelectorAll('.grid-block-short .grid-title'), function(t){
      return t.getBoundingClientRect().height < 12; }).length;`);
  check('a half-hour block still shows its title', clipped === 0, clipped);

  console.log('\n3. today, now');
  const now = await p.eval(`
    var lines = document.querySelectorAll('.grid-now');
    var today = document.querySelector('.grid-day-today');
    if(lines.length !== 1 || !today) return { count: lines.length, today: !!today };
    var line = lines[0], r = line.getBoundingClientRect(), t = today.getBoundingClientRect();
    var frac = parseFloat(line.style.getPropertyValue('--grid-now'));
    var y = r.top + frac * r.height, body = document.getElementById('gridBody').getBoundingClientRect();
    var live = document.querySelectorAll('.grid-block.grid-live');
    return { count: 1, sameCol: Math.abs(r.left - t.left) < 1 && Math.abs(r.right - t.right) < 1,
             onScreen: y > body.top && y < body.bottom, frac: frac,
             live: live.length, liveCol: live[0] ? live[0].dataset.col : null, todayCol: today.dataset.col };`);
  check('exactly one now-line, in today\'s column', now.count === 1 && now.sameCol, now);
  check('and the grid opened with it in view', now.onScreen, now);
  check('the on-air block is today\'s, and only one', now.live === 1 && now.liveCol === now.todayCol, now);

  console.log('\n4. every way out lands on the schedule, same day');
  await p.clickInPlace('#gridClose');
  await sleep(700);
  s = await p.eval(STATE);
  check('✕ → schedule, same day, grid entry consumed', !s.grid && s.sched && s.day === before.day && !s.gridFlag && s.schedFlag, s);

  await p.clickInPlace('#schedGridBtn'); await sleep(700);
  await key(p, 'Escape', 27);
  s = await p.eval(STATE);
  check('Esc → schedule, same day (not both layers)', !s.grid && s.sched && s.day === before.day, s);

  await p.clickInPlace('#schedGridBtn'); await sleep(700);
  const hit = await p.eval(`var el = document.elementFromPoint(20, 400); return el ? el.className : null;`);
  check('the scrim is what sits beside the grid', hit === 'sched-grid-scrim show', hit);
  await mouseAt(p, 20, 400);
  s = await p.eval(STATE);
  check('scrim → schedule, same day', !s.grid && s.sched && s.day === before.day, s);

  await p.clickInPlace('#schedGridBtn'); await sleep(700);
  await p.eval(`history.back(); return 1;`); await sleep(700);
  s = await p.eval(STATE);
  check('Back → schedule, same day', !s.grid && s.sched && s.day === before.day, s);
  await p.eval(`history.back(); return 1;`); await sleep(700);
  s = await p.eval(STATE);
  check('and the next Back closes the schedule (no dead press)', !s.grid && !s.sched, s);
  await p.eval(`history.forward(); return 1;`); await sleep(700);
  await p.eval(`history.forward(); return 1;`); await sleep(900);
  s = await p.eval(STATE);
  check('Forward twice re-opens schedule and grid', s.grid && s.sched, s);

  console.log('\n1b. narrowing past the cutoff hands back the list');
  await viewport(p, 900);
  await sleep(600);
  s = await p.eval(STATE);
  check('grid closes, schedule stays', !s.grid && s.sched && !s.gridFlag, s);
  await viewport(p, 1400);

  console.log('\n5. never touches audio');
  check('every <audio> is exactly as it was', (await p.eval(AUDIO)) === audioBefore);

  console.log('\n6. our tokens, dark and light');
  await p.clickInPlace('#schedGridBtn'); await sleep(700);
  const skin = () => p.eval(`
    var g = getComputedStyle(document.getElementById('schedGrid'));
    var m = getComputedStyle(document.getElementById('schedModal'));
    var probe = document.createElement('div'); probe.style.setProperty('color', 'var(--accent)');
    document.body.appendChild(probe); var accent = getComputedStyle(probe).color; probe.remove();
    var today = document.querySelector('.grid-day-today .grid-day-name');
    var block = document.querySelector('.grid-block:not(.grid-live)');
    var slotCard = document.querySelector('.sched-show-wrap:not(.sched-show-live)');
    return { grid: g.backgroundColor, sched: m.backgroundColor, ink: g.color, schedInk: m.color,
             todayBg: today && getComputedStyle(today).backgroundColor, accent: accent,
             block: block && getComputedStyle(block).backgroundColor,
             card: slotCard && getComputedStyle(slotCard).backgroundColor };`);
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(300);
  const dark = await skin();
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(300);
  const light = await skin();
  for (const [name, t] of [['dark', dark], ['light', light]]) {
    check(`${name}: grid surface and ink = the schedule's`, t.grid === t.sched && t.ink === t.schedInk, t);
    check(`${name}: a block = a schedule card`, t.block === t.card, { block: t.block, card: t.card });
    check(`${name}: Today wears the accent`, t.todayBg === t.accent, { today: t.todayBg, accent: t.accent });
  }
  check('and the two themes really differ', dark.grid !== light.grid, { dark: dark.grid, light: light.grid });

  console.log('\n7. the info card: beside its show, inside the grid, closes in order');
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  // Bring a block into the grid's own view first: a click at off-screen
  // coordinates lands on something else (see test/schedule).
  const pick = (which) => p.eval(`
    var body = document.getElementById('gridBody');
    var cols = [].map.call(document.querySelectorAll('.grid-day'), function(d){ return d.dataset.col; });
    var col = ${JSON.stringify(which)} === 'last' ? cols[cols.length - 1] : cols[2];
    var b = [].filter.call(document.querySelectorAll('.grid-block[data-col="' + col + '"]'), function(x){
      return +x.dataset.span >= 4; })[3];
    if(!b) return null;
    b.scrollIntoView({ block: 'center' });
    return b.dataset.i;`);
  const CARD = `
    var pop = document.getElementById('gridPop'), body = document.getElementById('gridBody');
    var open = document.querySelectorAll('.grid-block.grid-block-open');
    if(!pop || pop.hidden) return { shown: false, open: open.length };
    var b = open[0], pr = pop.getBoundingClientRect(), br = b.getBoundingClientRect(), vr = body.getBoundingClientRect();
    var head = document.querySelector('.grid-day').getBoundingClientRect();
    return { shown: true, open: open.length, i: b.dataset.i,
      title: pop.querySelector('.grid-pop-title').textContent, blockTitle: b.querySelector('.grid-title').textContent,
      when: pop.querySelector('.grid-pop-when').textContent, meta: pop.querySelector('.grid-pop-meta').textContent,
      side: pr.left >= br.right ? 'right' : pr.right <= br.left ? 'left' : 'overlaps',
      inside: pr.left >= vr.left && pr.right <= vr.right - 1 && pr.top >= head.bottom && pr.bottom <= vr.bottom,
      expanded: b.getAttribute('aria-expanded'),
      bg: getComputedStyle(pop).backgroundColor, surface: getComputedStyle(document.getElementById('schedGrid')).backgroundColor,
      focusInCard: pop.contains(document.activeElement) };`;
  const mid = await pick('mid');
  check('found a show to click', mid !== null, mid);
  await p.clickInPlace(`.grid-block[data-i="${mid}"]`);
  let c = await p.eval(CARD);
  check('clicking a show opens its card', c.shown && c.open === 1 && c.i === mid && c.expanded === 'true', c);
  check('the card names that show, its day and time range', c.title === c.blockTitle && / · .+ – .+/.test(c.when) && !!c.meta, c);
  check('it sits beside the show, not on it', c.side === 'right' || c.side === 'left', c.side);
  check('and wholly inside the grid, below the day headers', c.inside, c);
  check('it takes focus, for keyboard and screen readers', c.focusInCard);
  check('dressed in the grid\'s own surface', c.bg === c.surface, { bg: c.bg, surface: c.surface });

  const last = await pick('last');
  await p.clickInPlace(`.grid-block[data-i="${last}"]`);
  c = await p.eval(CARD);
  check('another show swaps the card (still one, now that show)', c.shown && c.open === 1 && c.i === last, c);
  check('a last-column show gets its card on the left, inside the grid', c.side === 'left' && c.inside, c);
  await p.clickInPlace(`.grid-block[data-i="${last}"]`);
  c = await p.eval(CARD);
  check('clicking the same show again closes it', !c.shown && c.open === 0, c);

  await p.clickInPlace(`.grid-block[data-i="${last}"]`);
  await key(p, 'Escape', 27);
  c = await p.eval(CARD);
  s = await p.eval(STATE);
  const refocused = await p.eval(`return document.activeElement && document.activeElement.dataset.i;`);
  check('Esc closes the card and leaves the grid up', !c.shown && s.grid, { card: c.shown, grid: s.grid });
  check('focus goes back to the show it came from', refocused === last, refocused);

  await p.clickInPlace(`.grid-block[data-i="${last}"]`);
  await p.eval(`document.querySelector('.grid-hour').scrollIntoView({ block: 'nearest' }); return 1;`);
  const empty = await p.eval(`
    var body = document.getElementById('gridBody').getBoundingClientRect();
    var h = [].filter.call(document.querySelectorAll('.grid-hour'), function(x){
      var r = x.getBoundingClientRect(); return r.top > body.top + 80 && r.bottom < body.bottom; })[0];
    var r = h.getBoundingClientRect(); return { x: Math.round(r.left + 6), y: Math.round(r.bottom - 4) };`);
  await mouseAt(p, empty.x, empty.y);
  c = await p.eval(CARD);
  s = await p.eval(STATE);
  check('a click on empty grid closes the card, not the grid', !c.shown && s.grid, { card: c.shown, grid: s.grid });

  await p.clickInPlace(`.grid-block[data-i="${mid}"]`);
  await p.clickInPlace('.grid-pop-close');
  c = await p.eval(CARD);
  check('the card\'s ✕ closes it', !c.shown && c.open === 0, c);

  await p.clickInPlace(`.grid-block[data-i="${mid}"]`);
  await key(p, 'Escape', 27);
  await key(p, 'Escape', 27);
  s = await p.eval(STATE);
  check('Esc twice: card, then grid → schedule', !s.grid && s.sched, s);

  await p.eval(`document.getElementById('schedGridBtn').click(); return 1;`); await sleep(700);
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(300);
  await p.eval(`document.querySelector('.grid-block[data-i="${mid}"]').scrollIntoView({ block: 'center' }); return 1;`);
  await p.clickInPlace(`.grid-block[data-i="${mid}"]`);
  c = await p.eval(CARD);
  check('light mode: the card uses the light surface', c.shown && c.bg === c.surface && c.bg !== dark.grid, { bg: c.bg, surface: c.surface });

  console.log('\n5b. still never touches audio');
  check('every <audio> is exactly as it was', (await p.eval(AUDIO)) === audioBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
