'use strict';
// Permanent links (public/links.js), shared by the server's link previews and the page. The class
// of bug: a posted link that dies (rename, rotation) or opens the wrong show.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../../public/links');
const rows = [
  { id: 'kpfk.kpfk.100', sho: 'kpfk.kpfk.onconta', title: 'On Contact', dt: 100 },
  { id: 'kpfk.kpfk.200', sho: 'kpfk.kpfk.onconta', title: 'On Contact', dt: 200 },
  { id: 'kpfk.2kpfk.300', sho: 'kpfk.2kpfk.biketalk', title: 'Bike Talk Podcast', dt: 300 },
];
const directory = { 'kpfk.kpfk.onconta': { name: 'The Chris Hedges Report' }, 'kpfk.2kpfk.biketalk': { name: 'Bike Talk Podcast' } };

test('links are built from the station show code and the episode number', () => {
  assert.equal(L.showPath('kpfk.kpfk.onconta'), '/show/onconta');
  assert.equal(L.episodePath(rows[0]), '/show/onconta/100');
  assert.equal(L.episodePath(rows[2]), '/show/biketalk/300', 'upload-list shows too');
});

test('reading a link: show, show + episode, trailing slash, case; anything else is not a link', () => {
  assert.deepEqual(L.parse('/show/onconta'), { show: 'onconta', episode: '' });
  assert.deepEqual(L.parse('/show/OnConta/100/'), { show: 'onconta', episode: '100' });
  for (const p of ['/', '/shows/onconta', '/show/', '/show/a/b/c', '/discover', '/show/%E0%A4%A']) assert.equal(L.parse(p), null, p);
});

test('a show link opens the show on its latest episode, by code or by name', () => {
  for (const code of ['onconta', 'the-chris-hedges-report']) {
    const r = L.resolve(L.parse('/show/' + code), rows, directory);
    assert.equal(r.sho, 'kpfk.kpfk.onconta', code);
    assert.equal(r.row.id, 'kpfk.kpfk.200', 'latest');
    assert.equal(r.rotated, false);
  }
});

test('an episode link opens that episode; once rotated out, the show latest with rotated: true', () => {
  assert.equal(L.resolve(L.parse('/show/onconta/100'), rows, directory).row.id, 'kpfk.kpfk.100');
  const gone = L.resolve(L.parse('/show/onconta/999'), rows, directory);
  assert.deepEqual([gone.row.id, gone.rotated], ['kpfk.kpfk.200', true]);
});

test('an episode number from another show never opens that other show', () => {
  const r = L.resolve(L.parse('/show/onconta/300'), rows, directory);
  assert.deepEqual([r.sho, r.row.id, r.rotated], ['kpfk.kpfk.onconta', 'kpfk.kpfk.200', true]);
});

test('an unknown show is null (the page says so and lists everything)', () => {
  assert.equal(L.resolve(L.parse('/show/nope'), rows, directory), null);
  assert.equal(L.resolve(null, rows, directory), null);
});

test('the show code keeps working after a rename; only the name link follows the new name', () => {
  const renamed = { ...directory, 'kpfk.kpfk.onconta': { name: 'On Contact' } };
  assert.equal(L.resolve(L.parse('/show/onconta'), rows, renamed).sho, 'kpfk.kpfk.onconta');
  assert.equal(L.resolve(L.parse('/show/the-chris-hedges-report'), rows, renamed), null);
});
