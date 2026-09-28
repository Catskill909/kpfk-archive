'use strict';
// Class: the live refresh must send only what aired at or after `since` (with only those
// episodes' art), refuse a malformed `since`, and stay small next to the full catalog.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createApp}=require('./harness');
const NOW=Date.parse('2026-09-27T18:00:00Z'); // 11:00 PT
const mp3=k=>'https://archive.kpfk.org/mp3/kpfk_'+k+'.mp3';
const ep=(n,date,time,key='show'+n)=>({public_id:'dd4c4188-f5f7-4a19-abd2-c4ede07359'+String(n).padStart(2,'0'),show_key:key,show_name:'Show '+n,category:'Talk',air_date:date,air_start:time,duration_minutes:60,mp3_url:mp3(date.replace(/-/g,'').slice(2)+'_'+time.replace(/:/g,'')+key),headline:'H'+n,summary:'S'.repeat(400),updated_at:'2026-09-27T16:00:00Z'});
async function serve(t,episodes){
  const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
  const catalog=episodes.map(e=>({altid:e.show_key,photoUrl:'https://archive.kpfk.org/pix/'+e.show_key+'.jpg'}));
  const app=createApp({env:{QIR_API_KEY:'k'},now:()=>NOW,catalog,fetchImpl:async url=>{
    if(url==='https://podcast.kpfk.org/api/archive')return json({shows:[],directory:{}});
    if(url.endsWith('/shows'))return json({shows:[]});
    if(url.includes('/episodes'))return json({data:episodes,next_cursor:null});
    throw Error('Unexpected network '+url);}});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
  return 'http://127.0.0.1:'+app.address().port;
}
test('recent: only episodes aired at or after since, with only their art',async t=>{
  const eps=[];for(let d=1;d<=26;d++)for(const h of ['06:00:00','08:00:00','10:00:00'])eps.push(ep(eps.length,'2026-09-'+String(d).padStart(2,'0'),h));
  eps.push(ep(90,'2026-09-27','08:00:00'),ep(91,'2026-09-27','08:30:00'),ep(92,'2026-09-27','12:00:00')); // last one not aired yet (held)
  const o=await serve(t,eps);
  const r=await fetch(o+'/api/plugins/qir/recent?since='+encodeURIComponent('2026-09-27 08:00:00'));assert.equal(r.status,200);
  const body=await r.text(),d=JSON.parse(body);
  assert.deepEqual(d.episodes.map(e=>e.air_start).sort(),['08:00:00','08:30:00'],'aired at/after since; the future one stays held');
  assert.deepEqual(Object.keys(d.artwork.byShow).sort(),['show90','show91'],'only these episodes\' art');
  const full=await(await fetch(o+'/api/plugins/qir/catalog')).text();
  assert.ok(body.length*20<full.length,`recent (${body.length} B) is a small fraction of the catalog (${full.length} B)`);
  const none=await(await fetch(o+'/api/plugins/qir/recent?since='+encodeURIComponent('2026-09-27 09:00:00'))).json();
  assert.deepEqual(none.episodes,[],'nothing new: nothing sent');
});
test('recent: a malformed since is refused',async t=>{
  const o=await serve(t,[ep(1,'2026-09-27','08:00:00')]);
  for(const bad of ['','2026-09-27','2026-09-27T08:00:00Z','x'])assert.equal((await fetch(o+'/api/plugins/qir/recent?since='+encodeURIComponent(bad))).status,400,bad);
});
