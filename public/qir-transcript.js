(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./text'));else root.QirTranscript=factory(root.PlainText);})(typeof window==='undefined'?this:window,function(PlainText){
  'use strict';
  function seconds(value){
    var m=/^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
    return m ? Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000 : NaN;
  }
  function parse(vtt,duration){
    if(typeof vtt!=='string'||vtt.length>2000000||!/^\uFEFF?WEBVTT(?:\s|$)/.test(vtt))return [];
    var cues=[],previous=-1;
    vtt.replace(/\r\n?/g,'\n').split(/\n\s*\n/).forEach(function(block){
      var lines=block.split('\n');if(/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0]))return;
      var i=lines.findIndex(function(line){return line.includes('-->');});if(i<0)return;
      var m=/^(\S+)\s+-->\s+(\S+)/.exec(lines[i]);if(!m)return;
      var start=seconds(m[1]),end=seconds(m[2]);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<previous||end<=start||(duration>0&&end>duration+2)||cues.length>=5000)return;
      // WebVTT escapes & < > as entities in cue text; tags go first, then decode (W7).
      var content=PlainText.plain(lines.slice(i+1).join(' ').replace(/<v\s+([^>]+)>/g,'$1: ').replace(/<[^>]*>/g,''));
      if(!content)return;cues.push({start:start,end:end,text:content});previous=start;
    });return cues;
  }
  return {parse:parse};
});
