'use strict';

/**
 * Station template, slice 1 (integration step 5b, 2026-09-29): what staff may change in the
 * studio's Station & appearance — name, frequency, city, side-menu links, social accounts and
 * the logo. Everyone with the studio sign-in may edit (Paul).
 *
 * The station profile (stations/<id>.json) stays the default. Edits are OVERRIDES on the data
 * volume, laid over it, and the result goes through the SAME validateProfile() as the profile
 * file, so an edit can never produce a station the app would refuse at boot. Nothing else is
 * editable here: feeds, timezone, identity and plugins keep coming from the profile.
 *
 * On disk, under <DATA_DIR>/station/:
 *   overrides.json          { schemaVersion, values, updatedAt }
 *   history/<stamp>.json    the overrides as they were before each change (undo, newest first)
 *   assets/logo-<hash>.ext  uploaded logos, named by content hash; never overwritten
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateProfile, LINK_KEYS, SOCIAL_KEYS } = require('./station-config');

const SCHEMA_VERSION = 1;
const TEXT_KEYS = ['name', 'frequency', 'city'];
const TEXT_MAX = 80;
const LOGO_MAX_BYTES = 1024 * 1024;
const HISTORY_KEEP = 30;

// Image type by content, never by name or declared type. SVG is refused on purpose: it can
// carry script, and a logo does not need it.
function imageType(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/**
 * Check a set of edits. Returns { ok, values, errors }: `values` is the normalised edit set
 * (only known keys; '' on a link or social account means "remove it").
 */
