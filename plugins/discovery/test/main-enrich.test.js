'use strict';
// Step 4a: Discovery adds QIR details to the main page's episodes. The class of bug to catch:
// a plugin overwriting or duplicating what the station's feed carries, or showing a pending
// episode (no QIR processing yet) as if it had a summary.
const test = require('node:test'), assert = require('node:assert/strict');
const { index, enrich } = require('../public/main.js');
const mp3 = k => `https://archive.kpfk.org/mp3/kpfk_260927_${k}.mp3`;
const catalog = { episodes: [
  { public_id: 'a', mp3_url: mp3('080000dn'), headline: 'QIR headline A', summary: 'QIR summary A' },
  { public_id: 'b', mp3_url: mp3('090000th'), headline: 'QIR headline B', summary: 'QIR summary B' },
  { public_id: 'p', mp3_url: mp3('100000pending'), headline: '', summary: '', pending: true },
] };

test('adds the QIR headline as title and summary as notes where the feed has none', () => {
  const rows = [{ id: '1', mp3: mp3('080000dn'), published: [] }];
  assert.equal(enrich(rows, index(catalog)), 1);
  assert.deepEqual(rows[0].qirEpisode, { id: 'a', headline: 'QIR headline A', summary: 'QIR summary A' });
  assert.equal(rows[0].qir, undefined, 'never row.qir: that marks station-clock times (just-aired.js)');
  assert.equal(rows[0].published[0].topic, 'QIR headline A');
  assert.equal(rows[0].episodeDesc, 'QIR summary A');
});

test("never overwrites the station feed's own title or notes", () => {
  const rows = [{ id: '2', mp3: mp3('090000th'), published: [{ host: 'H', guest: '', topic: 'Feed topic', notes: '' }], episodeDesc: 'Feed notes' }];
  enrich(rows, index(catalog));
  assert.deepEqual(rows[0].published.map(p => p.topic), ['Feed topic']);
  assert.equal(rows[0].episodeDesc, 'Feed notes');
  assert.equal(rows[0].qirEpisode.id, 'b', 'the transcript id is still attached');
});

test('pending episodes and unmatched rows are left alone', () => {
  const rows = [{ id: '3', mp3: mp3('100000pending') }, { id: '4', mp3: mp3('110000other') }];
  assert.equal(enrich(rows, index(catalog)), 0);
  assert.deepEqual(rows, [{ id: '3', mp3: mp3('100000pending') }, { id: '4', mp3: mp3('110000other') }]);
});

test('running it again adds nothing twice (the host re-runs it on refresh)', () => {
  const rows = [{ id: '1', mp3: mp3('080000dn') }];
  const byMp3 = index(catalog);
  enrich(rows, byMp3); enrich(rows, byMp3);
  assert.equal(rows[0].published.length, 1);
});

test('before the catalog arrives nothing changes', () => {
  const rows = [{ id: '1', mp3: mp3('080000dn') }];
  assert.equal(enrich(rows, null), 0);
  assert.deepEqual(rows, [{ id: '1', mp3: mp3('080000dn') }]);
});
