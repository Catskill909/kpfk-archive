/* "Just aired": the newest episodes that have actually aired, one per show and air time.
 * QIR lists some online-only items with future air dates, and has carried the same airing
 * twice under different audio files; neither belongs in this rail.
 * Row keys differ by source: a QIR row's dt is the station's wall clock written as if UTC,
 * a Pacifica row's dt is a real Unix time. Each is compared with "now" in its own terms.
 * Programmes only (Paul, 2026-09-27): episodes known to be shorter than 10 minutes (the daily
 * 3-minute "Politics Or Pedagogy?" upload, cut or failed recordings) stay on their show page and
 * in search but never take a Just aired place. An unknown length is kept. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JustAired=factory();})(typeof window==='undefined'?this:window,function(){
  'use strict';
  function wallClockNow(nowMs,timeZone){
    const p={};for(const part of new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(nowMs)))p[part.type]=part.value;
    return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)/1000;
  }
  // rows are already in display order; returns up to `limit` of them.
  var MIN_SECONDS=600;
  function pick(rows,{nowMs=Date.now(),timeZone='America/Los_Angeles',limit=3,minSeconds=MIN_SECONDS}={}){
    const wall=wallClockNow(nowMs,timeZone),real=nowMs/1000,seen=new Set(),out=[];
    for(const r of rows){
      if(r.dt>(r.qir?wall:real)) continue;
      var length=r.totalSec!=null?r.totalSec:r.durationSec;
      if(Number.isFinite(length)&&length<minSeconds) continue;
      const key=r.sho+'\u0000'+r.dt;
      if(seen.has(key)) continue;
      seen.add(key);out.push(r);
      if(out.length===limit) break;
    }
    return out;
  }
  return {pick:pick,wallClockNow:wallClockNow};
});
