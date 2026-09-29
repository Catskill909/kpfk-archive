'use strict';

/**
 * Backup and import — moving a station's data to another server.
 *
 * A backup is one JSON file: every stats month verbatim, the studio settings,
 * and a checksum per month. It is lossless on purpose — the CSV/JSON reports
 * are for reading; this is for restoring, so an import on a new server gives
 * exactly the numbers the old one had. See docs/exports.md "1c".
 *
 * Pure: the server reads and writes the files; this module builds, validates
 * and plans. Validation is an ALLOW-LIST, not a sanity check. The counters
 * carry no identifier of any kind (README), and an import is a way to put data
 * on the volume that this app did not collect — so a day record may hold the
 * known counters and maps and nothing else. A backup that carries any other
 * field is refused, not trimmed: a file that has been edited should not be
 * half-trusted.
 */
const crypto = require('crypto');

const FORMAT = 'pacifica-archive-backup';
const FORMAT_VERSION = 1;

// The day fields come from the one shared list (lib/usage-fields.js), so a counter
// the server starts collecting is backed up and restored without a change here.
const { COUNTERS, MAPS: MAP_KEYS, MAP_NAMES: MAPS } = require('../usage-fields');
const MONTH_FIELDS = new Set(['station', 'month', 'days']);
// Settings this build knows; a backup from a newer build carrying a setting this
// one cannot apply is refused rather than silently dropping it.
//   discovery: the studio's two Discovery switches, { enabled, qir } (Paul, 2026-09-29:
//   "the backup should be everything" — a moved site comes back switched on as it was).
//   station: the studio's Station & appearance edits (step 5b) and the uploaded logo they use,
//   { values, logo?: { name, base64 } }; the edits are checked like the studio checks them.
const KNOWN_SETTINGS = new Set(['discovery', 'station']);
const SWITCHES = { discovery: ['enabled', 'qir'] };
const { checkValues, imageType, LOGO_MAX_BYTES } = require('../station-overrides');

// Bounds on a body that arrives over HTTP. Generous for a real station — ten
// years of months at a few KB each is well under a megabyte — and small enough
// that a hostile or mistaken upload cannot make the server walk forever.
const MAX_MONTHS = 1200;
const MAX_KEYS_PER_MAP = 5000;

/** The checksum of one month, over its JSON text. Key order is part of it,
 *  which is fine: JSON.parse keeps the order a file was written in. */
function monthChecksum(monthObj) {
  return crypto.createHash('sha256').update(JSON.stringify(monthObj)).digest('hex');
}

/**
 * A month as a backup carries it: `station`, `month`, and days holding only the
 * known counters and maps. On a current file that is exactly what is on disk.
 * What it drops is what this app's own policy already deletes — search terms an
 * early WBAI build wrote (stripLegacyTerms in server.js) — so a backup this app
 * makes always passes this app's own import.
 */
function backupMonth(mo, station, m) {
  const days = {};
  for (const [d, rec] of Object.entries((mo && mo.days) || {})) {
    if (!isObject(rec)) continue;
    const out = {};
    for (const k of COUNTERS) if (Object.hasOwn(rec, k)) out[k] = rec[k];
    for (const k of MAPS) if (Object.hasOwn(rec, k)) out[k] = rec[k];
    days[d] = out;
  }
  return { station, month: m, days };
}

function buildBackup({ station, createdAt, appVersion, sourceInstanceId, months, settings = {} }) {
  const stats = {};
  const checksums = {};
  for (const m of Object.keys(months).sort()) {
    stats[m] = months[m];
    checksums[m] = monthChecksum(months[m]);
  }
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    station,
    createdAt,
    appVersion,
    sourceInstanceId,
    note: `Usage counters and studio settings from the ${station} Pacifica archive app. `
      + 'Contains no identifier of any kind. Restore it from the studio: Import / Export.',
    stats,
    settings,
    checksums,
  };
}

function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isCount(n) { return Number.isSafeInteger(n) && n >= 0; }
function realDay(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'))
    && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
}

/**
 * Check a parsed backup against everything this build will accept.
 * Returns { ok: true, months: {m: monthObj}, settings } or { ok: false, errors: [...] }.
 * Every problem is collected, not just the first, so the studio can show a
 * station manager the whole reason at once.
 *
 * @param {object} b          the parsed file
 * @param {object} o
 * @param {string} o.station  this server's station id
 * @param {string} o.thisMonth the current UTC month, YYYY-MM — later months cannot exist yet
 */
