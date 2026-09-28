'use strict';
// The QIR switch (moved from kpfk-discovery-plugin's admin tests, 2026-09-28). Discovery's own
// sign-in page is retired: the switch moves to the studio's Discovery tab (integration step 5),
// which will add the sign-in and CSRF tests there. What the switch guarantees is tested here.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createApp,ARCHIVE_URL}=require('./harness');
const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
const raw={public_id:'dd4c4188-f5f7-4a19-abd2-c4ede0735912',show_key:'demo',show_name:'Demo',title:null,headline:'H',summary:'S',host:null,guest:null,category:'News',air_date:'2026-09-18',air_start:'12:00:00',air_end:null,duration_minutes:60,mp3_url:'https://archive.kpfk.org/mp3/kpfk_260918_120000demo.mp3',updated_at:'2026-09-18T03:27:27Z'};
function upstream(calls){return async url=>{calls.push(url);if(url===ARCHIVE_URL)return json({shows:[],directory:{}});if(url.endsWith('/shows'))return json({shows:[]});if(url.includes('/transcript'))return json({transcript:'t',vtt:'WEBVTT'});return json({data:[raw],next_cursor:null});};}
async function start(t,{env={},dataDir=null,calls=[]}={}){
 const app=createApp({env:{QIR_API_KEY:'k',...env},dataDir,fetchImpl:upstream(calls)});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 return {origin:'http://127.0.0.1:'+app.address().port,settings:app.discovery.settings,calls};
}
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'discovery-settings-'));

// Class: every QIR entry point must obey the switch, not just the one the UI calls.
test('switching QIR off closes every QIR route and stops provider traffic; on restores it',async t=>{
 const calls=[];const s=await start(t,{calls});
 assert.equal((await fetch(s.origin+'/api/plugins/qir/catalog')).status,200);
 s.settings.setQir(false);
 const before=calls.filter(u=>u.includes('qir.kpfk.org')).length;
 for(const route of ['/api/plugins/qir/catalog','/api/plugins/qir/recent?since=2026-09-18%2000:00:00','/api/plugins/qir/transcript/'+raw.public_id])assert.deepEqual([(await fetch(s.origin+route)).status,(await(await fetch(s.origin+route)).json()).error],[404,'plugin_disabled'],route);
 assert.equal((await(await fetch(s.origin+'/api/plugins/qir/status')).json()).state,'switched_off');
 assert.equal((await(await fetch(s.origin+'/healthz')).json()).qir,'switched_off');
 assert.equal(calls.filter(u=>u.includes('qir.kpfk.org')).length,before,'no QIR requests while off');
 s.settings.setQir(true);assert.equal((await fetch(s.origin+'/api/plugins/qir/catalog')).status,200);
});

test('the switch is stored on the data volume, survives a restart; a corrupt file stops startup instead of resetting',async t=>{
 const dir=tmp();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const a=await start(t,{dataDir:dir});a.settings.setQir(false);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'discovery','settings.json'),'utf8'));assert.equal(saved.plugins.qir.enabled,false);assert.ok(saved.updatedAt);
 assert.deepEqual(fs.readdirSync(path.join(dir,'discovery')),['settings.json'],'no temp files left behind');
 const b=await start(t,{dataDir:dir});
 assert.equal((await(await fetch(b.origin+'/api/plugins/qir/status')).json()).state,'switched_off');
 fs.writeFileSync(path.join(dir,'discovery','settings.json'),'{"schemaVersion":1,');
 assert.throws(()=>createApp({env:{},dataDir:dir}),/JSON/);
});

test('a station without a QIR connection can never switch it on',async t=>{
 const dir=tmp();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const profile=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../stations/kpfk.json'),'utf8'));profile.plugins.qir=false;
 const file=path.join(dir,'noqir.json');fs.writeFileSync(file,JSON.stringify(profile));
 const calls=[];const s=await start(t,{env:{STATION_PROFILE:file},calls});
 assert.equal((await(await fetch(s.origin+'/api/plugins/qir/status')).json()).state,'disabled');
 s.settings.setQir(true);
 assert.equal((await fetch(s.origin+'/api/plugins/qir/catalog')).status,404);
 assert.equal(calls.filter(u=>u.includes('qir.kpfk.org')).length,0);
});
