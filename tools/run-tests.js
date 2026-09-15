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
const result = spawnSync(process.execPath, ['--test', 'test/pacifica/normalize.test.js', 'test/pacifica/service.test.js',
  'test/pacifica/http.test.js'], { cwd: root, env, stdio: 'inherit' });
process.exit(result.status || (result.error ? 1 : 0));