function validateBackup(b, { station, thisMonth }) {
  const errors = [];
  const err = (msg) => { if (errors.length < 50) errors.push(msg); };
  if (!isObject(b)) return { ok: false, errors: ['This is not a backup file (expected a JSON object).'] };
  if (b.format !== FORMAT) return { ok: false, errors: ['This is not a backup made by this app (format is not "' + FORMAT + '").'] };
  if (b.formatVersion !== FORMAT_VERSION) {
    return { ok: false, errors: [`This backup is format version ${JSON.stringify(b.formatVersion)}; this app reads version ${FORMAT_VERSION}.`] };
  }
  if (b.station !== station) {
    return { ok: false, errors: [`This backup belongs to station "${b.station}", and this server is "${station}". Backups can only be restored to the same station.`] };
  }
  if (!isObject(b.stats)) err('The backup has no "stats" section.');
  if (!isObject(b.checksums)) err('The backup has no "checksums" section.');
  if (b.settings !== undefined && !isObject(b.settings)) err('"settings" must be an object.');
  for (const [k, v] of Object.entries(isObject(b.settings) ? b.settings : {})) {
    if (!KNOWN_SETTINGS.has(k)) { err(`The backup has a setting "${k}" that this version of the app does not know. Update the app first.`); continue; }
    if (k === 'station') { for (const e of stationSettingErrors(v)) err(e); continue; }
    // Exactly the known switches, each true or false — nothing else rides along.
    const want = SWITCHES[k];
    if (!isObject(v) || Object.keys(v).length !== want.length || !want.every((s) => typeof v[s] === 'boolean')) {
      err(`The "${k}" setting must be exactly { ${want.join(', ')} }, each true or false.`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const monthKeys = Object.keys(b.stats);
  if (monthKeys.length > MAX_MONTHS) return { ok: false, errors: [`The backup has ${monthKeys.length} months; at most ${MAX_MONTHS} are accepted.`] };
  for (const m of Object.keys(b.checksums)) {
    if (!Object.hasOwn(b.stats, m)) err(`There is a checksum for ${JSON.stringify(m)} but no data for it.`);
  }
  const months = {};
  for (const m of monthKeys) {
    const where = `Month ${JSON.stringify(m)}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { err(`${where} is not a month (expected YYYY-MM).`); continue; }
    if (m > thisMonth) { err(`${where} is in the future.`); continue; }
    const mo = b.stats[m];
    if (!isObject(mo)) { err(`${where} is not an object.`); continue; }
    if (b.checksums[m] !== monthChecksum(mo)) {
      err(`${where} does not match its checksum — the file was changed or damaged after it was made.`);
      continue;
    }
    for (const f of Object.keys(mo)) if (!MONTH_FIELDS.has(f)) err(`${where} has an unexpected field "${f}".`);
    if (mo.station !== station) err(`${where} is stamped for station "${mo.station}".`);
    if (mo.month !== m) err(`${where} says it is month "${mo.month}".`);
    if (!isObject(mo.days)) { err(`${where} has no days.`); continue; }
    for (const [d, rec] of Object.entries(mo.days)) {
      const dw = `Day ${JSON.stringify(d)}`;
      if (!realDay(d) || d.slice(0, 7) !== m) { err(`${dw} is not a date in ${m}.`); continue; }
      if (!isObject(rec)) { err(`${dw} is not an object.`); continue; }
      for (const [f, v] of Object.entries(rec)) {
        if (COUNTERS.includes(f)) {
          if (!isCount(v)) err(`${dw}: "${f}" must be a whole number of zero or more.`);
        } else if (MAPS.includes(f)) {
          if (!isObject(v)) { err(`${dw}: "${f}" must be an object.`); continue; }
          const entries = Object.entries(v);
          if (entries.length > MAX_KEYS_PER_MAP) err(`${dw}: "${f}" has too many entries.`);
          for (const [k, n] of entries) {
            if (!MAP_KEYS[f](k)) err(`${dw}: "${f}" has an unexpected key ${JSON.stringify(k).slice(0, 80)}.`);
            if (!isCount(n)) err(`${dw}: "${f}.${k}" must be a whole number of zero or more.`);
          }
        } else {
          err(`${dw} has an unexpected field "${f}". A backup holds counters only.`);
        }
      }
    }
    months[m] = mo;
  }
  // A new station can have settings (its look, its switches) before any listening: that is
  // still worth restoring. Only a file with neither is empty.
  if (!monthKeys.length && !Object.keys(isObject(b.settings) ? b.settings : {}).length) err('The backup contains no months and no settings.');
  return errors.length ? { ok: false, errors } : { ok: true, months, settings: b.settings || {} };
}

/** Headline totals of one month, for the preview table. */
function monthSummary(mo) {
  const t = { days: 0, pageviews: 0, plays: 0, listenSeconds: 0, liveSeconds: 0 };
  for (const rec of Object.values((mo && mo.days) || {})) {
    if (!rec) continue;
    t.days++;
    for (const k of ['pageviews', 'plays', 'listenSeconds', 'liveSeconds']) if (Number.isFinite(rec[k])) t[k] += rec[k];
  }
  return t;
}

/**
 * What an import would do, month by month.
 * @param {object} incoming  validated backup months {m: monthObj}
 * @param {object} current   this server's months {m: monthObj}, only those that exist
 */
function planImport(incoming, current) {
  const all = [...new Set([...Object.keys(incoming), ...Object.keys(current)])].sort().reverse();
  return all.map((m) => {
    const inB = Object.hasOwn(incoming, m), here = Object.hasOwn(current, m);
    const action = !inB ? 'kept'
      : !here ? 'new'
      : monthChecksum(current[m]) === monthChecksum(incoming[m]) ? 'identical'
      : 'replace';
    return {
      month: m,
      action,
      backup: inB ? monthSummary(incoming[m]) : null,
      server: here ? monthSummary(current[m]) : null,
    };
  });
}

/** Problems with a backup's Station & appearance part (none = fine). */
function stationSettingErrors(v) {
  const out = [];
  if (!isObject(v) || !isObject(v.values) || Object.keys(v).some((k) => !['values', 'logo'].includes(k))) return ['The "station" setting must be { values, logo? }.'];
  const c = checkValues(v.values);
  if (!c.ok) out.push(...c.errors.map((e) => `Station & appearance: ${e}`));
  if (v.logo !== undefined) {
    const buf = isObject(v.logo) && typeof v.logo.base64 === 'string' ? Buffer.from(v.logo.base64, 'base64') : null;
    const hash = buf && crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    if (!buf || !buf.length || buf.length > LOGO_MAX_BYTES || !imageType(buf) || v.logo.name !== `logo-${hash}.${imageType(buf)}`) out.push('Station & appearance: the logo in the backup is not a valid image, or does not match its name.');
    else if (v.values.logo !== `/station-assets/${v.logo.name}`) out.push('Station & appearance: the logo in the backup is not the one its edits use.');
  } else if (v.values.logo) out.push('Station & appearance: the edits use an uploaded logo that is not in the backup.');
  return out;
}

/**
 * What an import would do to the switches.
 * @param {object} incoming  validated backup settings, e.g. { discovery: { enabled, qir } }
 * @param {object} current   this server's, same shape; a key it lacks is a feature this server does not have
 * @returns {{group, name, backup, server, action: 'set'|'identical'|'unavailable'}[]}
 */
function planSettings(incoming, current) {
  const out = [];
  for (const [group, values] of Object.entries(incoming || {})) {
    if (group === 'station') {
      // One row: the edit set as a whole (it is applied or not as one).
      const here = current && current.station;
      const n = (v) => Object.keys((v && v.values) || {}).length;
      out.push({ group, name: 'edits', backup: n(values), server: here ? n(here) : null,
        action: !here ? 'unavailable' : JSON.stringify(here.values) === JSON.stringify(values.values) ? 'identical' : 'set' });
      continue;
    }
    for (const name of SWITCHES[group] || []) {
      const here = current && current[group];
      out.push({ group, name, backup: values[name], server: here ? here[name] : null,
        action: !here ? 'unavailable' : here[name] === values[name] ? 'identical' : 'set' });
    }
  }
  return out;
}

module.exports = {
  FORMAT, FORMAT_VERSION, SWITCHES, backupMonth, buildBackup, validateBackup, planImport, planSettings, monthSummary, monthChecksum,
};
