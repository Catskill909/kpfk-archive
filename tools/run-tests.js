'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const legacy = ['feed-scan/selftest.js', 'feed-merge/merge-tests.js', 'feed-retirement/retirement-tests.js',
  'photomap/selftest.js', 'storage/mount-tests.js', 'studio/studio-tests.js', 'usage/durability-tests.js',
  'schedule-audit/selftest.js', 'storage-guard/selftest.js', 'feeds-quarantine/quarantine-tests.js'];
const env = { ...process.env, STATION_PROVIDER: 'legacy-xml' };
delete env.STATION_PROFILE; delete env.STATION_ID; delete env.STATION_TZ;
for (const file of legacy) {
  const result = spawnSync(process.execPath, [path.join('test', file)], { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Every test/pacifica/*.test.js runs. A hand-kept list silently skipped a new file once
// (audio-probe.test.js, 2026-09-26): the suite reported green without running it.
const files = require('fs').readdirSync(path.join(root, 'test/pacifica')).filter(f => f.endsWith('.test.js')).sort().map(f => 'test/pacifica/' + f);
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, env, stdio: 'inherit' });
process.exit(result.status || (result.error ? 1 : 0));
