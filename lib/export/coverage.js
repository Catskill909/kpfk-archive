'use strict';

/**
 * The `coverage` export — where the data is thin, one row per show in
 * Pacifica's catalog (every source, scheduled or not). It is a snapshot of
 * right now, so it takes no date span.
 *
 * This is the evidence that went to Pacifica's feed developer by hand on
 * 2026-09-15 (docs/kpfk/artwork-evidence-2026-09-15/): which programs have no
 * artwork, no description, no episodes, or none recently. Reads the catalog —
 * the untouched mirror — so a show hidden from listeners still appears, with
 * the columns that say why. Pure — see docs/exports.md.
 */
const { localDateTime, readmeText, tablesManifest } = require('./common');

const SCHEMA_VERSION = 1;

const COLUMNS = {
  shows: ['station', 'show_key', 'show_title', 'source', 'category', 'in_published_schedule', 'shown_to_listeners',
    'has_artwork', 'has_description', 'has_host', 'episodes_in_catalog', 'newest_air_date_local', 'days_since_newest_episode'],
};

const NOTES = {
  shows: {
    station: 'Station id.',
    show_key: 'The show\'s stable id in the Pacifica feed (station.source.altid).',
    show_title: 'The show\'s title. Empty when the feed names no title — itself a gap worth fixing.',
    source: 'The feed source the show belongs to (the on-air channel, or an archive-only upload source).',
    category: 'Category as the feed labels it. Empty when it has none.',
    in_published_schedule: 'true when the show appears in the published schedule weeks. Empty when the schedule could not be read at export time.',
    shown_to_listeners: 'true when the app shows the show\'s episodes to listeners.',
    has_artwork: 'true when the catalog gives the show an image.',
    has_description: 'true when the catalog gives the show a description.',
    has_host: 'true when the catalog names a host.',
    episodes_in_catalog: 'Episodes the catalog holds for this show.',
    newest_air_date_local: 'Air date of its newest episode, station timezone. Empty with no episodes.',
    days_since_newest_episode: 'Whole days from that episode\'s air time to the export. Empty with no episodes.',
  },
};

const PERSONAL = 'This file describes the station\'s programs as published in Pacifica\'s public feed. '
  + 'It contains no listener data of any kind.';

/**
 * @param {object} o
 * @param {string} o.station
 * @param {string} o.stationTimezone
 * @param {object} o.directory      catalog directory {key: info}
 * @param {object[]} o.rows         catalog episode rows (every source)
 * @param {Set<string>} o.listenerKeys  shows the listener archive holds
 * @param {Set<string>|null} o.scheduleKeys  shows in the published schedule, or null when unknown
 * @param {(key: string) => string} o.titleFor
 * @param {number} o.now            epoch ms at export
 * @param {string} o.generatedAt
 */
function buildCoverage(o) {
  const perShow = new Map();
  for (const r of o.rows) {
    const s = perShow.get(r.sho) || { n: 0, newest: 0 };
    s.n++;
    if (r.dt > s.newest) s.newest = r.dt;
    perShow.set(r.sho, s);
  }
  const shows = Object.keys(o.directory).sort().map((key) => {
    const info = o.directory[key] || {};
    const eps = perShow.get(key);
    return {
      station: o.station,
      show_key: key,
      show_title: o.titleFor(key) || '',
      source: info.archiveSource || '',
      category: info.categoryLabel || '',
      in_published_schedule: o.scheduleKeys ? o.scheduleKeys.has(key) : '',
      shown_to_listeners: o.listenerKeys.has(key),
      has_artwork: !!info.photoUrl,
      has_description: !!(info.desc || info.shortdesc),
      has_host: !!info.dj,
      episodes_in_catalog: eps ? eps.n : 0,
      newest_air_date_local: eps ? localDateTime(eps.newest, o.stationTimezone).date : '',
      days_since_newest_episode: eps ? Math.max(0, Math.floor((o.now / 1000 - eps.newest) / 86400)) : '',
    };
  });
  const count = (f) => shows.filter(f).length;
  return {
    manifest: {
      dataset: 'coverage',
      station: o.station,
      station_timezone: o.stationTimezone,
      schema_version: SCHEMA_VERSION,
      generated_at: o.generatedAt,
      as_of_utc: o.generatedAt,
      shows: shows.length,
      summary: {
        in_published_schedule: o.scheduleKeys ? count((s) => s.in_published_schedule === true) : null,
        shown_to_listeners: count((s) => s.shown_to_listeners),
        without_artwork: count((s) => !s.has_artwork),
        without_description: count((s) => !s.has_description),
        without_episodes: count((s) => s.episodes_in_catalog === 0),
      },
      schedule_known: !!o.scheduleKeys,
      personal_data: PERSONAL,
      tables: tablesManifest(COLUMNS, NOTES),
    },
    shows,
  };
}

function exportFilename(m, table, ext) {
  const day = m.as_of_utc.slice(0, 10);
  if (ext === 'csv') return `${m.station}-coverage-${table}-${day}.csv`;
  if (ext === 'json') return `${m.station}-coverage-${day}.json`;
  return `${m.station}-coverage-${day}-README.txt`;
}

function manifestText(m) {
  const s = m.summary;
  return readmeText(m, `${m.station.toUpperCase()} coverage export`, [
    ['Station', m.station],
    ['As of', m.as_of_utc],
    ['Shows in catalog', String(m.shows)],
    ['In schedule', s.in_published_schedule === null ? 'unknown (schedule unavailable at export)' : String(s.in_published_schedule)],
    ['Shown to listeners', String(s.shown_to_listeners)],
    ['Without artwork', String(s.without_artwork)],
    ['Without description', String(s.without_description)],
    ['Without episodes', String(s.without_episodes)],
    ['Station timezone', m.station_timezone],
    ['Schema version', String(m.schema_version)],
  ]);
}

module.exports = { buildCoverage, manifestText, exportFilename, COLUMNS, SCHEMA_VERSION };
