'use strict';
// Class: QIR falls behind the station (2026-09-26: no new episodes for 8+ hours) and Discovery
// froze. Recent archive episodes QIR lacks must appear, marked pending; nothing QIR has, nothing
// older than the window and nothing not yet aired may be added; and QIR catching up must
// remove the pending copy with no action from us.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {pendingEpisodes}=require('../lib/qir/pending');
const {createApp}=require('./harness');

const NOW=Date.parse('2026-09-26T17:45:00Z'); // 10:45 PT
const H=3600;
const mp3=k=>'https://archive.kpfk.org/mp3/kpfk_'+k+'.mp3';
const row=(key,hoursAgo,extra={})=>({id:'kpfk.kpfk.'+key.length+hoursAgo,sho:'kpfk.kpfk.'+key,upstreamAltId:key,title:key,archiveSource:'kpfk',
  dt:NOW/1000-hoursAgo*H,mp3:mp3(key+hoursAgo),durationSec:3600,host:'Host',categoryLabel:'Music',
  published:[{topic:'Topic '+key}],episodeDesc:'Notes',vtiUrl:'https://archive.kpfk.org/cue/1.vti',...extra});
const qirOf=r=>({public_id:'x',mp3_url:r.mp3});
const opts={now:NOW,timeZone:'America/Los_Angeles'};

test('recent archive episodes QIR lacks are added, pending, in QIR shape and station wall-clock time',()=>{
  const potira=row('potira',8.75); // 2026-09-26 09:00 UTC = 02:00 PT
  const [p]=pendingEpisodes([],{shows:[potira],directory:{'kpfk.kpfk.potira':{name:'Potira'}}},opts);
  assert.equal(p.pending,true);
  assert.deepEqual([p.air_date,p.air_start],['2026-09-26','02:00:00']);
  assert.equal(p.show_key,'potira');assert.equal(p.show_name,'Potira');assert.equal(p.headline,'Topic potira');
  assert.equal(p.mp3_url,potira.mp3);assert.equal(p.vti_url,potira.vtiUrl);assert.equal(p.duration_minutes,60);
  assert.equal(p.updated_at,null);assert.match(p.public_id,/^pending-/);
});
test('nothing QIR already has, nothing not yet aired; no age limit (2026-09-28)',()=>{
  const have=row('dn',2),old=row('codepink',24*20),future=row('politicorpedagog',-26),now=row('now',0);
  const got=pendingEpisodes([qirOf(have)],{shows:[have,old,future,now],directory:{}},opts).map(p=>p.show_key);
  assert.deepEqual(got.sort(),['codepink','now'],'a 20-day-old episode QIR never had stays listed');
});
test('QIR catching up removes the pending copy (matched by mp3)',()=>{
  const r=row('special',1);
  assert.equal(pendingEpisodes([],{shows:[r],directory:{}},opts).length,1);
  assert.equal(pendingEpisodes([qirOf(r)],{shows:[r],directory:{}},opts).length,0);
});
test('wall-clock time follows the station time zone across the DST change',()=>{
  const winter=Date.parse('2026-12-01T10:00:00Z');
  const [p]=pendingEpisodes([],{shows:[{...row('x',0),dt:winter/1000}],directory:{}},{now:winter,timeZone:'America/Los_Angeles'});
  assert.deepEqual([p.air_date,p.air_start],['2026-12-01','02:00:00']);
});

