'use strict';
// Stats step 6: the page sends feature clicks by name and the server keeps only
// names on its UI_COUNTERS list. A name sent by the page but missing from the list
// (a typo, or a new counter added on one side only) would be dropped silently and
// its studio tile would read zero forever, so check every name the page code sends.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('every feature-click name the page sends is one the server counts', () => {
  const server = require('../../lib/usage-fields').UI_COUNTERS;   // the one list the server counts
  const files = ['public/app.js', 'public/track.js', ...fs.readdirSync(path.join(root, 'plugins/discovery/public'))
    .filter(f => f.endsWith('.js')).map(f => 'plugins/discovery/public/' + f)];
  const sent = new Set();
  for (const f of files) {
    const src = read(f);
    // Every call site: count('x'), tally('x'), ArchiveStats.count('x'), and any quoted
    // names inside a ternary argument (tally(kind === 'songs' ? 'a' : 'b')).
    for (const m of src.matchAll(/\b(?:count|tally|ArchiveStats\??\.count)\(([^()]*)\)/g)) {
      for (const q of m[1].matchAll(/'([A-Za-z]+)'/g)) if (q[1] !== 'songs') sent.add(q[1]);
    }
    // app.js picks its name into a variable first.
    for (const q of src.matchAll(/'(summaryShown|pendingShown)'/g)) sent.add(q[1]);
  }
  assert.ok(sent.size >= 6, 'found the call sites: ' + [...sent].join(', '));
  for (const name of sent) assert.ok(server.includes(name), `page sends "${name}" but the server does not count it`);
  for (const name of server) assert.ok(sent.has(name), `server counts "${name}" but no page code sends it`);
});
