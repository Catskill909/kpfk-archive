'use strict';
// Feed text → display text (W7). The class under test: HTML entities and mixed Unicode
// forms from Confessor/QIR/WebVTT must reach the page as the characters they stand for,
// through every path feed text enters the app — not only the field where one was seen.
const {test}=require('node:test');const assert=require('node:assert/strict');
const text=require('../../../public/text');
const transcript=require('../public/qir-transcript');
const playlist=require('../public/playlist');
const {episode,showName}=require('../lib/qir/service');

// Each case: [as the feed sends it, as a listener must see it].
const CASES=[
  ['What We&rsquo;re Up Against','What We’re Up Against'],               // seen live: Bike Talk
  ['&lsquo;Carlota&rsquo; &ndash; &ldquo;Alhaja&rdquo; &mdash; notes&hellip;','‘Carlota’ – “Alhaja” — notes…'],
  ['C&ocirc;te d&rsquo;Ivoire, K&ouml;ln','Côte d’Ivoire, Köln'],         // seen live: &ocirc; &ouml;
  ['Canci&oacute;n para Mar&iacute;a &iquest;Qu&eacute; pasa?','Canción para María ¿Qué pasa?'],
  ['Caf&#233; &#xE9;t&#xe9; &#8212; &#x1F399;','Café été — 🎙'],        // decimal, hex, astral
  ['Don&#146;t','Don’t'],                                                  // Windows-1252 number
  ['What We&amp;rsquo;re Up','What We’re Up'],                             // double-encoded
  ['Black&amp;White &amp; Red','Black&White & Red'],
  ['a&nbsp;b','a b'],
  ['co&shy;operate co&shyoperate','cooperate cooperate'],                  // Confessor truncates &shy
  ['Line one<br>Line two<p>Para</p>','Line one\nLine two\nPara'],
  ['&lt;b&gt;not a tag&lt;/b&gt;','<b>not a tag</b>'],                    // decoded text is text, never markup
  ['José Martí','José Martí'],                                 // decomposed → one form (NFC)
];

test('decodes every entity style and normalises accents',()=>{
  for(const [raw,want] of CASES) assert.equal(text.plain(raw),want,raw);
});

test('decoded text compares equal however the accent was typed',()=>{
  assert.equal(text.plain('Jos&eacute;'),text.plain('José'));
  assert.equal(text.plain('Jos&#233;'),'José');
});

test('an unknown entity is left as written and reported once, never dropped silently',()=>{
  const seen=[];text.setUnknownHandler(n=>seen.push(n));
  assert.equal(text.plain('a &madeup; b &madeup; c'),'a &madeup; b &madeup; c');
  assert.deepEqual(seen,['madeup']);
  assert.equal(text.plain('AT&T and R&D'),'AT&T and R&D');                // bare ampersands untouched
  assert.equal(text.plain('&#xD800;'),'�');                           // invalid code point is visible
});

const RAW={public_id:'6a1b2c3d-1111-4222-8333-444455556666',show_key:'biketalk',air_date:'2026-05-23',air_start:'10:00:00',
  updated_at:'2026-05-23T12:00:00Z',mp3_url:'https://archive.kpfk.org/mp3/x.mp3',duration_minutes:60,category:'Arts &amp; Culture'};

test('every QIR episode text field reaches the app decoded',()=>{
  for(const [raw,want] of CASES){
    const e=episode({...RAW,title:raw,headline:raw,summary:raw,host:raw,guest:raw,show_name:raw},['https://archive.kpfk.org']);
    for(const f of ['title','headline','summary','host','guest','show_name']) assert.equal(e[f],want,f+': '+raw);
  }
  assert.equal(episode(RAW,['https://archive.kpfk.org']).category,'Arts & Culture');
});

test('show names are decoded as well as de-prefixed',()=>{
  assert.equal(showName('KPFK - Canci&oacute;n  Mexicana'),'Canción Mexicana');
});

test('transcript cues decode WebVTT entities after removing tags',()=>{
  const vtt='WEBVTT\n\n'+CASES.map(([raw],i)=>`00:00:${String(i*2).padStart(2,'0')}.000 --> 00:00:${String(i*2+1).padStart(2,'0')}.000\n<v Speaker>${raw.replace(/<[^>]*>/g,' ')}`).join('\n\n');
  const cues=transcript.parse(vtt,120);
  assert.equal(cues.length,CASES.length);
  CASES.forEach(([raw,want],i)=>{ if(!/<(br|p)/.test(raw)) assert.equal(cues[i].text,'Speaker: '+want,raw); });
  assert.equal(transcript.parse('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nTom &amp; Jerry &lt;3',60)[0].text,'Tom & Jerry <3');
});

test('song titles and artists from cue files are decoded',()=>{
  const vtt='WEBVTT\n\n00:00:00.000 --> 00:03:00.000\nCanci&oacute;n de Mar&iacute;a<br><i>Los Lobos &amp; Friends</i>\n\n00:03:00.000 --> 00:06:00.000\nDon&#146;t Stop<br><i>Bj&ouml;rk</i>';
  const songs=playlist.parse(vtt,600);
  assert.deepEqual(songs.map(s=>[s.title,s.artist]),[['Canción de María','Los Lobos & Friends'],['Don’t Stop','Björk']]);
});

test('language labels map to BCP 47 codes, as words or codes',()=>{
  const want={English:'en',en:'en',ENG:'en',Spanish:'es','Español':'es',es:'es','es-mx':'es-MX',French:'fr',Portuguese:'pt','Haitian Creole':'ht','':''};
  for(const [label,code] of Object.entries(want)) assert.equal(text.langCode(label),code,label);
  assert.equal(text.langCode('Klingon'),'');
});
