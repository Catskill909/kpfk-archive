'use strict';
// Class: a recording filed under the wrong show (an unrecorded fund-drive special). Every
// listener-facing field of the show — key, name, category, artwork — must follow the correction,
// in the QIR list and the pending list; nothing else may change; a correction to a show QIR does
// not know is skipped loudly, never half-applied. 2026-09-27: "Chris Hedges Report" card with an
// Alan Watts headline and On Contact art.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {applyCorrections}=require('../lib/qir/corrections');
const {validateProfile}=require('../../../lib/station-config');
const mp3=k=>'https://archive.kpfk.org/mp3/kpfk_'+k+'.mp3';
const ep=(key,name,cat,file,extra={})=>({public_id:file,show_key:key,show_name:name,category:cat,mp3_url:mp3(file),headline:'H '+file,...extra});
const watts=ep('alanwatts','Alan Watts','Health & Spirituality','260927_080000alanwatts');
const hedges=ep('onconta','Chris Hedges Report','Public Affairs','260927_083000onconta',{headline:'Alan Watts on nature'});
const other=ep('onconta','Chris Hedges Report','Public Affairs','260920_083000onconta');
const fix=[{file:'kpfk_260927_083000onconta.mp3',show:'alanwatts',note:'n'}];

test('a corrected recording takes the real show key, name and category; everything else is unchanged',()=>{
  const out=applyCorrections([watts,hedges,other],fix);
  const c=out[1];
  assert.deepEqual([c.show_key,c.show_name,c.category,c.corrected_from],['alanwatts','Alan Watts','Health & Spirituality','onconta']);
  assert.equal(c.headline,'Alan Watts on nature');assert.equal(c.mp3_url,hedges.mp3_url);assert.equal(c.public_id,hedges.public_id);
  assert.deepEqual(out[0],watts);assert.deepEqual(out[2],other,'the same show on other dates is untouched');
});
test('the real show is found even when the only reference is in another list (pending records)',()=>{
  const pending={...hedges,public_id:'pending-1',pending:true};
  assert.equal(applyCorrections([pending],fix,{reference:[watts,other]})[0].show_name,'Alan Watts');
});
test('a correction to a show QIR has no episodes of is skipped and reported, not half-applied',()=>{
  const warned=[];const out=applyCorrections([hedges],[{...fix[0],show:'nosuchshow'}],{warn:m=>warned.push(m)});
  assert.deepEqual(out[0],hedges);assert.match(warned[0],/nosuchshow/);
});
test('no corrections: the list is returned as is',()=>{const l=[watts];assert.equal(applyCorrections(l,[]),l);assert.equal(applyCorrections(l,undefined),l);});
test('station profile: corrections are validated; KPFK carries the three checked Alan Watts hours',()=>{
  const raw=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'../../../stations/kpfk.json'),'utf8'));
  assert.deepEqual(validateProfile(raw).episodeCorrections.map(c=>c.file+'>'+c.show),['kpfk_260726_083000onconta.mp3>alanwatts','kpfk_260802_083000onconta.mp3>alanwatts','kpfk_260927_083000onconta.mp3>alanwatts']);
  for(const bad of ['x',[{file:'../x.mp3',show:'a',note:'n'}],[{file:'a.mp3',show:'../b',note:'n'}],[{file:'a.mp3',show:'b'}],[{file:'a.mp3',show:'b',note:' '}]])
    assert.throws(()=>validateProfile({...raw,episodeCorrections:bad}),/orrection/i);
});

