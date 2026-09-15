'use strict';

const fs = require('fs');
const path = require('path');
const COMPONENT = /^[A-Za-z0-9_-]{1,128}$/;
const CATEGORIES = new Set(['arts', 'health', 'music', 'news', 'public-affairs', 'science', 'special']);

function required(value, message) {
  if (!value) throw new Error(`Station configuration: ${message}`);
}
function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function validUrl(value, origins, { allowLocal = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid absolute URL'); }
  const local = allowLocal && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  required(url.protocol === 'https:' || (local && url.protocol === 'http:'), 'HTTPS URL required');
  required(!url.username && !url.password && !url.hash, 'URL credentials and fragments are forbidden');
  if (origins) required(origins.includes(url.origin), `unapproved origin ${url.origin}`);
  return url.href;
}
function validateProfile(input, { allowLocal = false } = {}) {
  required(object(input), 'profile must be an object');
  required(input.schemaVersion === 1, 'unsupported schemaVersion');
  required(input.provider === 'pacifica-json', 'provider must be pacifica-json');
  for (const key of ['id', 'primaryChannel']) required(COMPONENT.test(input[key] || ''), `invalid ${key}`);
  for (const key of ['name', 'frequency', 'city', 'timezone']) {
    required(typeof input[key] === 'string' && input[key].trim(), `${key} is required`);
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(0); }
  catch { throw new Error('Station configuration: invalid timezone'); }
  required(object(input.origins) && object(input.feeds), 'origins and feeds are required');
  const origins = {};
  for (const kind of ['feeds', 'audio', 'artwork']) {
    required(Array.isArray(input.origins[kind]) && input.origins[kind].length, `${kind} origins required`);
    origins[kind] = input.origins[kind].map(value => {
      const url = new URL(validUrl(value, null, { allowLocal }));
      required(url.pathname === '/' && !url.search, 'origin must not contain a path or query');
      return url.origin;
    });
  }
  const feeds = {};
  for (const key of ['catalog', 'channels']) feeds[key] = validUrl(input.feeds[key], origins.feeds, { allowLocal });
  const liveStream = validUrl(input.liveStream, origins.audio, { allowLocal });
  const links = {};
  for (const key of ['website', 'archive', 'donate', 'privacy', 'schedule', 'programs']) {
    if (input.links && input.links[key]) links[key] = validUrl(input.links[key], null, { allowLocal });
  }
  required(links.website && links.archive, 'website and archive links required');
  const assets = {};
  // share: a 1200×630 PNG for link previews; touchIcon: a PNG home-screen icon.
  // Both must be raster — social crawlers and iOS ignore SVG.
  for (const key of ['logo', 'icon', 'share', 'touchIcon']) {
    const asset = input.assets && input.assets[key];
    required(typeof asset === 'string' && /^\/assets\/[A-Za-z0-9_./-]+$/.test(asset)
      && !asset.split('/').includes('..'), `invalid ${key} asset path`);
    assets[key] = asset;
  }
  const categories = {};
  required(object(input.categories), 'category map required');
  for (const [label, category] of Object.entries(input.categories)) {
    required(CATEGORIES.has(category), `unknown category ${category}`);
    Object.defineProperty(categories, label, { value: category, enumerable: true });
  }
  // Project only supported fields. Unknown/private fields never reach the browser.
  return {
    schemaVersion: 1, id: input.id, provider: input.provider, name: input.name,
    frequency: input.frequency, city: input.city, timezone: input.timezone,
    primaryChannel: input.primaryChannel, feeds, liveStream, origins, links, assets, categories,
  };
}
function loadProfile(filename, { root = process.cwd(), env = process.env, allowLocal = false } = {}) {
  required(filename, 'STATION_PROFILE is required; this copy will not default to WBAI');
  const profile = validateProfile(JSON.parse(fs.readFileSync(path.resolve(root, filename), 'utf8')), { allowLocal });
  for (const [key, value] of [['STATION_ID', profile.id], ['STATION_TZ', profile.timezone]]) {
    required(!env[key] || env[key] === value, `${key} conflicts with the profile`);
  }
  return profile;
}
function publicProfile(profile) {
  return {
    schemaVersion: 1, id: profile.id, provider: profile.provider, name: profile.name,
    frequency: profile.frequency, label: `${profile.name} ${profile.frequency}`, city: profile.city,
    timezone: profile.timezone, primaryChannel: profile.primaryChannel, liveStream: profile.liveStream,
    links: { ...profile.links }, assets: { ...profile.assets },
    storagePrefix: `${profile.id}:`, capabilities: { rss: false, publishedSchedule: true, showDirectory: true },
  };
}
module.exports = { COMPONENT, validateProfile, loadProfile, publicProfile, validUrl };
