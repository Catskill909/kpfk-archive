'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createQirService,episode}=require('../../lib/qir/service');
const transcript=require('../../public/qir-transcript');
const id='dd4c4188-f5f7-4a19-abd2-c4ede0735912';
const raw={public_id:id,show_key:'demo',show_name:'Demo',title:'Demo',headline:'Housing',summary:'Sample test summary',host:null,guest:null,category:'Public Affairs',air_date:'2026-09-18',air_start:'12:00:00',air_end:'13:00:00',duration_minutes:60,mp3_url:'https://archive.kpfk.org/mp3/example.mp3',updated_at:'2026-09-18T03:27:27Z'};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
function provider(extra={}) {const calls=[];let page=0;const fetchImpl=async(url,options)=>{calls.push({url,headers:options.headers});if(url.endsWith('/shows'))return json({shows:[{key:'demo',show_group:'Demo',display_name:'Demo',category:'News',active:true}]});if(url.includes('/transcript'))return json({transcript:'A transcript',vtt:'WEBVTT\n\n00:00.000 --> 00:04.000\nHello'});page++;return json({data:[{...raw,headline:page===1?'Old':'Corrected'}],next_cursor:page===1?'opaque cursor':null});};return {calls,service:createQirService({enabled:true,key:'secret-test',fetchImpl,minIntervalMs:0,...extra})};}
test('missing credentials and disabled plugin never call provider or expose key',async()=>{let calls=0;const s=createQirService({enabled:true,fetchImpl:()=>{calls++;}});await assert.rejects(s.catalog(),/not_configured/);assert.equal(calls,0);assert.equal(s.status().state,'not_configured');const d=createQirService({key:'private',enabled:false});assert.doesNotMatch(JSON.stringify(d.status()),/private/);await assert.rejects(d.catalog(),/not_configured/);});
test('opaque pagination, id upserts, shared cache and transcript projection',async()=>{const {service,calls}=provider();const [a,b]=await Promise.all([service.catalog(),service.catalog()]);assert.deepEqual(a,b);assert.equal(a.episodes.length,1);assert.equal(a.episodes[0].headline,'Corrected');assert.ok(calls.some(c=>c.url.includes('cursor=opaque%20cursor')));assert.equal(calls.length,3);assert.equal(calls[0].headers.Authorization,'Bearer secret-test');assert.doesNotMatch(JSON.stringify(a),/secret-test/);assert.equal((await service.transcript(id)).transcript,'A transcript');await service.transcript(id);assert.equal(calls.length,4);await assert.rejects(service.transcript('../bad'),/invalid_episode_id/);});
test('failed refresh keeps last-good data explicitly stale and backs off',async()=>{let now=1000,fail=false,calls=0;const s=createQirService({enabled:true,key:'key',now:()=>now,minIntervalMs:0,ttlMs:100,fetchImpl:async url=>{calls++;if(fail)return new Response('no',{status:429,headers:{'retry-after':'60'}});return json(url.endsWith('/shows')?{shows:[]}:{data:[raw],next_cursor:null});}});await s.catalog();now+=101;fail=true;const stale=await s.catalog();assert.equal(stale.stale,true);assert.equal(stale.episodes[0].public_id,id);const count=calls;await s.catalog();assert.equal(calls,count);});
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
