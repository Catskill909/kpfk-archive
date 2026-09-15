'use strict';
// Evidence for Pacifica, not app code: for every show in KPFK's JSON catalog,
// compare the exact raw `photoUrl` with the artwork the same station's other
// public outputs (Confessor's pub_sched.php, per-show RSS) already carry.
// The app stays JSON-only; this only shows where the JSON export drops data.
// Usage: node tools/artwork-evidence.js <out-dir>
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || `docs/kpfk/artwork-evidence-${new Date().toISOString().slice(0, 10)}`);
const FEED = 'https://archive.kpfk.org/fe_feed/';
const SCHED_PAGE = 'https://confessor.kpfk.org/playlist/pub_sched.php';
const ARCHIVE_PAGE = 'https://archive.kpfk.org/';
fs.mkdirSync(path.join(OUT, 'raw', 'rss'), { recursive: true });

async function get(url, { save, binary } = {}) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'kpfk-archive artwork audit' } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (save) fs.writeFileSync(path.join(OUT, 'raw', save), buf);
  return { url, finalUrl: res.url, status: res.status, type: res.headers.get('content-type') || '', bytes: buf.length, ms: Date.now() - started, text: binary ? '' : buf.toString('utf8'), buf };
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(e => ({ error: e.message })); } }));
  return out;
}
const csv = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

