'use strict';
// The side menu is rendered from the station profile (lib/station-view.js menu()).
// Copied from WBAI, KPFK's menu had been emptied to a single link; the markup now
// follows stations/<id>.json, so these tests assert the rendered page, not the builder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const { validateProfile } = require('../../lib/station-config');
const { render } = require('../../lib/station-view');
const raw = () => JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const menuOf = html => html.slice(html.indexOf('id="menuPanel"'), html.indexOf('</aside>', html.indexOf('id="menuPanel"')));
const hrefs = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));

test('every configured KPFK link and social account is in the rendered menu', () => {
  const profile = validateProfile(raw());
  const menu = menuOf(render(template, profile));
  assert.doesNotMatch(render(template, profile), /\{\{(menu|station)\./, 'no unrendered placeholders');
  const found = hrefs(menu);
  for (const [key, url] of Object.entries(profile.links)) {
    if (key === 'archive') continue;                 // the archive is this site, not a menu item
    assert.ok(found.includes(url), `menu links ${key}: ${url}`);
  }
  for (const url of Object.values(profile.social)) assert.ok(found.includes(url), `social ${url}`);
  for (const id of ['menuSchedule', 'menuDonate', 'menuPrivacy']) {
    assert.equal(menu.split(`id="${id}"`).length - 1, 1, `exactly one #${id} for app.js`);
  }
  assert.match(menu, /aria-label="KPFK on YouTube"/);
  assert.deepEqual([...menu.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]), ['Listen', 'Station', 'Support &amp; contact']);
  assert.match(menu, /<span>kpfk\.org<\/span>/);
  assert.doesNotMatch(menu, /WBAI|wbai\.org/);
});

test('an unconfigured link drops its item, and an empty group drops entirely', () => {
  const p = raw();
  delete p.links.about; delete p.links.pacifica; delete p.links.news; delete p.links.androidApp;
  const menu = menuOf(render(template, validateProfile(p)));
  assert.doesNotMatch(menu, /<h2>Station<\/h2>/, 'no empty Station heading');
  assert.doesNotMatch(menu, /Android App/);
  assert.match(menu, /Apple App/, 'unrelated items remain');
  assert.match(menu, /id="menuSchedule"/, 'Schedule is in-app and always present');
});

test('menu text is escaped, and only HTTPS links and known networks are accepted', () => {
  const p = raw(); p.name = 'K<b>&"PFK';
  const menu = menuOf(render(template, validateProfile(p)));
  assert.doesNotMatch(menu, /<b>/); assert.match(menu, /K&lt;b&gt;&amp;&quot;PFK/);
  const insecure = raw(); insecure.links.news = 'http://www.kpfk.org/news/';
  assert.throws(() => validateProfile(insecure), /HTTPS/);
  const unknown = raw(); unknown.social.myspace = 'https://myspace.com/kpfk';
  assert.throws(() => validateProfile(unknown), /unknown social network/);
});
