'use strict';

const fs = require('fs');
const path = require('path');
const COMPONENT = /^[A-Za-z0-9_-]{1,128}$/;
const CATEGORIES = new Set(['arts', 'espanol', 'health', 'music', 'news', 'public-affairs', 'science', 'special']);

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
const LINK_KEYS = ['website', 'archive', 'donate', 'privacy', 'schedule', 'programs', 'androidApp', 'appleApp',
  'about', 'mission', 'pacifica', 'news', 'volunteer', 'contact'];
const SOCIAL_KEYS = ['x', 'facebook', 'instagram', 'youtube', 'linkedin', 'bluesky'];
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
  // Menu links are all optional except website/archive: the side menu renders an
  // item only for a link the profile supplies (lib/station-view.js menu()).
  for (const key of LINK_KEYS) {
    if (input.links && input.links[key]) links[key] = validUrl(input.links[key], null, { allowLocal });
  }
  required(links.website && links.archive, 'website and archive links required');
  const social = {};
  for (const [key, value] of Object.entries(input.social || {})) {
    required(SOCIAL_KEYS.includes(key), `unknown social network ${key}`);
    social[key] = validUrl(value, null, { allowLocal });
  }
  const assets = {};
  // share: a 1200×630 PNG for link previews; touchIcon: a PNG home-screen icon.
  // Both must be raster — social crawlers and iOS ignore SVG.
  for (const key of ['logo', 'icon', 'share', 'touchIcon']) {
    const asset = input.assets && input.assets[key];
    // The logo may also be one uploaded in the studio (lib/station-overrides.js), served from
    // the data volume at /station-assets/<content-hash>.<ext> — same-origin, as the CSP needs.
    const uploaded = key === 'logo' && typeof asset === 'string' && /^\/station-assets\/logo-[a-f0-9]{16}\.(png|jpg|webp)$/.test(asset);
    required(uploaded || (typeof asset === 'string' && /^\/assets\/[A-Za-z0-9_./-]+$/.test(asset)
      && !asset.split('/').includes('..')), `invalid ${key} asset path`);
    assets[key] = asset;
  }
  const categories = {};
  required(object(input.categories), 'category map required');
  for (const [label, category] of Object.entries(input.categories)) {
    required(CATEGORIES.has(category), `unknown category ${category}`);
    Object.defineProperty(categories, label, { value: category, enumerable: true });
  }
  // Show-type corrections (2026-09-26): upload shows whose Confessor record says Music while
  // every episode is Talk, so the Talk-only Flutter app hid them. Explicit keys only
  // ("<list>.<altid>"), never guessed: that app's licensing rule reads this type.
  const showTypes = {};
  if (input.showTypes !== undefined) {
    required(object(input.showTypes), 'showTypes must be an object');
    for (const [key, type] of Object.entries(input.showTypes)) {
      required(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) && ['Talk', 'Music'].includes(type), `invalid showTypes entry ${key}`);
      showTypes[key] = type;
    }
  }
  // discovery: the Discovery plugin is on for this station (plugins/discovery/). qir: this
  // station has a QIR transcript provider (only KPFK today); the studio can switch QIR off
  // but never on without this.
  const plugins = { discovery: false, qir: false };
  if (input.plugins !== undefined) {
    required(object(input.plugins), 'plugins must be an object');
    for (const key of ['discovery', 'qir']) {
      if (input.plugins[key] === undefined) continue;
      required(typeof input.plugins[key] === 'boolean', `plugins.${key} must be boolean`);
      plugins[key] = input.plugins[key];
    }
  }
  // The four settings below are read only by the Discovery plugin (moved in 2026-09-28).
  // hiddenShows (2026-09-25): upstream show keys left out of the show cards, for records
  // that duplicate a current show (Confessor has old and new records for BradCast and Bike
  // Talk). Their episodes stay searchable. Remove an entry once the record is retired upstream.
  const hiddenShows = [];
  if (input.hiddenShows !== undefined) {
    required(Array.isArray(input.hiddenShows), 'hiddenShows must be an array');
    for (const key of input.hiddenShows) {
      required(typeof key === 'string' && COMPONENT.test(key), `invalid hidden show key ${key}`);
      hiddenShows.push(key);
    }
  }
  // Music window (2026-09-27): music episodes are listed only this many days after air
  // (webcast music licence: archived music programmes at most two weeks, no downloads).
  // Music = category "Music", plus musicShows: explicit keys of music shows filed under
  // another category (KPFK: "Special Music Programming" is "Special Program"). Absent = no limit.
  let musicWindowDays = null;
  if (input.musicWindowDays !== undefined) {
    required(Number.isInteger(input.musicWindowDays) && input.musicWindowDays >= 1 && input.musicWindowDays <= 365, 'musicWindowDays must be an integer from 1 to 365');
    musicWindowDays = input.musicWindowDays;
  }
  const musicShows = [];
  if (input.musicShows !== undefined) {
    required(Array.isArray(input.musicShows), 'musicShows must be an array');
    for (const key of input.musicShows) {
      required(typeof key === 'string' && COMPONENT.test(key), `invalid music show key ${key}`);
      musicShows.push(key);
    }
  }
  // episodeCorrections (2026-09-27): recordings filed under the wrong show (an unrecorded
  // fund-drive special). {file: mp3 basename, show: real show key, note: why}; see
  // plugins/discovery/lib/qir/corrections.js. Remove an entry once Confessor carries the special.
  const episodeCorrections = [];
  if (input.episodeCorrections !== undefined) {
    required(Array.isArray(input.episodeCorrections), 'episodeCorrections must be an array');
    for (const c of input.episodeCorrections) {
      required(object(c) && typeof c.file === 'string' && /^[\w-]+\.mp3$/.test(c.file), `invalid episode correction file ${c && c.file}`);
      required(typeof c.show === 'string' && COMPONENT.test(c.show), `invalid episode correction show ${c.show}`);
      required(typeof c.note === 'string' && c.note.trim(), `episode correction ${c.file} needs a note`);
      episodeCorrections.push({ file: c.file, show: c.show, note: c.note });
    }
  }
  // siteUrl + retiredHosts (2026-09-29, integration step 8): the station's main address, and old
  // addresses pointed at this same app that must forward there (KPFK: the retired separate
  // Discovery site). A request for a retired host gets a permanent redirect, path kept.
  let siteUrl = null;
  if (input.siteUrl !== undefined) {
    let u = null;
    try { u = new URL(input.siteUrl); } catch (e) { u = null; }
    required(u && u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !u.username,
      'siteUrl must be an https origin such as https://podcasts.kpfk.org');
    siteUrl = u.origin;
  }
  const retiredHosts = [];
  if (input.retiredHosts !== undefined) {
    required(Array.isArray(input.retiredHosts), 'retiredHosts must be an array');
    required(siteUrl, 'retiredHosts needs siteUrl (where to send them)');
    for (const h of input.retiredHosts) {
      required(typeof h === 'string' && /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(h), `invalid retired host ${h}`);
      required(h !== new URL(siteUrl).hostname, `retired host ${h} is the site itself`);
      retiredHosts.push(h);
    }
  }
  // Project only supported fields. Unknown/private fields never reach the browser.
  return {
    schemaVersion: 1, id: input.id, provider: input.provider, name: input.name,
    frequency: input.frequency, city: input.city, timezone: input.timezone,
    primaryChannel: input.primaryChannel, feeds, liveStream, origins, links, social, assets, categories, plugins, showTypes,
    hiddenShows, musicWindowDays, musicShows, episodeCorrections, siteUrl, retiredHosts,
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
    links: { ...profile.links }, social: { ...(profile.social || {}) }, assets: { ...profile.assets },
    // Discovery's own settings (qir, hiddenShows, ...) stay out of the main page; the plugin
    // builds its page config itself (plugins/discovery/).
    plugins: { discovery: !!(profile.plugins && profile.plugins.discovery) },
    storagePrefix: `${profile.id}:`, capabilities: { rss: false, publishedSchedule: true, showDirectory: true },
  };
}
module.exports = { COMPONENT, LINK_KEYS, SOCIAL_KEYS, validateProfile, loadProfile, publicProfile, validUrl };