function checkValues(input) {
  const errors = [], values = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The edits must be an object.'] };
  for (const k of Object.keys(input)) {
    if (![...TEXT_KEYS, 'links', 'social', 'logo'].includes(k)) errors.push(`"${k}" cannot be changed here.`);
  }
  for (const k of TEXT_KEYS) {
    if (input[k] === undefined) continue;
    const v = typeof input[k] === 'string' ? input[k].trim() : '';
    if (!v) errors.push(`${k} cannot be empty.`);
    else if (v.length > TEXT_MAX) errors.push(`${k} is longer than ${TEXT_MAX} characters.`);
    else if (/[<>]/.test(v)) errors.push(`${k} cannot contain < or >.`);
    else values[k] = v;
  }
  for (const [group, keys] of [['links', LINK_KEYS], ['social', SOCIAL_KEYS]]) {
    if (input[group] === undefined) continue;
    if (!input[group] || typeof input[group] !== 'object' || Array.isArray(input[group])) { errors.push(`${group} must be an object.`); continue; }
    values[group] = {};
    for (const [k, v] of Object.entries(input[group])) {
      if (!keys.includes(k)) { errors.push(`Unknown ${group === 'links' ? 'link' : 'social account'} "${k}".`); continue; }
      if (typeof v !== 'string') { errors.push(`${k} must be text.`); continue; }
      values[group][k] = v.trim();
    }
  }
  if (input.logo !== undefined) {
    if (typeof input.logo === 'string' && /^\/station-assets\/logo-[a-f0-9]{16}\.(png|jpg|webp)$/.test(input.logo)) values.logo = input.logo;
    else errors.push('The logo must be one uploaded here.');
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** The profile with the edits laid over it, through the profile's own validation. Throws with the reason. */
function effectiveProfile(base, values, { allowLocal = false } = {}) {
  // Back to the profile file's shape: validateProfile() fills an absent optional setting with
  // null or [] (no music window, no siteUrl, no retired hosts), which it would refuse as input.
  const raw = JSON.parse(JSON.stringify(base));
  for (const [k, v] of Object.entries(raw)) if (v === null) delete raw[k];
  if (Array.isArray(raw.retiredHosts) && !raw.retiredHosts.length) delete raw.retiredHosts;
  for (const k of TEXT_KEYS) if (values[k] !== undefined) raw[k] = values[k];
  for (const group of ['links', 'social']) {
    for (const [k, v] of Object.entries(values[group] || {})) {
      if (v) raw[group] = { ...(raw[group] || {}), [k]: v };
      else if (raw[group]) delete raw[group][k];
    }
  }
  if (values.logo) raw.assets = { ...raw.assets, logo: values.logo };
  return validateProfile(raw, { allowLocal });
}

function createStationOverrides({ dataDir, base, allowLocal = false, writeJsonAtomic, now = () => Date.now() }) {
  const dir = path.join(dataDir, 'station');
  const file = path.join(dir, 'overrides.json');
  const historyDir = path.join(dir, 'history');
  const assetsDir = path.join(dir, 'assets');
  const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };

  let current = read(file, { schemaVersion: SCHEMA_VERSION, values: {}, updatedAt: null });
  // A saved file that no longer makes a valid station (a profile change since) is reported and
  // ignored at boot, never silently rewritten: the station runs on its profile until fixed.
  let bootError = null;
  let station;
  try { station = effectiveProfile(base, current.values, { allowLocal }); }
  catch (e) { bootError = e.message; station = base; }

  function history() {
    let names = [];
    try { names = fs.readdirSync(historyDir).filter((n) => n.endsWith('.json')).sort().reverse(); } catch (e) { /* none yet */ }
    return names;
  }
  function save(values, note) {
    const next = { schemaVersion: SCHEMA_VERSION, values, updatedAt: new Date(now()).toISOString() };
    const eff = effectiveProfile(base, values, { allowLocal });   // throws before anything is written
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
    writeJsonAtomic(path.join(historyDir, `${stamp}.json`), { ...current, replacedAt: next.updatedAt, note });
    writeJsonAtomic(file, next);
    for (const old of history().slice(HISTORY_KEEP)) fs.rmSync(path.join(historyDir, old), { force: true });
    current = next; station = eff; bootError = null;
    return eff;
  }
  return {
    station: () => station,
    bootError: () => bootError,
    values: () => JSON.parse(JSON.stringify(current.values)),
    updatedAt: () => current.updatedAt,
    history: () => history().map((n) => { const h = read(path.join(historyDir, n), {}); return { at: h.replacedAt || null, note: h.note || '' }; }),
    /** Validate without writing: the station the edits would make, or the reasons they can't. */
    preview(input) {
      const c = checkValues(input);
      if (!c.ok) return c;
      try { return { ok: true, values: c.values, station: effectiveProfile(base, c.values, { allowLocal }) }; }
      catch (e) { return { ok: false, errors: [e.message.replace(/^Station configuration: /, '')] }; }
    },
    apply(input, note = 'studio edit') {
      const p = this.preview(input);
      if (!p.ok) return p;
      return { ok: true, station: save(p.values, note) };
    },
    /** Put back the overrides as they were before the last change. */
    undo() {
      const [last] = history();
      if (!last) return { ok: false, errors: ['There is no change to undo.'] };
      const prev = read(path.join(historyDir, last), null);
      const eff = effectiveProfile(base, prev.values || {}, { allowLocal });
      writeJsonAtomic(file, { schemaVersion: SCHEMA_VERSION, values: prev.values || {}, updatedAt: new Date(now()).toISOString() });
      fs.rmSync(path.join(historyDir, last), { force: true });
      current = { schemaVersion: SCHEMA_VERSION, values: prev.values || {}, updatedAt: new Date(now()).toISOString() };
      station = eff; bootError = null;
      return { ok: true, station: eff };
    },
    /** Store an uploaded logo (not applied until an edit names it). */
    saveLogo(buf) {
      if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, errors: ['No image was received.'] };
      if (buf.length > LOGO_MAX_BYTES) return { ok: false, errors: [`The image is larger than ${LOGO_MAX_BYTES / 1024} KB.`] };
      const type = imageType(buf);
      if (!type) return { ok: false, errors: ['The logo must be a PNG, JPEG or WebP image.'] };
      const name = `logo-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${type}`;
      fs.mkdirSync(assetsDir, { recursive: true });
      const target = path.join(assetsDir, name);
      if (!fs.existsSync(target)) { fs.writeFileSync(target + '.tmp', buf); fs.renameSync(target + '.tmp', target); }
      return { ok: true, logo: `/station-assets/${name}` };
    },
    /** An uploaded file by its public name, or null. */
    assetFile(name) {
      if (!/^logo-[a-f0-9]{16}\.(png|jpg|webp)$/.test(name)) return null;
      const f = path.join(assetsDir, name);
      return fs.existsSync(f) ? f : null;
    },
  };
}

module.exports = { createStationOverrides, checkValues, effectiveProfile, imageType, TEXT_KEYS, LOGO_MAX_BYTES };