// Server: the catalog route adds pending records, reports them, and an archive outage
// costs only the fallback, never the QIR catalog.
function serve(t,{archiveUp=true,qirEpisodes=[],archiveRows=[]}){
  const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
  const app=createApp({env:{QIR_API_KEY:'k'},now:()=>NOW,fetchImpl:async url=>{
    if(url==='https://podcast.kpfk.org/api/archive')return archiveUp?json({shows:archiveRows,directory:{}}):new Response('down',{status:503});
    if(url.endsWith('/shows'))return json({shows:[]});
    if(url.includes('/episodes'))return json({data:qirEpisodes,next_cursor:null});
    throw Error('Unexpected network '+url);}});
  return new Promise(r=>app.listen(0,'127.0.0.1',r)).then(()=>{t.after(()=>new Promise(r=>app.close(r)));return 'http://127.0.0.1:'+app.address().port;});
}
const qirEp=(id,mp3Url)=>({public_id:id,show_key:'deepend',show_name:'Midnight Snack',title:null,headline:'H',summary:'S',host:null,guest:null,category:'Music',air_date:'2026-09-26',air_start:'00:00:00',air_end:null,duration_minutes:120,mp3_url:mp3Url,updated_at:'2026-09-26T09:07:01Z'});
test('catalog route adds pending episodes after QIR ones and reports the count on /healthz',async t=>{
  const inQir=row('deepend',10.75),waiting=row('potira',8.75);
  const o=await serve(t,{qirEpisodes:[qirEp('dd4c4188-f5f7-4a19-abd2-c4ede0735911',inQir.mp3)],archiveRows:[inQir,waiting]});
  const c=await(await fetch(o+'/api/plugins/qir/catalog')).json();
  assert.equal(c.episodes.length,2);assert.deepEqual(c.pending,{count:1,skipped:0,error:null,behindHours:8.8});
  assert.equal(c.episodes.filter(e=>e.pending).map(e=>e.show_key).join(),'potira');
  assert.deepEqual((await(await fetch(o+'/healthz')).json()).qirPending,{count:1,skipped:0,error:null,behindHours:8.8},'8.75 h behind: over the 6 h alert line');
  assert.equal((await fetch(o+'/api/plugins/qir/transcript/'+c.episodes[1].public_id)).status,404,'no transcript route for a pending id');
});
test('an archive outage costs only the fallback; the QIR catalog is served unchanged',async t=>{
  const o=await serve(t,{archiveUp:false,qirEpisodes:[qirEp('dd4c4188-f5f7-4a19-abd2-c4ede0735911',mp3('deepend'))]});
  const r=await fetch(o+'/api/plugins/qir/catalog');assert.equal(r.status,200);
  const c=await r.json();assert.equal(c.episodes.length,1);assert.equal(c.pending.error,'archive_unavailable');assert.equal(c.pending.count,0);
});
test('QIR episodes dated after now (station wall clock) are held until they air',()=>{
  const {splitByAirTime}=require('../lib/qir/pending');
  const ep=(d,t)=>({air_date:d,air_start:t});
  const {aired,held}=splitByAirTime([ep('2026-09-26','10:44:00'),ep('2026-09-26','10:46:00'),ep('2026-09-27','12:50:00'),ep('2026-09-26',null),ep('2026-09-27',null)],opts); // now = 10:45 PT
  assert.deepEqual(aired.map(e=>e.air_date+' '+e.air_start),['2026-09-26 10:44:00','2026-09-26 null']);
  assert.deepEqual(held.map(e=>e.air_date+' '+e.air_start),['2026-09-26 10:46:00','2026-09-27 12:50:00','2026-09-27 null']);
});
test('QIR episodes get the archive song list by exact mp3; upload-list rows never (their cue files are 404)',()=>{
  const {withSongLists,pendingEpisodes}=require('../lib/qir/pending');
  const onAir=row('wayoutwest',8),upload=row('bradcast2',3,{archiveSource:'2kpfk',vtiUrl:'https://archive.kpfk.org/cue/9.vti'});
  const qir=[{mp3_url:onAir.mp3},{mp3_url:upload.mp3},{mp3_url:mp3('other')}];
  const out=withSongLists(qir,{shows:[onAir,upload]},'kpfk');
  assert.deepEqual(out.map(e=>e.vti_url||''),[onAir.vtiUrl,'','']);
  assert.equal(pendingEpisodes([],{shows:[upload],directory:{}},{...opts,primaryChannel:'kpfk'})[0].vti_url,'');
});

// Class: an episode QIR skipped (never-processed show, or one missed episode) is not "waiting".
// 2026-09-27: World Massive, missed 31 h earlier, made /healthz read "31.1 h behind" while QIR
// was current, and Nightscapes / All Of The Above (never processed) read "Transcript pending".
// Rule: an archive episode QIR lacks is skipped when QIR has processed anything that aired later.
test('skipped vs waiting: only episodes after QIR\'s newest processed one are waiting',()=>{
  const done=row('gospel',4),skipOld=row('potira',31),skipA=row('allabove',8),skipB=row('lstation',6),wait1=row('alanwatts',2),wait2=row('hedges',1.5);
  const got=pendingEpisodes([qirOf(done),qirOf(row('intcut',10))],{shows:[done,skipOld,skipA,skipB,wait1,wait2,row('intcut',10)],directory:{}},opts);
  const by=Object.fromEntries(got.map(p=>[p.show_key,p.skipped]));
  assert.deepEqual(by,{potira:true,allabove:true,lstation:true,alanwatts:false,hedges:false});
  assert.ok(got.every(p=>p.pending),'skipped episodes stay listed (audio, song list)');
});
test('nothing processed in the window (a real stall): every missing episode is waiting',()=>{
  const got=pendingEpisodes([],{shows:[row('a',20),row('b',9),row('c',1)],directory:{}},opts);
  assert.ok(got.every(p=>!p.skipped));
});
test('a pre-uploaded episode QIR already has does not mark aired ones skipped',()=>{
  const future=row('politicorpedagog',-26),aired=row('dn',3);
  const [p]=pendingEpisodes([qirOf(future)],{shows:[future,aired],directory:{}},opts);
  assert.equal(p.show_key,'dn');assert.equal(p.skipped,false);
});
test('/healthz: skipped episodes are counted apart and are not lag',async t=>{
  const skipped=row('potira',31),done=row('gospel',4),waiting=row('alanwatts',2);
  const o=await serve(t,{qirEpisodes:[qirEp('dd4c4188-f5f7-4a19-abd2-c4ede0735911',done.mp3)],archiveRows:[skipped,done,waiting]});
  const c=await(await fetch(o+'/api/plugins/qir/catalog')).json();
  assert.deepEqual(c.pending,{count:1,skipped:1,error:null,behindHours:2});
  assert.deepEqual((await(await fetch(o+'/healthz')).json()).qirPending,{count:1,skipped:1,error:null,behindHours:2});
});

