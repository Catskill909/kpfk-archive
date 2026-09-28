'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const playlist=require('../public/playlist');
// Verbatim shape of archive.kpfk.org/cue/138702.vti (2026-09-24): negative opening
// time, blank talk cues, and a last cue that ends before it starts.
const real=`WEBVTT 

1
00:00:-5.000 --> 00:00:30.000
 
 

2
00:00:31.000 --> 00:04:54.000
Illumination<br>
<i>Cindy Blackman Santana</i>

3
00:04:55.000 --> 00:09:02.000
 
 

8
00:52:24.000 --> 00:58:13.000
Circe<br>
<i>Cindy Blackman Santana</i>

9
00:58:14.000 --> 00:59:24.000
Northside Cruise<br>
<i>Henry Brun &amp; The Latin Playerz</i>

10
00:59:25.000 --> 00:59:24.000
Al Caribe Mi Cantar<br>
<i>Liuba María Hevia</i>
`;
test('real cue files keep every named track, drop talk gaps and repair broken timings',()=>{
 const t=playlist.parse(real,3600);
 assert.deepEqual(t.map(x=>x.title),['Illumination','Circe','Northside Cruise','Al Caribe Mi Cantar']);
 assert.deepEqual(t[0],{start:31,end:294,title:'Illumination',artist:'Cindy Blackman Santana'});
 assert.equal(t[2].artist,'Henry Brun & The Latin Playerz','entities decoded as text');
 assert.deepEqual([t[3].start,t[3].end],[3565,3600],'end-before-start runs to the episode end');
 for(const x of t)assert.ok(x.end>x.start&&x.start>=0);
});
test('cue text is data, never markup; non-VTT and oversized input yield nothing',()=>{
 const t=playlist.parse('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n<script>alert(1)</script>Song<br><i>Band</i>\n',10);
 assert.equal(t[0].title,'alert(1) Song');assert.ok(!/[<>]/.test(t[0].title+t[0].artist));
 assert.deepEqual(playlist.parse('<html>',10),[]);assert.deepEqual(playlist.parse('WEBVTT\n'+'x'.repeat(600*1024),10),[]);
 assert.deepEqual(playlist.parse('WEBVTT\n\n00:10:00.000 --> 00:11:00.000\nLate<br><i>X</i>',60),[],'beyond the recording');
});
