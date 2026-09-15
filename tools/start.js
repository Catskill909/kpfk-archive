'use strict';
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, STATION_PROFILE: process.env.STATION_PROFILE || 'stations/kpfk.json',
  PORT: process.env.PORT || '8081', DATA_DIR: process.env.DATA_DIR || path.join(root, 'data') };
delete env.STATION_PROVIDER;
const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
