'use strict';
// Discovery's routes as the host serves them (moved from kpfk-discovery-plugin 2026-09-28).
// Retired with the separate app, because the host now owns them and tests them itself: the
// HTTPS archive client and its bad-audio filter, the artwork proxy and memory cache, serving
// an expired remote archive, robots.txt.
const {test}=require('node:test');const assert=require('node:assert/strict');const {createApp,token,ARCHIVE_URL}=require('./harness');
const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
async function listen(t,app){await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));return 'http://127.0.0.1:'+app.address().port;}

test('/discover sends people to the main page (old page retired 2026-09-29); only its own files, no secrets',async t=>{
 const calls=[];
 const o=await listen(t,createApp({env:{},fetchImpl:async url=>{calls.push(url);throw Error('Unexpected network '+url);}}));
 for(const [from,to] of [['/discover','/'],['/discover/','/'],['/discover?q=jazz&scope=episodes','/?q=jazz&scope=episodes']]){
  const r=await fetch(o+from,{redirect:'manual'});assert.equal(r.status,302,from);assert.equal(r.headers.get('location'),to,from);
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);}
 for(const asset of ['app.js','player.js','styles.css','app.css','qir-transcript.js','archive-search.js','along.js','playlist.js','media-session.js','just-aired.js','text.js','theme-boot.js'])assert.equal((await fetch(o+'/discover/'+asset)).status,200,asset);
 for(const bad of ['/discover/base.css','/discover/admin.js','/discover/index.js','/discover/..%2Findex.js','/discover/lib/qir/service.js','/discover/app.js.map','/discover/nope.js','/api/plugins/qir/unknown','/api/cue/'])assert.equal((await fetch(o+bad)).status,404,bad);
 assert.equal((await fetch(o+'/discover',{method:'POST'})).status,405);
 const cfg=await(await fetch(o+'/discover/station.js')).text();
 assert.doesNotMatch(cfg,/QIR_API_KEY|Bearer|feeds|origins|episodeCorrections|musicShows/);
 assert.match(cfg,/"storagePrefix":"discovery:kpfk:"/);assert.match(cfg,/"hiddenShows":\["friedman","biketalka"\]/);
 assert.equal((await(await fetch(o+'/api/plugins/qir/status')).json()).state,'not_configured');
 assert.equal((await fetch(o+'/api/plugins/qir/catalog')).status,503);
 assert.deepEqual(calls,[],'no key: no QIR or archive traffic');
});

test('the beta tells every crawler to stay out of Discovery',async t=>{
 const o=await listen(t,createApp({env:{}}));
 for(const route of ['/discover','/discover/app.js','/discover/station.js','/api/plugins/qir/status','/api/cue/abc'])assert.equal((await fetch(o+route,{redirect:'manual'})).headers.get('x-robots-tag'),'noindex, nofollow, noarchive',route);
});

// Class: QIR rows carry no images, so every QIR view fell back to the placeholder.
// Artwork must come from the archive by recording or show key, and an archive
// outage must never cost the QIR catalog.
test('QIR catalog borrows archive artwork by recording or show key and survives an archive outage',async t=>{
 const h=c=>c.repeat(64),ep=(id,mp3)=>({public_id:id,show_key:'demo',show_name:'Demo',title:null,headline:'H',summary:'S',host:null,guest:null,category:'News',air_date:'2026-09-18',air_start:'12:00:00',air_end:null,duration_minutes:60,mp3_url:mp3,updated_at:'2026-09-18T03:27:27Z'});
 const mp3=d=>'https://archive.kpfk.org/mp3/kpfk_'+d+'_120000demo.mp3';
 const archive={directory:{i:{name:'Informativo Pacifica'},m:{name:'Music'}},shows:[{id:'a4',sho:'i',dt:1,mp3:'https://archive.kpfk.org/mp3/kpfk_260918_190000informativo.mp3',photo:'/api/artwork/'+h('c')},{id:'a5',sho:'m',dt:1,mp3:'https://archive.kpfk.org/mp3/kpfk_260918_200000music.mp3',photo:'/api/artwork/'+h('d')},{id:'a1',sho:'x',dt:2,mp3:mp3('260918'),photo:'/api/artwork/'+h('a')},{id:'a2',sho:'x',dt:1,mp3:mp3('260911'),photo:'/api/artwork/'+h('b')},{id:'a3',sho:'y',dt:3,mp3:'https://archive.kpfk.org/mp3/kpfk_260918_130000other.mp3',photo:'https://evil.example/x.png'}]};
 const o=await listen(t,createApp({env:{QIR_API_KEY:'k'},fetchImpl:async url=>{
  if(url===ARCHIVE_URL)return json(archive);
  if(url.endsWith('/shows'))return json({shows:[{key:'demo',display_name:'Demo',active:true}]});
  if(url.includes('/episodes'))return json({data:[ep('dd4c4188-f5f7-4a19-abd2-c4ede0735911',mp3('260911')),ep('dd4c4188-f5f7-4a19-abd2-c4ede0735912',mp3('260925')),
   {...ep('dd4c4188-f5f7-4a19-abd2-c4ede0735913',mp3('260925')),show_key:'informap',show_name:'Informativo Pacifica Online'},
   {...ep('dd4c4188-f5f7-4a19-abd2-c4ede0735914',mp3('260925')),show_key:'musicx',show_name:'Music Hour'}],next_cursor:null});
  throw Error('Unexpected network '+url);}}));
 const c=await(await fetch(o+'/api/plugins/qir/catalog')).json();
 assert.equal(c.artwork.byShow.demo,'/api/artwork/'+h('a'),'newest archive art for the show key');
 assert.equal(c.artwork.byMp3[mp3('260911')],'/api/artwork/'+h('b'),'exact recording art when it differs');
 assert.ok(!JSON.stringify(c.artwork).includes('evil.example'),'only same-origin artwork');
 assert.equal(c.artwork.byShow.informap,'/api/artwork/'+h('c'),'archive name plus suffix matches');
 assert.equal(c.artwork.byShow.musicx,undefined,'a one-word archive name never claims another show');
 const down=await listen(t,createApp({env:{QIR_API_KEY:'k'},fetchImpl:async url=>{if(url===ARCHIVE_URL)return new Response('down',{status:503});if(url.endsWith('/shows'))return json({shows:[]});return json({data:[ep('dd4c4188-f5f7-4a19-abd2-c4ede0735912',mp3('260925'))],next_cursor:null});}}));
 const r=await fetch(down+'/api/plugins/qir/catalog');assert.equal(r.status,200);const body=await r.json();assert.equal(body.episodes.length,1);assert.deepEqual(body.artwork,{byShow:{},byMp3:{}});
});

