'use strict';
// The transcript panel's layer (step 4e). The class of bug: a later .rv-along rule silently
// overriding the layer, so on phones the main page's sticky top bar (50) and search row (40)
// sat on top of the panel (2026-09-28). Read like the browser does: the last rule wins.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../public/along.css'), 'utf8');
const hostCss = fs.readFileSync(path.join(__dirname, '../../../public/styles.css'), 'utf8');
const lastZ = (text, sel) => {
  const all = [...text.matchAll(new RegExp('(^|[}\\s])' + sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}', 'g'))]
    .map(m => (/z-index\s*:\s*(\d+)/.exec(m[2]) || [])[1]).filter(Boolean).map(Number);
  return all[all.length - 1];
};
test('the panel sits above the main page sticky bars and below every popup', () => {
  const panel = lastZ(css, '.rv-along');
  for (const sel of ['.appbar', '.controls-row']) assert.ok(panel > lastZ(hostCss, sel), `${sel} (${lastZ(hostCss, sel)}) is under the panel (${panel})`);
  for (const sel of ['.menu-scrim', '.sheet-scrim', '.sched-scrim']) assert.ok(panel < lastZ(hostCss, sel), `${sel} (${lastZ(hostCss, sel)}) is above the panel (${panel})`);
});