(async () => {
  const fetchedAt = new Date().toISOString();
  const catalogRes = await get(FEED + 'fe_catalog_kpfk.json', { save: 'fe_catalog_kpfk.json' });
  const catalog = JSON.parse(catalogRes.text);
  const channels = JSON.parse((await get(FEED + 'fe_channels.json', { save: 'fe_channels.json' })).text);
  const primary = channels.channels.find(c => c.isPrimary) || channels.channels[0];
  const index = JSON.parse((await get(new URL(primary.scheduleIndex, FEED).href, { save: 'fe_schedule_index.json' })).text);
  const nowplaying = JSON.parse((await get(new URL(primary.nowplaying, FEED).href, { save: 'fe_nowplaying.json' })).text);
  const weeks = [];
  for (const w of index.weeks) weeks.push(JSON.parse((await get(new URL(w.file, FEED).href, { save: w.file })).text));

  // Schedule JSON slots by altid, keeping the raw photoUrl values seen.
  const slotsByAltid = {};
  const walkSlots = (node) => {
    if (Array.isArray(node)) return node.forEach(walkSlots);
    if (!node || typeof node !== 'object') return;
    if (typeof node.altid === 'string' && ('start' in node || 'startTime' in node || 'photoUrl' in node)) {
      const e = slotsByAltid[node.altid] ||= { count: 0, photoUrls: new Set() };
      e.count++; e.photoUrls.add(JSON.stringify(node.photoUrl));
    }
    Object.values(node).forEach(walkSlots);
  };
  weeks.forEach(walkSlots);

  // Confessor's public schedule page: the page WBAI's app takes artwork from.
  const sched = await get(SCHED_PAGE, { save: 'confessor-pub_sched.html' });
  const pubPix = {};
  for (const m of sched.text.matchAll(/((?:https?:\/\/[^"'\s)]+)?\/?pix\/([A-Za-z0-9_]+)_med_(\d+)\.jpg)/g)) {
    const slug = m[2]; const url = new URL(`/pix/${slug}_med_${m[3]}.jpg`, 'https://confessor.kpfk.org').href;
    (pubPix[slug] ||= new Set()).add(url);
  }

  // Archive page advertises which shows have RSS; fetch each feed's image.
  const archive = await get(ARCHIVE_PAGE);
  const rssSlugs = [...new Set([...archive.text.matchAll(/getrss\.php\?id=([A-Za-z0-9_]+)|\/xml\/([A-Za-z0-9_]+)\.xml/g)].map(m => m[1] || m[2]))].sort();
  const rss = {};
  await pool(rssSlugs, 3, async slug => {
    const r = await get(`https://archive.kpfk.org/xml/${slug}.xml`, { save: `rss/${slug}.xml` });
    const imgs = new Set();
    for (const m of r.text.matchAll(/<image>[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>/g)) imgs.add(m[1]);
    for (const m of r.text.matchAll(/<itunes:image[^>]*href="([^"]+)"/g)) imgs.add(m[1]);
    rss[slug] = { status: r.status, images: [...imgs] };
  });

  const shows = [];
  for (const [source, list] of Object.entries(catalog.shows)) {
    for (const s of list) {
      const eps = Object.keys((catalog.episodes[source] || {})[s.altid] || {}).length;
      shows.push({ source, altid: s.altid, name: s.name, category: s.category, episodes: eps,
        jsonHasKey: Object.prototype.hasOwnProperty.call(s, 'photoUrl'), jsonRaw: JSON.stringify(s.photoUrl),
        jsonUrl: typeof s.photoUrl === 'string' && s.photoUrl.trim() ? s.photoUrl.trim() : '',
        slots: (slotsByAltid[s.altid] || {}).count || 0,
        slotRaw: [...((slotsByAltid[s.altid] || {}).photoUrls || [])].join(' | '),
        pubSched: [...(pubPix[s.altid] || [])], rssListed: rssSlugs.includes(s.altid),
        rss: (rss[s.altid] || {}).images || [] });
    }
  }
  // Verify the alternative images actually load, for shows whose JSON is empty.
  const toCheck = [...new Set(shows.filter(s => !s.jsonUrl).flatMap(s => [...s.pubSched, ...s.rss]))];
  const checked = {};
  await pool(toCheck, 3, async url => {
    const r = await get(url, { binary: true });
    checked[url] = { status: r.status, type: r.type, bytes: r.bytes, image: r.status === 200 && /^image\//.test(r.type) };
  });
  const loads = url => checked[url] && checked[url].image;
  for (const s of shows) {
    const alt = [...s.pubSched, ...s.rss];
    if (s.jsonUrl) s.verdict = s.pubSched.length && !s.pubSched.includes(s.jsonUrl) ? 'JSON_HAS_IMAGE (differs from pub_sched)' : 'JSON_HAS_IMAGE';
    else if (alt.some(loads)) s.verdict = 'JSON_EMPTY — IMAGE EXISTS ELSEWHERE';
    else if (alt.length) s.verdict = 'JSON_EMPTY — other source lists image but it does not load';
    else s.verdict = 'EMPTY IN ALL CHECKED SOURCES';
  }

  const header = ['verdict', 'source', 'altid', 'name', 'category', 'episodes_in_json', 'json_photoUrl_key_present', 'json_photoUrl_raw',
    'schedule_json_slots', 'schedule_json_photoUrl_raw', 'confessor_pub_sched_image', 'pub_sched_http', 'rss_listed', 'rss_image', 'rss_image_http'];
  const httpOf = urls => urls.map(u => checked[u] ? `${checked[u].status} ${checked[u].type} ${checked[u].bytes}B` : '').join(' | ');
  const order = v => ['JSON_EMPTY — IMAGE EXISTS ELSEWHERE', 'JSON_EMPTY — other source lists image but it does not load', 'EMPTY IN ALL CHECKED SOURCES'].indexOf(v) >>> 0;
  shows.sort((a, b) => order(a.verdict) - order(b.verdict) || (b.episodes > 0) - (a.episodes > 0) || a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(OUT, 'shows.csv'), [header.join(','), ...shows.map(s => [s.verdict, s.source, s.altid, s.name, s.category, s.episodes,
    s.jsonHasKey, s.jsonRaw, s.slots, s.slotRaw, s.pubSched.join(' | '), s.jsonUrl ? '' : httpOf(s.pubSched), s.rssListed, s.rss.join(' | '), s.jsonUrl ? '' : httpOf(s.rss)].map(csv).join(','))].join('\n') + '\n');

  const count = f => shows.filter(f).length;
  const summary = {
    fetchedAt, catalogUpdated: catalog.updated, catalogBytes: catalogRes.bytes,
    shows: shows.length, withEpisodes: count(s => s.episodes > 0),
    jsonPhotoKeyMissing: count(s => !s.jsonHasKey),
    jsonPhotoRawValues: shows.filter(s => !s.jsonUrl).reduce((m, s) => (m[s.jsonRaw] = (m[s.jsonRaw] || 0) + 1, m), {}),
    jsonHasImage: count(s => s.jsonUrl), jsonEmpty: count(s => !s.jsonUrl),
    jsonEmptyWithEpisodes: count(s => !s.jsonUrl && s.episodes > 0),
    verdicts: shows.reduce((m, s) => (m[s.verdict] = (m[s.verdict] || 0) + 1, m), {}),
    verdictsWithEpisodes: shows.filter(s => s.episodes > 0).reduce((m, s) => (m[s.verdict] = (m[s.verdict] || 0) + 1, m), {}),
    jsonImageMatchesPubSched: count(s => s.jsonUrl && s.pubSched.includes(s.jsonUrl)),
    jsonImageDiffersFromPubSched: count(s => s.jsonUrl && s.pubSched.length && !s.pubSched.includes(s.jsonUrl)),
    pubSchedSlugs: Object.keys(pubPix).length,
    pubSchedSlugsNotInCatalog: Object.keys(pubPix).filter(k => !shows.some(s => s.altid === k)),
    rssFeeds: rssSlugs.length, rssFeedsWithImage: Object.values(rss).filter(r => r.images.length).length,
    scheduleJsonSlots: Object.values(slotsByAltid).reduce((n, e) => n + e.count, 0),
    scheduleJsonPhotoRawValues: weeks.length ? [...new Set(Object.values(slotsByAltid).flatMap(e => [...e.photoUrls]))] : [],
    nowplayingPhotoRaw: JSON.stringify((nowplaying.current || {}).photoUrl),
    alternativeImagesChecked: toCheck.length, alternativeImagesLoading: Object.values(checked).filter(c => c.image).length,
    examples: shows.filter(s => s.verdict.startsWith('JSON_EMPTY — IMAGE EXISTS') && s.episodes > 0).slice(0, 12)
      .map(s => ({ altid: s.altid, name: s.name, episodes: s.episodes, json_photoUrl: s.jsonRaw, confessor_image: s.pubSched[0] || '', rss_image: s.rss[0] || '' })),
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
