'use strict';
// /api/plugins/qir/notes (2026-10-01, Flutter plan step W1): the QIR text a phone app needs for
// the archive's own episodes, instead of the ~1.1 MB catalog.
// Class: an app joins QIR to its episodes wrongly or sees what it must not. Notes must be keyed by
// archive episode id and joined by exact mp3 (never by show key); a QIR episode the archive does
// not list (music past the window, another list) must never appear; unprocessed episodes say
// waiting vs skipped; the route follows the plugin's switches; and an unchanged answer is a 304.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createApp}=require('./harness');

const NOW=Date.parse('2026-09-26T17:45:00Z'),H=3600;
const mp3=k=>'https://archive.kpfk.org/mp3/kpfk_'+k+'.mp3';
const row=(key,hoursAgo)=>({id:'kpfk.kpfk.'+key,sho:'kpfk.kpfk.'+key,upstreamAltId:key,title:key,archiveSource:'kpfk',
  dt:NOW/1000-hoursAgo*H,mp3:mp3(key),durationSec:3600,host:'Host',categoryLabel:'Public Affairs',published:[],episodeDesc:'',vtiUrl:''});
const qirEp=(id,key,mp3Url,extra={})=>({public_id:id,show_key:key,show_name:key,title:null,headline:'Headline '+key,summary:'Summary '+key,
  host:'Host '+key,guest:'Guest '+key,category:'News',air_date:'2026-09-26',air_start:'00:00:00',air_end:null,duration_minutes:60,mp3_url:mp3Url,updated_at:'2026-09-26T09:07:01Z',...extra});
const ID=n=>'dd4c4188-f5f7-4a19-abd2-c4ede07359'+n;

function serve(t,{rows,qir,env={QIR_API_KEY:'k'},switchedOn=true}){
  const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
  const app=createApp({env,switchedOn,now:()=>NOW,fetchImpl:async url=>{
    if(url==='https://podcast.kpfk.org/api/archive')return json({shows:rows,directory:{}});
    if(url.endsWith('/shows'))return json({shows:[]});
    if(url.includes('/episodes'))return json({data:qir,next_cursor:null});
    throw Error('Unexpected network '+url);}});
  return new Promise(r=>app.listen(0,'127.0.0.1',r)).then(()=>{t.after(()=>new Promise(r=>app.close(r)));return 'http://127.0.0.1:'+app.address().port;});
}

test('notes: keyed by archive id, joined by exact mp3, nothing the archive does not list',async t=>{
  const skipped=row('older',30),done=row('dn',10),waiting=row('later',2);
  // QIR files Democracy Now under another key: the join must still find it (by mp3), and the
  // archive-key lookalike with a different recording must not borrow its text.
  const qir=[qirEp(ID(11),'democracynow',done.mp3),qirEp(ID(12),'later',mp3('later-other-day')),qirEp(ID(13),'notlisted',mp3('notlisted'))];
  const o=await serve(t,{rows:[skipped,done,waiting],qir});
  const r=await fetch(o+'/api/plugins/qir/notes');assert.equal(r.status,200);
  const body=await r.json();
  assert.deepEqual(body.notes,{
    'kpfk.kpfk.dn':{qir:ID(11),headline:'Headline democracynow',summary:'Summary democracynow',host:'Host democracynow',guest:'Guest democracynow'},
    'kpfk.kpfk.later':{pending:true,skipped:false},
    'kpfk.kpfk.older':{pending:true,skipped:true}});
  assert.ok(!JSON.stringify(body).includes('notlisted'),'a QIR episode the archive does not list never reaches an app');
  assert.deepEqual(body.pending,{count:1,skipped:1,error:null,behindHours:2});
  assert.equal(body.station,'kpfk');assert.equal(body.stale,false);
});

test('notes: an unchanged answer is a 304; a changed archive is a new ETag',async t=>{
  const rows=[row('dn',10)];
  const o=await serve(t,{rows,qir:[qirEp(ID(11),'dn',mp3('dn'))]});
  const first=await fetch(o+'/api/plugins/qir/notes');const etag=first.headers.get('etag');
  assert.match(etag,/^"[a-f0-9]{32}"$/);assert.equal(first.headers.get('cache-control'),'public, max-age=300');
  const again=await fetch(o+'/api/plugins/qir/notes',{headers:{'If-None-Match':etag}});
  assert.equal(again.status,304);assert.equal(await again.text(),'');
  rows.push(row('later',1));
  const changed=await fetch(o+'/api/plugins/qir/notes',{headers:{'If-None-Match':etag}});
  assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);
  assert.deepEqual((await changed.json()).notes['kpfk.kpfk.later'],{pending:true,skipped:false});
});

test('notes: follows the plugin switches — Discovery off is 404, no QIR key is never a 200',async t=>{
  const args={rows:[row('dn',10)],qir:[qirEp(ID(11),'dn',mp3('dn'))]};
  assert.equal((await fetch(await serve(t,{...args,switchedOn:false})+'/api/plugins/qir/notes')).status,404);
  assert.notEqual((await fetch(await serve(t,{...args,env:{}})+'/api/plugins/qir/notes')).status,200);
});

// Withheld shows (station withheldShows; KPFK: The Aware Show, no on-demand rights). QIR
// processes the recording anyway; Discovery must not serve it on any route, nor its text by id.
test('withheld show: not in catalog, recent or notes; its transcript is refused by id',async t=>{
  const aware=row('aware',3),dn=row('dn',10);
  const qir=[qirEp(ID(21),'aware',aware.mp3),qirEp(ID(22),'dn',dn.mp3)];
  const o=await serve(t,{rows:[aware,dn],qir});
  const cat=await (await fetch(o+'/api/plugins/qir/catalog')).json();
  assert.deepEqual(cat.episodes.map(e=>e.show_key),['dn'],'positive control: the other QIR episode is served');
  const recent=await (await fetch(o+'/api/plugins/qir/recent?since=2026-09-01%2000:00:00')).json();
  assert.ok(!recent.episodes.some(e=>e.show_key==='aware'));
  const notes=await (await fetch(o+'/api/plugins/qir/notes')).json();
  assert.ok(!JSON.stringify(notes).includes(ID(21)),'no Aware text in notes');
  assert.equal((await fetch(o+'/api/plugins/qir/transcript/'+ID(21))).status,404);
});