// Server: the catalog route serves the corrected card with the real show's art.
test('catalog route: corrected episode shows the real show and its artwork, not the scheduled show\'s',async t=>{
  const {createApp}=require('./harness');
  const NOW=Date.parse('2026-09-27T18:00:00Z');
  const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
  const q=(id,key,name,file,date,time)=>({public_id:id,show_key:key,show_name:name,category:'Talk',air_date:date,air_start:time,duration_minutes:30,mp3_url:mp3(file),headline:'H',summary:'S',updated_at:'2026-09-27T16:00:00Z'});
  const eps=[q('dd4c4188-f5f7-4a19-abd2-c4ede0735911','alanwatts','Alan Watts','260927_080000alanwatts','2026-09-27','08:00:00'),
    q('dd4c4188-f5f7-4a19-abd2-c4ede0735912','onconta','Chris Hedges Report','260927_083000onconta','2026-09-27','08:30:00'),
    q('dd4c4188-f5f7-4a19-abd2-c4ede0735913','onconta','Chris Hedges Report','260920_083000onconta','2026-09-20','08:30:00')];
  const catalog=[{altid:'alanwatts',photoUrl:'https://archive.kpfk.org/pix/watts.jpg'},{altid:'onconta',photoUrl:'https://archive.kpfk.org/pix/hedges.jpg'}];
  const app=createApp({env:{QIR_API_KEY:'k'},now:()=>NOW,catalog,fetchImpl:async url=>{
    if(url==='https://podcast.kpfk.org/api/archive')return json({shows:[],directory:{}});
    if(url.endsWith('/shows'))return json({shows:[]});
    if(url.includes('/episodes'))return json({data:eps,next_cursor:null});
    throw Error('Unexpected network '+url);}});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
  const c=await(await fetch('http://127.0.0.1:'+app.address().port+'/api/plugins/qir/catalog')).json();
  const card=c.episodes.find(e=>e.mp3_url.endsWith('260927_083000onconta.mp3'));
  assert.deepEqual([card.show_key,card.show_name],['alanwatts','Alan Watts']);
  assert.equal(c.episodes.find(e=>e.mp3_url.endsWith('260920_083000onconta.mp3')).show_name,'Chris Hedges Report');
  const art=c.artwork.byMp3[card.mp3_url]||c.artwork.byShow[card.show_key];
  assert.ok(art&&art===c.artwork.byShow.alanwatts&&art!==c.artwork.byShow.onconta,'art is Alan Watts\'s');
});

// Class: one broadcast cut into two files by the schedule becomes one show. Only a corrected
// file is ever joined, and only to the same show's file that ends where it starts, same day.
test('corrected second half joins the first half; nothing else is joined',()=>{
  const {joinCorrectedParts}=require('../lib/qir/corrections');
  const e=(id,key,date,start,end,extra={})=>({public_id:id,show_key:key,air_date:date,air_start:start,air_end:end,duration_minutes:30,...extra});
  const out=joinCorrectedParts([
    e('w1','alanwatts','2026-09-27','08:00:00','08:30:00'), e('w2','alanwatts','2026-09-27','08:30:00','09:00:00',{corrected_from:'onconta'}),
    e('x1','dn','2026-09-27','08:00:00','08:30:00'), e('x2','dn','2026-09-27','08:30:00','09:00:00'),                    // not corrected: stays apart
    e('y1','alanwatts','2026-09-20','08:00:00','08:30:00'), e('y2','alanwatts','2026-09-21','08:30:00',null,{corrected_from:'onconta'}), // other day
    e('z1','alanwatts','2026-08-02','08:00:00',null), e('z2','alanwatts','2026-08-02','09:00:00',null,{corrected_from:'onconta'}),     // a gap
  ]);
  const by=Object.fromEntries(out.map(x=>[x.public_id,[x.part_of||'',(x.parts||[]).join()]]));
  assert.deepEqual(by,{w1:['','w2'],w2:['w1',''],x1:['',''],x2:['',''],y1:['',''],y2:['',''],z1:['',''],z2:['','']});
});
test('end time falls back to start + duration when QIR has no air_end',()=>{
  const {joinCorrectedParts}=require('../lib/qir/corrections');
  const out=joinCorrectedParts([{public_id:'a',show_key:'s',air_date:'d',air_start:'08:00:00',duration_minutes:30},{public_id:'b',show_key:'s',air_date:'d',air_start:'08:30:00',duration_minutes:30,corrected_from:'o'}]);
  assert.deepEqual(out.map(x=>x.part_of||x.parts.join()),['b','a']);
});
