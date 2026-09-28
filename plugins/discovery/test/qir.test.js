'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createQirService,episode,showName}=require('../lib/qir/service');
const transcript=require('../public/qir-transcript');
const id='dd4c4188-f5f7-4a19-abd2-c4ede0735912';
const raw={public_id:id,show_key:'demo',show_name:'Demo',title:'Demo',headline:'Housing',summary:'Sample test summary',host:null,guest:null,category:'Public Affairs',air_date:'2026-09-18',air_start:'12:00:00',air_end:'13:00:00',duration_minutes:60,mp3_url:'https://archive.kpfk.org/mp3/example.mp3',updated_at:'2026-09-18T03:27:27Z'};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
function provider(extra={}) {const calls=[];let page=0;const fetchImpl=async(url,options)=>{calls.push({url,headers:options.headers});if(url.endsWith('/shows'))return json({shows:[{key:'demo',show_group:'Demo',display_name:'Demo',category:'News',active:true}]});if(url.includes('/transcript'))return json({transcript:'A transcript',vtt:'WEBVTT\n\n00:00.000 --> 00:04.000\nHello',language:'Spanish'});page++;return json({data:[{...raw,headline:page===1?'Old':'Corrected'}],next_cursor:page===1?'opaque cursor':null});};return {calls,service:createQirService({enabled:true,key:'secret-test',fetchImpl,minIntervalMs:0,...extra})};}
test('missing credentials and disabled plugin never call provider or expose key',async()=>{let calls=0;const s=createQirService({enabled:true,fetchImpl:()=>{calls++;}});await assert.rejects(s.catalog(),/not_configured/);assert.equal(calls,0);assert.equal(s.status().state,'not_configured');const d=createQirService({key:'private',enabled:false});assert.doesNotMatch(JSON.stringify(d.status()),/private/);await assert.rejects(d.catalog(),/not_configured/);});
test('opaque pagination, id upserts, shared cache and transcript projection',async()=>{const {service,calls}=provider();const [a,b]=await Promise.all([service.catalog(),service.catalog()]);assert.deepEqual(a,b);assert.equal(a.episodes.length,1);assert.equal(a.episodes[0].headline,'Corrected');assert.ok(calls.some(c=>c.url.includes('cursor=opaque%20cursor')));assert.equal(calls.length,4,'shows + 2 listing pages + 1 change read');assert.equal(calls[0].headers.Authorization,'Bearer secret-test');assert.doesNotMatch(JSON.stringify(a),/secret-test/);assert.equal((await service.transcript(id)).transcript,'A transcript');assert.equal((await service.transcript(id)).language,'Spanish','language reaches the browser');await service.transcript(id);assert.equal(calls.length,5);await assert.rejects(service.transcript('../bad'),/invalid_episode_id/);});
test('failed refresh keeps last-good data explicitly stale and backs off',async()=>{let now=1000,fail=false,calls=0;const s=createQirService({enabled:true,key:'key',now:()=>now,minIntervalMs:0,ttlMs:100,fetchImpl:async url=>{calls++;if(fail)return new Response('no',{status:429,headers:{'retry-after':'60'}});return json(url.endsWith('/shows')?{shows:[]}:{data:[raw],next_cursor:null});}});await s.catalog();now+=101;fail=true;const served=await s.catalog();assert.equal(served.episodes[0].public_id,id,'last-good data is served while the reload runs');await s.idle();const stale=await s.catalog();assert.equal(stale.stale,true);assert.equal(stale.episodes[0].public_id,id);const count=calls;await s.catalog();assert.equal(calls,count);});
test('redirects are never followed with bearer credentials',async()=>{let calls=0;const s=createQirService({enabled:true,key:'key',minIntervalMs:0,fetchImpl:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://elsewhere.example/'}});}});await assert.rejects(s.catalog());assert.equal(calls,1);});
test('repeated cursor cannot publish a catalog',async()=>{const s=createQirService({enabled:true,key:'key',minIntervalMs:0,fetchImpl:async url=>json(url.endsWith('/shows')?{shows:[]}:{data:[raw],next_cursor:'same'})});await assert.rejects(s.catalog());assert.equal(s.status().lastSuccess,null);});
// Class: one malformed record anywhere in the provider feed must neither publish itself
// nor hide the valid records around it. Covers every episode() rejection path plus the
// nullable air_start seen in live data (2026-09-24: 11 of 2,984 records).
test('malformed records are skipped and counted; valid and date-only records still publish',async()=>{
 const n=i=>id.slice(0,-2)+String(i).padStart(2,'0');
 const good=Array.from({length:60},(_,i)=>({...raw,public_id:n(i)}));
 const bad=[{air_start:null,public_id:n(60)},{air_start:'25:00:00'},{air_date:'2026-02-30'},{title:'x'.repeat(2274)},{mp3_url:'https://unknown.example/a.mp3'},{mp3_url:'http://archive.kpfk.org/a.mp3'},{duration_minutes:null},{updated_at:'never'},{public_id:'not-a-uuid'}]
  .map((f,i)=>({...raw,public_id:n(61+i),...f}));
 const pages=[good.slice(0,30).concat(bad.slice(0,5)),good.slice(30).concat(bad.slice(5))];let page=0;
 const s=createQirService({enabled:true,key:'key',minIntervalMs:0,fetchImpl:async url=>url.endsWith('/shows')?json({shows:[]}):json({data:pages[page++],next_cursor:page<2?'c'+page:null})});
 const c=await s.catalog();const ids=new Set(c.episodes.map(e=>e.public_id));
 assert.equal(c.episodes.length,61);assert.ok(good.every(e=>ids.has(e.public_id)));
 assert.equal(c.episodes.find(e=>e.public_id===n(60)).air_start,null);
 assert.ok(!c.episodes.some(e=>/unknown\.example|^http:/.test(e.mp3_url)));
 assert.deepEqual(c.skipped,{count:8,reasons:{invalid_episode_time:2,invalid_provider_data:1,invalid_audio_url:2,invalid_episode_duration:1,invalid_episode_revision:1,invalid_episode_identity:1}});
 const st=s.status();assert.equal(st.state,'ready');assert.equal(st.episodes,61);assert.equal(st.skipped.count,8);
});
test('widespread malformed data refuses the catalog and is reported as invalid data, not an outage',async()=>{
 const s=createQirService({enabled:true,key:'key',minIntervalMs:0,fetchImpl:async url=>url.endsWith('/shows')?json({shows:[]}):json({data:Array.from({length:30},()=>({...raw,air_start:'bad'})),next_cursor:null})});
 await assert.rejects(s.catalog(),e=>e.message==='provider_data_invalid'&&e.status===503);
 assert.equal(s.status().state,'unavailable');assert.equal(s.status().error,'provider_data_invalid');assert.equal(s.status().lastSuccess,null);
});
test('transcript 404 stays distinct from provider outage',async()=>{const s=createQirService({enabled:true,key:'key',minIntervalMs:0,fetchImpl:async url=>url.includes('/transcript')?new Response('',{status:404}):json(url.endsWith('/shows')?{shows:[]}:{data:[raw],next_cursor:null})});await assert.rejects(s.transcript(id),e=>e.status===404);assert.equal(s.status().state,'ready');});
test('VTT cues retain speaker labels, reject invalid timing, and are data not HTML',()=>{const cues=transcript.parse('WEBVTT\n\n1\n00:01.000 --> 00:04.000\n<v Speaker 2>Hello <b>world</b>\n\n00:05.000 --> 00:03.000\nBad\n\n00:08.000 --> 00:40.000\nOutside',10);assert.deepEqual(cues,[{start:1,end:4,text:'Speaker 2: Hello world'}]);assert.deepEqual(transcript.parse('Not VTT',10),[]);});

test('invalid station-local dates and times cannot enter the beta catalog',()=>{
 for(const fields of [{air_date:'2026-02-30'},{air_date:null},{air_start:'99:10:00'},{air_start:'12:70:00'},{air_start:''}])assert.throws(()=>episode({...raw,...fields},['https://archive.kpfk.org']),/invalid_episode_time/);
});

// Freshness (2026-09-24): QIR's unfiltered listing froze while updated_since kept returning
// new episodes. The class of bug: anything relying on the full listing alone goes stale.
test('episodes missing from a frozen listing arrive via updated_since, survive reloads and are polled',async()=>{
  const n=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
  const old={...raw,public_id:n(1),updated_at:'2026-09-24T15:04:26.889+00:00'};
  let fresh=[{...raw,public_id:n(2),updated_at:'2026-09-24T16:10:00Z'}];
  let now=Date.parse('2026-09-24T17:00:00Z'),failChanges=false;const urls=[];
  const sinceOf=url=>Date.parse(new URL(url).searchParams.get('updated_since'));
  const s=createQirService({enabled:true,key:'k',minIntervalMs:0,ttlMs:3600000,pollMs:300000,now:()=>now,fetchImpl:async url=>{
    urls.push(url);if(url.endsWith('/shows'))return json({shows:[]});
    const since=new URL(url).searchParams.get('updated_since');
    if(!since)return json({data:[old],next_cursor:null}); // frozen: never shows anything newer
    if(failChanges)return new Response('no',{status:500});
    return json({data:[old,...fresh].filter(e=>Date.parse(e.updated_at)>=Date.parse(since)),next_cursor:null});}});
  const ids=c=>c.episodes.map(e=>e.public_id).sort();
  assert.deepEqual(ids(await s.catalog()),[n(1),n(2)],'first load already includes the newer episode');
  assert.ok(sinceOf(urls.at(-1))<=Date.parse(old.updated_at),'changes read starts at or before the listing edge');
  fresh.push({...raw,public_id:n(3),updated_at:'2026-09-24T17:05:00Z'});
  now+=299999;await s.catalog();assert.equal(urls.length,3,'no poll before pollMs');
  now+=1;await s.catalog();await new Promise(r=>setImmediate(r));
  assert.ok(sinceOf(urls.at(-1))<=Date.parse('2026-09-24T16:10:00Z'),'poll never starts past the newest seen');
  assert.deepEqual(ids(await s.catalog()),[n(1),n(2),n(3)],'poll merges the new episode');
  now+=3600000;failChanges=true;await s.catalog();await s.idle();const reloaded=await s.catalog();
  assert.deepEqual(ids(reloaded),[n(1),n(2),n(3)],'full reload with a failed change read keeps polled episodes');
});

// Freshness (2026-09-25): QIR caches every response by its query and never expires it. A poll
// that re-sent an updated_since it had sent before got the old "nothing new" page back and
// stalled for 13 hours. The class: any repeated QIR request is answered from a stale cache.
test('polls reach new episodes through a QIR cache that never expires, including after a long quiet spell',async()=>{
  const n=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
  const at=iso=>({...raw,public_id:n(Date.parse(iso)%1e6),updated_at:iso});
  const live=[at('2026-09-25T01:05:28.936Z')];const cache=new Map();const urls=[];
  let now=Date.parse('2026-09-25T01:06:00Z');
  const s=createQirService({enabled:true,key:'k',minIntervalMs:0,ttlMs:1e12,pollMs:300000,now:()=>now,fetchImpl:async url=>{
    urls.push(url);if(url.endsWith('/shows'))return json({shows:[]});
    const q=new URL(url).searchParams;const key=q.get('limit')+'|'+q.get('updated_since')+'|'+q.get('cursor');
    if(!cache.has(key)){const since=q.get('updated_since');
      cache.set(key,{data:live.filter(e=>!since||Date.parse(e.updated_at)>=Date.parse(since)),next_cursor:null});}
    return json(cache.get(key));}});
  const poll=async ms=>{now+=ms;await s.catalog();await new Promise(r=>setImmediate(r));};
  const has=async iso=>(await s.catalog()).episodes.some(e=>e.updated_at===iso);
  await s.catalog();
  for(let i=0;i<3;i++)await poll(300000); // quiet polls populate the cache with "nothing new"
  live.push(at('2026-09-25T02:06:44.454Z'));await poll(300000);
  assert.ok(await has('2026-09-25T02:06:44.454Z'),'a change after quiet polls is picked up');
  for(let i=0;i<120;i++)await poll(300000); // ten quiet hours: longer than the overlap window
  live.push(at('2026-09-25T12:05:11.850Z'));await poll(300000);
  assert.ok(await has('2026-09-25T12:05:11.850Z'),'a change after a quiet spell longer than the overlap is picked up');
  const polls=urls.filter(u=>u.includes('updated_since')).map(u=>new URL(u).searchParams.get('updated_since'));
  assert.equal(new Set(polls).size,polls.length,'no updated_since value is ever sent twice');
});

// Load time (2026-09-25): past the TTL, the first visitor waited for the whole ~20 s paced
// reload. The class: an expiring cache must not hold a visitor while last-good data exists.
test('an expired catalog is served at once while the reload runs in the background',async()=>{
  let now=0,hold=null;
  const s=createQirService({enabled:true,key:'k',minIntervalMs:0,ttlMs:100,now:()=>now,fetchImpl:async url=>{
    if(hold)await hold;
    return json(url.endsWith('/shows')?{shows:[]}:{data:[raw],next_cursor:null});}});
  await s.catalog();
  let release;hold=new Promise(r=>release=r);now+=101;
  const timer=new Promise(r=>setTimeout(()=>r('waited'),200));
  const served=await Promise.race([s.catalog(),timer]);
  assert.notEqual(served,'waited','visitor is not held by the reload');
  assert.equal(served.episodes[0].public_id,id);
  release();await s.idle();
  assert.equal((await s.catalog()).fetchedAt,101,'the background reload replaced the catalog');
});

// Names (2026-09-25): QIR prefixed 94 directory names, and some episode show_names, with
// "KPFK - " (never the music shows), so cards read "KPFK - Arts In Review" beside
// "Global Village - Mon". The class: any QIR show name reaching the page unnormalized.
test('show names lose the station prefix and doubled spaces in the directory and on episodes',async()=>{
  for(const [input,want] of [['KPFK - Arts In Review','Arts In Review'],['kpfk-Background Briefing','Background Briefing'],
    ["KPFK - Something's Happening A  hour 2","Something's Happening A hour 2"],['Inside KPFK - Weekly','Inside KPFK - Weekly'],['Global Village - Mon','Global Village - Mon'],['','']])
    assert.equal(showName(input),want,input);
  const s=createQirService({enabled:true,key:'k',minIntervalMs:0,fetchImpl:async url=>json(url.endsWith('/shows')
    ?{shows:[{key:'demo',show_group:'',display_name:'KPFK - Demo  Hour',category:'News',active:true}]}
    :{data:[{...raw,show_name:'KPFK - The People\'s Game'}],next_cursor:null})});
  const c=await s.catalog();
  assert.equal(c.shows[0].display_name,'Demo Hour');
  assert.equal(c.episodes[0].show_name,"The People's Game");
});
