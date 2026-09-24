// Search results: an episode heading is never a pasted paragraph. Some producers
// put the whole description in the topic field (Rising Up, This Way Out); the
// shared archive-search.js rule demotes it to the preview. Live browser check
// against a running app (default :8081), Chrome remote debugging on CDP_PORT.
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable');
  let n = 0; const check = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (v) n++; else process.exitCode = 1; };
  await p.send('Page.navigate', { url: base + '/?q=trump' });
  const end = Date.now() + 30000; while (Date.now() < end && !(await p.eval(`return document.querySelectorAll('.search-title').length>0;`).catch(() => false))) await sleep(300);
  const r = await p.eval(`return fetch('/api/archive').then(r=>r.json()).then(a=>{
    const long=a.shows.filter(x=>(x.published||[]).some(t=>(t.topic||'').trim().length>window.ArchiveSearch.TITLE_MAX)).map(x=>x.title);
    const heads=[...document.querySelectorAll('.search-title')].map(b=>b.textContent);
    return {long:[...new Set(long)],heads,max:Math.max(0,...heads.map(h=>h.length))};});`);
  console.log('  shows with paragraph topics in the data:', r.long.join(', ') || 'none');
  check('the data still contains paragraph topics (the probe can see the problem)', r.long.length > 0);
  check('search shows episode results', r.heads.length > 0);
  check('no episode heading is paragraph-length', r.max <= 200);
  check('a demoted episode is headed "Show · date"', r.heads.some(h => r.long.some(s => h.startsWith(s + ' · '))));
  // Matched words are highlighted, and a cut preview expands and collapses in place.
  check('matched words are highlighted in previews', await p.eval(`return document.querySelectorAll('.search-excerpt .search-hit').length>0&&[...document.querySelectorAll('.search-hit')].every(m=>/trump/i.test(m.textContent));`));
  check('every heading containing the word highlights it', await p.eval(`return [...document.querySelectorAll('.search-title')].filter(t=>/trump/i.test(t.textContent)).every(t=>t.querySelector('.search-hit'));`));
  check('highlight is a tint, not a colour change of the text', await p.eval(`const m=document.querySelector('.search-hit'),c=getComputedStyle(m);return c.backgroundColor!=='rgba(0, 0, 0, 0)'&&c.color===getComputedStyle(m.parentNode).color;`));
  const before = await p.eval(`const b=document.querySelector('.search-expand');return b?b.parentNode.innerText.length:0;`);
  check('a cut preview offers Show more', before > 0);
  await p.eval(`document.querySelector('.search-expand').click();return 1;`);
  check('Show more reveals the full text in place', await p.eval(`const b=document.querySelector('.search-expand');return b.getAttribute('aria-expanded')==='true'&&b.textContent==='Show less'&&b.parentNode.innerText.length>${before};`));
  await p.eval(`document.querySelector('.search-expand').click();return 1;`);
  check('Show less collapses it again', await p.eval(`const b=document.querySelector('.search-expand');return b.getAttribute('aria-expanded')==='false'&&!b.parentNode.querySelector('.search-short').hidden;`));
  await p.send('Page.navigate', { url: base + '/?q=democracy' });
  const e2 = Date.now() + 20000; while (Date.now() < e2 && !(await p.eval(`return document.querySelectorAll('.search-title').length>0;`).catch(() => false))) await sleep(300);
  check('a heading that contains the word shows it highlighted ("democracy")', await p.eval(`return [...document.querySelectorAll('.search-title')].some(t=>t.querySelector('.search-hit'));`));
  console.log(n + ' checks passed'); p.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
