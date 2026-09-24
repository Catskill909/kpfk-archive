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
  console.log(n + ' checks passed'); p.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
