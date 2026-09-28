/* Pacifica cue files (<archive>/cue/<id>.vti): WebVTT song playlists, one cue per track,
 * "Title<br><i>Artist</i>". Real files open with a negative start (00:00:-5.000), leave
 * talk gaps as blank cues, and end with a cue whose end precedes its start; this parser
 * keeps every named track and repairs those timings rather than dropping them. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../../../public/text'));else root.Playlist=factory(root.PlainText);})(typeof window==='undefined'?this:window,function(PlainText){
  'use strict';
  function seconds(value){
    var m=/^(?:(\d{1,3}):)?(\d{1,2}):(-?\d{1,2})(?:\.(\d{1,3}))?$/.exec(value||'');
    if(!m)return NaN;
    var s=Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+Number((m[4]||'0').padEnd(3,'0'))/1000;
    return Math.max(0,s);
  }
  // Cue text is "Title<br><i>Artist</i>"; tags become spaces, then the shared decoder (W7).
  function plain(html){return PlainText.plain(String(html).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ');}
  function parse(vtt,duration){
    if(typeof vtt!=='string'||vtt.length>512*1024||!/^﻿?WEBVTT(?:\s|$)/.test(vtt))return [];
    var tracks=[];
    vtt.replace(/\r\n?/g,'\n').split(/\n\s*\n/).forEach(function(block){
      var lines=block.split('\n'),i=lines.findIndex(function(l){return l.indexOf('-->')>=0;});
      if(i<0||tracks.length>=2000)return;
      var m=/^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[i]);if(!m)return;
      var start=seconds(m[1]),end=seconds(m[2]);if(!Number.isFinite(start))return;
      var body=lines.slice(i+1).join('\n'),parts=body.split(/<br\s*\/?>/i);
      var title=plain(parts[0]||''),artist=plain(parts.slice(1).join(' '));
      if(!title&&!artist)return;
      if(duration>0&&start>duration+2)return;
      tracks.push({start:start,end:end,title:title||artist,artist:title?artist:''});
    });
    tracks.sort(function(a,b){return a.start-b.start;});
    tracks.forEach(function(t,i){
      var next=tracks[i+1]?tracks[i+1].start:(duration>0?duration:t.start+1);
      if(!Number.isFinite(t.end)||t.end<=t.start||t.end>next)t.end=Math.max(t.start+1,next);
    });
    return tracks;
  }
  return {parse:parse};
});
