'use strict';
// Paul, 2026-09-28: "make sure modal alerts are beautifully styled in the app and never the
// default browser". The class of bug: a window.confirm / alert / prompt added anywhere in the
// app's browser code. Confirmations use StudioDialog (public/studio-dialog.js) or the app's
// own dialogs. This fails on any browser pop-up in a file the browser loads.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '../..');
const dirs = ['public', 'admin', 'plugins/discovery/public'];
const POPUP = /(^|[^.\w])(?:window\.)?(confirm|alert|prompt)\s*\(/;

function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(js|html)$/.test(e.name) ? [path.join(dir, e.name)] : []);
}

test('no browser pop-ups (confirm / alert / prompt) anywhere in the app', () => {
  const found = [];
  for (const f of dirs.flatMap(files)) {
    fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');   // ignore comments that mention them
      if (POPUP.test(code)) found.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(found, [], 'use StudioDialog.confirm or the app\'s own dialogs instead');
});

test('the check itself sees a pop-up (so a pass means none, not a blind check)', () => {
  for (const line of ["if (!window.confirm('x')) return;", "alert('hi')", "  prompt('name')"]) assert.ok(POPUP.test(line), line);
  for (const line of ['StudioDialog.confirm({})', 'x.alertBox()', 'confirmLabel: 1']) assert.ok(!POPUP.test(line), line);
});