// Class: music past the station's window (webcast music licence: two weeks) must never be
// offered, whatever makes it music (category, or an explicit musicShows key) and on every path
// the catalog is served from; talk is never dropped for age; no window configured = no limit.
test('music window: music older than the window is dropped, talk and recent music kept',()=>{
  const {splitByMusicWindow}=require('../lib/qir/pending');
  const ep=(key,category,date,time)=>({show_key:key,category,air_date:date,air_start:time});
  const eps=[ep('intcut','Music','2026-09-12','10:44:00'),ep('intcut','Music','2026-09-12','10:46:00'),ep('glob','music','2026-07-01','08:00:00'),
    ep('specialmusicprogramm','Special Program','2026-09-08','19:00:00'),ep('special','Special Program','2026-09-08','19:00:00'),
    ep('dn','Public Affairs - Local','2025-10-01','08:00:00'),ep('undated','Music','2026-09-12',null)];
  const {kept,expired}=splitByMusicWindow(eps,{...opts,days:14,musicShows:['specialmusicprogramm']}); // now 2026-09-26 10:45 PT, cutoff 09-12 10:45
  const tag=e=>e.show_key+' '+e.air_date+' '+e.air_start;
  assert.deepEqual(expired.map(tag),['intcut 2026-09-12 10:44:00','glob 2026-07-01 08:00:00','specialmusicprogramm 2026-09-08 19:00:00','undated 2026-09-12 null']);
  assert.deepEqual(kept.map(tag),['intcut 2026-09-12 10:46:00','special 2026-09-08 19:00:00','dn 2025-10-01 08:00:00']);
  assert.equal(splitByMusicWindow(eps,{...opts,days:null}).expired.length,0,'no window configured: nothing dropped');
});
test('catalog route: old music is not served and is counted as musicExpired',async t=>{
  const music=(id,date)=>({...qirEp(id,mp3('m'+date)),air_date:date,category:'Music'});
  const o=await serve(t,{qirEpisodes:[music('dd4c4188-f5f7-4a19-abd2-c4ede0735911','2026-09-01'),music('dd4c4188-f5f7-4a19-abd2-c4ede0735912','2026-09-20'),{...qirEp('dd4c4188-f5f7-4a19-abd2-c4ede0735913',mp3('talk')),air_date:'2026-01-05',category:'News'}]});
  const c=await(await fetch(o+'/api/plugins/qir/catalog')).json();
  assert.deepEqual(c.episodes.map(e=>e.air_date).sort(),['2026-01-05','2026-09-20']);assert.equal(c.musicExpired,1);
});

// Class: real shows QIR never processes stay listed (Reggae Central vanished 48 h after airing,
// 2026-09-28), labelled "No transcript"; the music window still applies to them.
test('catalog route: old station episodes QIR lacks stay listed as No transcript; old music follows the window',async t=>{
  const done=row('gospel',4),talk=row('hartmann',24*10,{categoryLabel:'Public Affairs'}),music=row('reggaecent',24*20),recentMusic=row('allabove',24*2);
  const o=await serve(t,{qirEpisodes:[qirEp('dd4c4188-f5f7-4a19-abd2-c4ede0735911',done.mp3)],archiveRows:[done,talk,music,recentMusic]});
  const c=await(await fetch(o+'/api/plugins/qir/catalog')).json();
  const listed=Object.fromEntries(c.episodes.filter(e=>e.pending).map(e=>[e.show_key,e.skipped]));
  assert.deepEqual(listed,{hartmann:true,allabove:true},'10-day talk kept, 2-day music kept, 20-day music dropped');
  assert.ok(c.musicExpired>=1);
});
