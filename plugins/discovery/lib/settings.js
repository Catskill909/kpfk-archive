'use strict';
// Discovery's persisted settings (moved from kpfk-discovery-plugin lib/admin.js, 2026-09-28).
// Stored on the app's data volume at <DATA_DIR>/discovery/settings.json. Defaults apply
// when the file is missing; a present but unreadable file is an error, never silently
// replaced with defaults. The studio's Discovery tab (integration step 5) writes it.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({ schemaVersion: 1, plugins: { qir: { enabled: true } }, updatedAt: null });
function validSettings(value) {
  return !!value && value.schemaVersion === 1 && value.plugins && value.plugins.qir
    && typeof value.plugins.qir.enabled === 'boolean';
}
// dir null keeps settings in memory only (offline tests); the server always passes a directory.
function createSettings({ dir, now = Date.now }) {
  const file = dir ? path.join(dir, 'settings.json') : null;
  let current;
  try {
    if (!file) throw Object.assign(new Error('memory only'), { code: 'ENOENT' });
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validSettings(parsed)) throw new Error('Invalid settings file ' + file);
    current = parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    current = structuredClone(DEFAULTS);
  }
  function save(next) {
    if (!validSettings(next)) throw new Error('Invalid settings');
    if (!file) { current = next; return; }
    fs.mkdirSync(dir, { recursive: true });
    // Write-then-rename so a crash mid-write can never leave a truncated file.
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmp, file);
    current = next;
  }
  return {
    get: () => structuredClone(current),
    setQir(enabled) { save({ ...structuredClone(current), plugins: { ...current.plugins, qir: { enabled } }, updatedAt: new Date(now()).toISOString() }); },
  };
}

module.exports = { createSettings, validSettings };
