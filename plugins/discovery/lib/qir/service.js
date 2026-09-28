'use strict';
// Read-only KPFK beta adapter. No processor code and no catalog identity guessing.
const { fetchBounded } = require('../../../../lib/pacifica/fetch-json');
const { plain } = require('../../../../public/text');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function problem(code, status = 502) { const e = new Error(code); e.status = status; return e; }
function text(value, max = 500000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw problem('invalid_provider_data');
  return value;
}
// QIR prefixes 94 of 221 directory names (and a few episode show_names) with "KPFK - ",
// never the music shows, and some carry doubled spaces. Every show here is KPFK's, so the
// prefix only makes names inconsistent; names are cleaned where they enter the app.
// Titles, summaries and names are Confessor's HTML fragments passed through by QIR
// (entities such as &rsquo;): plain() makes them display text where they enter (W7).
const display = (value, max) => plain(text(value, max));
function showName(value) {
  return display(value,1000).replace(/^\s*KPFK\s*-\s*/i,'').replace(/\s{2,}/g,' ').trim();
}
function episode(raw, audioOrigins) {
  if (!raw || !UUID.test(raw.public_id || '') || !/^[\w-]{1,128}$/.test(raw.show_key || '')) throw problem('invalid_episode_identity');
  // air_start is nullable upstream (live data has episodes with only a date); a present value must be valid.
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.air_date || '') || (raw.air_start != null && !clock.test(raw.air_start))) throw problem('invalid_episode_time');
  const day = new Date(raw.air_date+'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==raw.air_date) throw problem('invalid_episode_time');
  if (!Number.isFinite(Date.parse(raw.updated_at))) throw problem('invalid_episode_revision');
  let audio;
  try { audio = new URL(raw.mp3_url); } catch { throw problem('invalid_audio_url'); }
  if (audio.protocol !== 'https:' || audio.username || audio.password || !audioOrigins.includes(audio.origin)) throw problem('invalid_audio_url');
  if (!Number.isFinite(raw.duration_minutes) || raw.duration_minutes < 0 || raw.duration_minutes > 1440) throw problem('invalid_episode_duration');
  return { public_id: raw.public_id, show_key: raw.show_key, show_name: showName(raw.show_name),
    title: display(raw.title,2000), headline: display(raw.headline,4000), summary: display(raw.summary),
    host: display(raw.host,4000), guest: display(raw.guest,8000), category: display(raw.category,1000),
    air_date: raw.air_date, air_start: raw.air_start ?? null, air_end: text(raw.air_end,30),
    duration_minutes: raw.duration_minutes, mp3_url: audio.href, updated_at: raw.updated_at };
}
function createQirService({enabled = false, key = '', audioOrigins = ['https://archive.kpfk.org'],
  fetchImpl = fetch, now = Date.now, minIntervalMs = 1100, ttlMs = 3600000, pollMs = 300000, overlapMs = 21600000} = {}) {
  const base = 'https://qir.kpfk.org/api/v1';
  let catalog = null, pending = null, cooldown = 0, nextRequest = 0, lastError = null;
  let queue = Promise.resolve();
  // Change polling (added 2026-09-24): QIR's unfiltered /episodes listing was found frozen
  // at the 7 AM episode while updated_since returned the newer ones. So every full load is
  // followed by an updated_since read, and between full loads a catalog request older than
  // pollMs starts one in the background. byId is the catalog; newest is the max updated_at (ms).
  let byId = new Map(), newest = 0, lastPoll = 0, polling = null;
  const transcripts = new Map(), transcriptPending = new Map();
  function status() { return { provider:'qir', station:'kpfk', configured:enabled && !!key,
    state:!enabled ? 'disabled' : !key ? 'not_configured' : lastError ? 'unavailable' : catalog ? 'ready' : 'not_verified',
    error: lastError, lastSuccess: catalog ? catalog.fetchedAt : null, lastPoll: lastPoll || null,
    episodes: catalog ? catalog.episodes.length : null, skipped: catalog ? catalog.skipped : null, chaptersSupported:false }; }
  async function request(route) {
    if (!enabled || !key) throw problem('connection_not_configured',503);
    // Serialized provider traffic remains under the documented 60 requests/minute.
    const job = queue.then(async () => {
      if (now() < cooldown) throw problem('provider_temporarily_unavailable',503);
      const wait = Math.max(0,nextRequest-now());
      if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
      nextRequest = now()+minIntervalMs;
      try {
        const result = await fetchBounded(base+route,{origins:[new URL(base).origin],
          headers:{Authorization:'Bearer '+key,Accept:'application/json'},maxBytes:4*1024*1024,
          timeoutMs:12000,fetchImpl:async (url,options)=>{
            // Never forward the bearer token through any redirect, even same-origin.
            const response=await fetchImpl(url,options);
            if(response.status>=300 && response.status<400){if(response.body)await response.body.cancel();throw problem('provider_redirect_refused');}
            if(response.status===404){if(response.body)await response.body.cancel();throw problem('not_found',404);}
            return response;
          }});
        return result.raw;
      } catch(e) {
        if(e.status===404) throw e;
        cooldown=now()+Math.max(30000,e.retryAfterMs||0);
        lastError='provider_temporarily_unavailable';
        throw problem(lastError,503);
      }
    });
    queue=job.catch(()=>{}); return job;
  }
  async function getCatalog() {
    if(!enabled || !key) throw problem('connection_not_configured',503);
    if(catalog && now()-catalog.fetchedAt<ttlMs) {
      // A failed background poll is already recorded in lastError/status; the catalog stays served.
      if(now()-lastPoll>=pollMs && now()>=cooldown && !polling) pollChanges().catch(()=>{});
      return {...catalog,stale:!!lastError};
    }
    // Past the TTL the last-good catalog is still served at once and the reload (~20 s:
    // paced pages) runs in the background; only a cold start, with nothing to serve, waits.
    if(!pending) pending=reload();
    return catalog ? {...catalog,stale:!!lastError} : pending;
  }
  function reload() {
    return (async()=>{
      try {
        const directory=await request('/shows');
        if(!Array.isArray(directory.shows) || directory.shows.length>2000) throw problem('invalid_show_directory');
        const shows=directory.shows.map(s=>({key:text(s.key,128),show_group:text(s.show_group,1000),display_name:showName(s.display_name),category:text(s.category,1000),active:s.active===true}));
        const found=new Map(), cursors=new Set(), skipped={};let cursor='', complete=false, totalBytes=0, seen=0;
        for(let page=0;page<25;page++) {
          const payload=await request('/episodes?limit=200'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
          totalBytes+=Buffer.byteLength(JSON.stringify(payload));
          if(totalBytes>16*1024*1024) throw problem('catalog_exceeds_beta_limit');
          if(!Array.isArray(payload.data) || payload.data.length>200) throw problem('invalid_episode_page');
          for(const raw of payload.data){
            seen++;
            // One malformed record must not hide the rest of the catalog. episode() only
            // throws problem() codes; a skipped record is never published and is counted
            // by reason so status shows it. Anything else is a real bug and propagates.
            let e;
            try{e=episode(raw,audioOrigins);}catch(err){if(!/^invalid_/.test(err.message))throw err;skipped[err.message]=(skipped[err.message]||0)+1;continue;}
            found.set(e.public_id,e);
          }
          if(payload.next_cursor===null){complete=true;break;}
          if(typeof payload.next_cursor!=='string' || !payload.next_cursor || payload.next_cursor.length>4096 || cursors.has(payload.next_cursor)) throw problem('invalid_cursor');
          cursor=payload.next_cursor;cursors.add(cursor);
        }
        if(!complete) throw problem('catalog_exceeds_beta_limit');
        const skippedCount=Object.values(skipped).reduce((a,b)=>a+b,0);
        // Widespread rejection means the provider contract changed; refuse rather than publish a gutted catalog.
        if(skippedCount>Math.max(20,seen*0.05)) throw problem('provider_data_invalid');
        // Episodes learned by polling that the (possibly frozen) listing lacks are carried
        // forward, so a failed poll right after the reload cannot drop them.
        let listed=0;for(const e of found.values()) listed=Math.max(listed,Date.parse(e.updated_at));
        for(const e of byId.values()) if(!found.has(e.public_id) && Date.parse(e.updated_at)>listed) found.set(e.public_id,e);
        byId=found;newest=listed; // re-read everything past the listing's own edge
        catalog={provider:'qir',station:'kpfk',episodes:Array.from(found.values()),shows,fetchedAt:now(),stale:false,
          skipped:{count:skippedCount,reasons:skipped}};
        transcripts.clear();lastError=null;
        // A failed change read leaves the listing published; request() has recorded the outage.
        await pollChanges().catch(()=>{});
        return {...catalog,stale:!!lastError};
      } catch(e) {
        // request() already reports transport failures as provider_temporarily_unavailable;
        // our own validation codes are kept so bad data is not mistaken for an outage.
        lastError=/^(?:invalid_|provider_data_invalid$|catalog_exceeds_beta_limit$)/.test(e.message)?e.message:'provider_temporarily_unavailable';
        cooldown=Math.max(cooldown,now()+30000);
        if(catalog) return {...catalog,stale:true};
        throw problem(lastError,503);
      } finally {pending=null;}
    })();
  }
  // Merge everything changed since `newest` (updated_since is inclusive, so re-read records
  // are simply re-set). Single-flight; at most 10 pages per read.
  // QIR caches each response by limit + updated_since + cursor and never expires it (found
  // 2026-09-25: a 13-hour-old one-record answer served as x-cache HIT despite max-age=60;
  // no-cache headers and unknown params do not bypass it). Asking again with the same
  // `since` therefore returns the same stale page forever, so every read uses a `since` never
  // sent before: now - overlapMs while something changed within overlapMs, otherwise a point
  // that moves earlier as time passes. Both are at or before `newest`, so nothing is skipped.
  function pollSince() {
    const edge=now()-overlapMs;
    return Math.min(edge,2*newest-edge);
  }
  function pollChanges() {
    if(polling) return polling;
    polling=(async()=>{
      let cursor='', changed=0;const cursors=new Set();
      const since=new Date(Math.max(0,pollSince())).toISOString();
      for(let page=0;page<10;page++){
        const payload=await request('/episodes?limit=200&updated_since='+encodeURIComponent(since)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
        if(!Array.isArray(payload.data) || payload.data.length>200) throw problem('invalid_episode_page');
        for(const raw of payload.data){
          // Same rule as the full load: a malformed record is skipped, never published.
          let e;
          try{e=episode(raw,audioOrigins);}catch(err){if(!/^invalid_/.test(err.message))throw err;continue;}
          const old=byId.get(e.public_id);
          if(!old || old.updated_at!==e.updated_at){byId.set(e.public_id,e);transcripts.delete(e.public_id);changed++;}
          newest=Math.max(newest,Date.parse(e.updated_at));
        }
        if(payload.next_cursor==null) break;
        if(typeof payload.next_cursor!=='string' || !payload.next_cursor || payload.next_cursor.length>4096 || cursors.has(payload.next_cursor)) throw problem('invalid_cursor');
        cursor=payload.next_cursor;cursors.add(cursor);
      }
      lastPoll=now();lastError=null;
      if(changed && catalog) catalog={...catalog,episodes:Array.from(byId.values())};
      return changed;
    })().finally(()=>{polling=null;});
    return polling;
  }
  async function transcript(id) {
    if(!UUID.test(id)) throw problem('invalid_episode_id',400);
    const current=await getCatalog();
    if(!current.episodes.some(e=>e.public_id===id)) throw problem('not_found',404);
    if(transcripts.has(id)) return transcripts.get(id);
    if(transcriptPending.has(id)) return transcriptPending.get(id);
    const job=(async()=>{
      try {
        const raw=await request('/episodes/'+id+'/transcript');
        const result={provider:'qir',public_id:id,transcript:display(raw.transcript),vtt:text(raw.vtt,2000000),language:text(raw.language,40)};
        if(transcripts.size>=30) transcripts.delete(transcripts.keys().next().value);
        transcripts.set(id,result);return result;
      } finally {transcriptPending.delete(id);}
    })();
    transcriptPending.set(id,job);return job;
  }
  // idle(): settles once no full reload is in flight (tests and warm-up wait on it).
  return {status,catalog:getCatalog,transcript,idle:()=>(pending||Promise.resolve()).then(()=>{},()=>{})};
}
module.exports={createQirService,episode,showName};
