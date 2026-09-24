'use strict';
// Read-only KPFK beta adapter. No processor code and no catalog identity guessing.
const { fetchBounded } = require('../pacifica/fetch-json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function problem(code, status = 502) { const e = new Error(code); e.status = status; return e; }
function text(value, max = 500000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw problem('invalid_provider_data');
  return value;
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
  return { public_id: raw.public_id, show_key: raw.show_key, show_name: text(raw.show_name,1000),
    title: text(raw.title,2000), headline: text(raw.headline,4000), summary: text(raw.summary),
    host: text(raw.host,4000), guest: text(raw.guest,8000), category: text(raw.category,1000),
    air_date: raw.air_date, air_start: raw.air_start ?? null, air_end: text(raw.air_end,30),
    duration_minutes: raw.duration_minutes, mp3_url: audio.href, updated_at: raw.updated_at };
}
function createQirService({enabled = false, key = '', audioOrigins = ['https://archive.kpfk.org'],
  fetchImpl = fetch, now = Date.now, minIntervalMs = 1100, ttlMs = 3600000} = {}) {
  const base = 'https://qir.kpfk.org/api/v1';
  let catalog = null, pending = null, cooldown = 0, nextRequest = 0, lastError = null;
  let queue = Promise.resolve();
  const transcripts = new Map(), transcriptPending = new Map();
  function status() { return { provider:'qir', station:'kpfk', configured:enabled && !!key,
    state:!enabled ? 'disabled' : !key ? 'not_configured' : lastError ? 'unavailable' : catalog ? 'ready' : 'not_verified',
    error: lastError, lastSuccess: catalog ? catalog.fetchedAt : null,
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
    if(catalog && now()-catalog.fetchedAt<ttlMs) return {...catalog,stale:!!lastError};
    if(pending) return pending;
    pending=(async()=>{
      try {
        const directory=await request('/shows');
        if(!Array.isArray(directory.shows) || directory.shows.length>2000) throw problem('invalid_show_directory');
        const shows=directory.shows.map(s=>({key:text(s.key,128),show_group:text(s.show_group,1000),display_name:text(s.display_name,1000),category:text(s.category,1000),active:s.active===true}));
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
        catalog={provider:'qir',station:'kpfk',episodes:Array.from(found.values()),shows,fetchedAt:now(),stale:false,
          skipped:{count:skippedCount,reasons:skipped}};
        transcripts.clear();lastError=null;return catalog;
      } catch(e) {
        // request() already reports transport failures as provider_temporarily_unavailable;
        // our own validation codes are kept so bad data is not mistaken for an outage.
        lastError=/^(?:invalid_|provider_data_invalid$|catalog_exceeds_beta_limit$)/.test(e.message)?e.message:'provider_temporarily_unavailable';
        cooldown=Math.max(cooldown,now()+30000);
        if(catalog) return {...catalog,stale:true};
        throw problem(lastError,503);
      } finally {pending=null;}
    })();
    return pending;
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
        const result={provider:'qir',public_id:id,transcript:text(raw.transcript),vtt:text(raw.vtt,2000000)};
        if(transcripts.size>=30) transcripts.delete(transcripts.keys().next().value);
        transcripts.set(id,result);return result;
      } finally {transcriptPending.delete(id);}
    })();
    transcriptPending.set(id,job);return job;
  }
  return {status,catalog:getCatalog,transcript};
}
module.exports={createQirService,episode};