test('cue proxy: numeric ids only, station archive origin, WEBVTT required, no redirects, cached',async t=>{
 const calls=[];const vtt='WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nSong<br><i>Band</i>\n';
 const o=await listen(t,createApp({env:{},fetchImpl:async(url,opts)=>{calls.push({url,redirect:opts&&opts.redirect});
  if(url.endsWith('/cue/1.vti'))return new Response(vtt);if(url.endsWith('/cue/2.vti'))return new Response('<html>not vtt</html>');
  if(url.endsWith('/cue/3.vti'))return new Response('',{status:302,headers:{location:'https://evil.example/'}});return new Response('',{status:404});}}));
 assert.deepEqual(await(await fetch(o+'/api/cue/1')).json(),{id:'1',vtt});await fetch(o+'/api/cue/1');
 assert.equal(calls.filter(c=>c.url==='https://archive.kpfk.org/cue/1.vti').length,1,'second read is cached');
 assert.ok(calls.every(c=>c.redirect==='manual'));
 assert.equal((await fetch(o+'/api/cue/2')).status,502);assert.equal((await fetch(o+'/api/cue/3')).status,502);assert.equal((await fetch(o+'/api/cue/9')).status,404);
 for(const bad of ['/api/cue/abc','/api/cue/1.vti','/api/cue/..%2Fx','/api/cue/12345678901'])assert.equal((await fetch(o+bad)).status,404,bad);
 assert.ok(calls.every(c=>c.url.startsWith('https://archive.kpfk.org/cue/')));
});

// Show images (2026-09-25): the archive listing carries only scheduled shows, so podcast
// and online shows (the feed's `2kpfk` list, e.g. Bike Talk Podcast) had no art. The class:
// any QIR show whose catalog record has an image but none borrowed from the listing. The
// host's catalog already refuses foreign or bare-folder pictures (normalize.js artwork());
// the plugin must use only real artwork routes, never the host's fallback icon.
test('QIR shows missing borrowed art use their catalog image, and survive an archive outage',async t=>{
 const bike='https://archive.kpfk.org/pix/biketalkpodcast_it_1492.jpg',logo='https://confessor.kpfk.org/pix/KPFK_med.jpg';
 const catalog=[{altid:'demo',photoUrl:'https://confessor.kpfk.org/pix/demo_med_1.jpg'},{altid:'biketalk',photoUrl:bike},{altid:'bradcast2',photoUrl:logo},{altid:'bare',photoUrl:''}];
 const ep=(n,key)=>({public_id:'dd4c4188-f5f7-4a19-abd2-c4ede07359'+String(n).padStart(2,'0'),show_key:key,show_name:key,title:null,headline:'H',summary:'S',host:null,guest:null,category:'News',
  air_date:'2026-09-18',air_start:'12:00:00',air_end:null,duration_minutes:60,mp3_url:'https://archive.kpfk.org/mp3/2kpfk_260918_120000'+key+'.mp3',updated_at:'2026-09-18T03:27:27Z'});
 let archiveUp=true;
 const make=()=>createApp({env:{QIR_API_KEY:'k'},catalog,fetchImpl:async url=>{
  if(url===ARCHIVE_URL){if(!archiveUp)return new Response('down',{status:503});
   return json({directory:{},shows:[{id:'a',sho:'x',dt:1,mp3:'https://archive.kpfk.org/mp3/kpfk_260918_120000demo.mp3',photo:'/api/artwork/'+'a'.repeat(64)}]});}
  if(url.endsWith('/shows'))return json({shows:[]});
  if(url.includes('/episodes'))return json({data:['demo','biketalk','bradcast2','bare','unknown'].map((k,i)=>ep(i+10,k)),next_cursor:null});
  throw Error('Unexpected network '+url);}});
 const o=await listen(t,make());
 const art=(await(await fetch(o+'/api/plugins/qir/catalog')).json()).artwork.byShow;
 assert.equal(art.demo,'/api/artwork/'+'a'.repeat(64),'borrowed art is kept when there is some');
 assert.equal(art.biketalk,token(bike),'podcast-list show gets its catalog image');
 assert.equal(art.bradcast2,token(logo),"a record with no picture shows the feed's own default");
 assert.equal(art.bare,undefined,'the host fallback icon is never used as show art');
 assert.equal(art.unknown,undefined,'no catalog record: no art');
 archiveUp=false;const down=await listen(t,make());
 const art2=(await(await fetch(down+'/api/plugins/qir/catalog')).json()).artwork.byShow;
 assert.equal(art2.biketalk,token(bike),'catalog images survive an archive outage');
});
