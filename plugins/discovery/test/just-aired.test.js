'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pick,wallClockNow}=require('../../../public/just-aired');
// 2026-09-24 17:30 in Los Angeles (PDT, UTC-7) = 2026-09-25T00:30Z.
const nowMs=Date.parse('2026-09-25T00:30:00Z');
const qir=(sho,clock,day='2026-09-24')=>({sho,qir:{},dt:Date.parse(day+'T'+clock+'Z')/1000});
test('wall clock now is the station time written as UTC',()=>{
  assert.equal(wallClockNow(nowMs,'America/Los_Angeles'),Date.parse('2026-09-24T17:30:00Z')/1000);
});
test('future-dated items are left out, whatever the source',()=>{
  const rows=[qir('politics','12:00:00','2026-09-27'),qir('informativo','20:01:00'),qir('bb','17:00:00'),qir('dn','16:00:00'),
    {sho:'pacifica-future',dt:nowMs/1000+60},{sho:'pacifica-past',dt:nowMs/1000-60}];
  assert.deepEqual(pick(rows,{nowMs}).map(r=>r.sho),['bb','dn','pacifica-past']);
});
test('the same show at the same air time appears once',()=>{
  const rows=[qir('dn','16:00:00'),qir('dn','16:00:00'),qir('dn','07:00:00'),qir('larb','14:00:00')];
  assert.deepEqual(pick(rows,{nowMs}).map(r=>r.sho+' '+r.dt),[rows[0],rows[2],rows[3]].map(r=>r.sho+' '+r.dt));
});

// Class: anything known to be under 10 minutes (a daily 3-min upload, a cut or failed
// recording, a 0-length record) never takes a Just aired place; unknown length is kept;
// a joined show counts its whole length.
test('programmes only: known-short episodes are skipped, the next programmes fill the row',()=>{
  const r=(sho,clock,sec,extra={})=>({...qir(sho,clock),durationSec:sec,...extra});
  const rows=[r('politics','17:25:00',180),r('zero','17:20:00',0),r('cut','17:10:00',420),r('bb','17:00:00',3600),
    r('unknown','16:30:00',undefined),r('watts','16:00:00',1800,{totalSec:3600}),r('dn','15:00:00',3600)];
  assert.deepEqual(pick(rows,{nowMs}).map(r=>r.sho),['bb','unknown','watts']);
  assert.deepEqual(pick([r('short','17:00:00',540),r('tenmin','16:00:00',600)],{nowMs}).map(r=>r.sho),['tenmin'],'10 minutes exactly is a programme');
});
