'use strict';
// Feed text → display text (2026-09-25). The class under test: HTML entities and mixed
// Unicode forms in Pacifica/Confessor JSON must reach listeners as the characters they
// stand for, in every text field — not only the one where a literal "&ocirc;" was seen.
// public/text.js is shared with the Discovery plugin; keep the two copies identical.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateProfile } = require('../../lib/station-config');
const n = require('../../lib/pacifica/normalize');
const text = require('../../public/text');
const transcript = require('../../public/qir-transcript');
const root = path.join(__dirname, '../..');
const catalog = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14/fe_catalog_kpfk.json'), 'utf8'));
const profile = validateProfile(require('../../stations/kpfk.json'));

// [as the feed sends it, as a listener must see it]
const CASES = [
  ['What We&rsquo;re Up Against', 'What We’re Up Against'],
  ['C&ocirc;te d&rsquo;Ivoire, K&ouml;ln', 'Côte d’Ivoire, Köln'],            // seen in QIR copies of Confessor text
  ['Canci&oacute;n para Mar&iacute;a &iquest;Qu&eacute; pasa?', 'Canción para María ¿Qué pasa?'],
  ['&Agrave; la fa&ccedil;on de Ren&eacute;e', 'À la façon de Renée'],
  ['Caf&#233; &#xE9;t&#xe9; &#x1F399;', 'Café été 🎙'],
  ['Don&#146;t', 'Don’t'],
  ['What We&amp;rsquo;re Up', 'What We’re Up'],
  ['co&shy;operate co&shyoperate', 'cooperate cooperate'],
  ['Line one<br>Line two<p>Para</p>', 'Line one\nLine two\nPara'],
  ['&lt;b&gt;not a tag&lt;/b&gt;', '<b>not a tag</b>'],
  ['José Martí', 'José Martí'],
];

test('plain() decodes every entity style and normalises accents', () => {
  for (const [raw, want] of CASES) assert.equal(n.plain(raw), want, raw);
});

test('every listener-facing catalog field is decoded, show and episode', () => {
  for (const [raw, want] of CASES) {
    const data = catalog();
    const e = Object.values(Object.values(data.episodes.kpfk)[0])[0];
    const show = data.shows.kpfk.find(s => s.altid === e.altid);
    Object.assign(show, { name: raw, host: raw, description: raw, shortDescription: raw });
    e.pub = [{ topic: raw, guest: raw, notes: raw }];
    const out = n.normalizeCatalog(data, profile), row = out.shows.find(r => r.upstreamId === String(e.id));
    const dir = out.directory[row.sho];
    for (const [field, value] of [['name', dir.name], ['dj', dir.dj], ['desc', dir.desc], ['shortdesc', dir.shortdesc],
      ['topic', row.published[0].topic], ['guest', row.published[0].guest], ['notes', row.published[0].notes]]) {
      assert.equal(value, want, `${field}: ${raw}`);
    }
  }
});

test('an unknown entity is left as written and reported once, never dropped silently', () => {
  const seen = []; text.setUnknownHandler(name => seen.push(name));
  assert.equal(n.plain('a &madeup; b &madeup;'), 'a &madeup; b &madeup;');
  assert.deepEqual(seen, ['madeup']);
  assert.equal(n.plain('AT&T and R&D'), 'AT&T and R&D');
});

test('/discover transcript cues decode WebVTT entities', () => {
  const cues = transcript.parse('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Ana>Tom &amp; Jerry, Canci&oacute;n &lt;3', 60);
  assert.equal(cues[0].text, 'Ana: Tom & Jerry, Canción <3');
});
