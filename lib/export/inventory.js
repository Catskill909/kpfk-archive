'use strict';

/**
 * The `inventory` export — the archive as listeners can play it, on the day it
 * is exported. Pacifica can re-derive it, but only for today: a DATED copy is
 * what makes "we lost six weeks of a show in October" a provable statement.
 *
 * Episodes are selected by AIR DATE IN THE STATION'S TIMEZONE, not UTC: a
 * board asks what aired in September in Los Angeles, and an 8 pm show would
 * otherwise land on the next UTC day. (The listening export stays on UTC days
 * because its counters were bucketed that way when recorded; air dates are
 * exact times and can be placed in any clock.) Pure — see docs/exports.md.
 */
const { localDateTime, isoUtc, readmeText, tablesManifest } = require('./common');

const SCHEMA_VERSION = 1;

const COLUMNS = {
  episodes: ['station', 'show_key', 'show_title', 'episode_id', 'episode_title', 'air_date_local', 'air_time_local',
    'air_datetime_utc', 'duration_seconds', 'category', 'host', 'audio_url', 'expires_utc'],
  shows: ['station', 'show_key', 'show_title', 'category', 'episodes', 'oldest_air_date_local',
    'newest_air_date_local', 'total_seconds'],
};

const NOTES = {
  episodes: {
    station: 'Station id.',
    show_key: 'The show\'s stable id in the Pacifica feed (station.source.altid).',
    show_title: 'The show\'s title. Empty when the feed names no title — never filled with the id.',
    episode_id: 'The episode\'s id in this app (station.source.upstream id). Stable across exports.',
    episode_title: 'The episode\'s topic from the feed, or the show title and date when it has none.',
    air_date_local: 'Air date in the station\'s timezone (YYYY-MM-DD). Episodes are selected by this date.',
    air_time_local: 'Air time in the station\'s timezone, 24-hour (HH:MM).',
    air_datetime_utc: 'The same moment in UTC, ISO 8601.',
    duration_seconds: 'Length in seconds, unrounded. 0 when the feed reports no duration.',
    category: 'Category as the feed labels it.',
    host: 'Host as the feed names them for this episode, or the show\'s host.',
    audio_url: 'The episode\'s audio file on the station\'s archive server.',
    expires_utc: 'When the feed says the audio is removed, ISO 8601 UTC. Empty when the feed does not say.',
  },
  shows: {
    station: 'Station id.',
    show_key: 'The show\'s stable id in the Pacifica feed.',
    show_title: 'The show\'s title. Empty when the feed names no title.',
    category: 'Category as the feed labels it.',
    episodes: 'Episodes of this show in the date span.',
    oldest_air_date_local: 'Earliest air date among them, station timezone.',
    newest_air_date_local: 'Latest air date among them, station timezone.',
    total_seconds: 'Their combined length in seconds, unrounded.',
  },
};

const PERSONAL = 'This file describes the station\'s programs and episodes as published in Pacifica\'s '
  + 'public feed. It contains no listener data of any kind.';

/**
 * @param {object} o
 * @param {string} o.station
 * @param {string} o.stationTimezone
 * @param {string} o.from   first local air date, YYYY-MM-DD (validated by the caller)
 * @param {string} o.to     last local air date, inclusive
 * @param {object[]} o.rows archive episode rows (the listener archive)
 * @param {(key: string) => string} o.titleFor
 * @param {string} o.scheduleBasis   the archive filter basis (schedule / primary-channel / pending)
 * @param {string} o.generatedAt
 */
function buildInventory(o) {
  const episodes = [];
  const shows = new Map();
  const rows = o.rows.slice().sort((a, b) => (a.dt - b.dt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of rows) {
    const local = localDateTime(r.dt, o.stationTimezone);
    if (local.date < o.from || local.date > o.to) continue;
    const title = o.titleFor(r.sho) || '';
    episodes.push({
      station: o.station, show_key: r.sho, show_title: title, episode_id: r.id,
      episode_title: r.episodeTitle || '', air_date_local: local.date, air_time_local: local.time,
      air_datetime_utc: isoUtc(r.dt), duration_seconds: Number.isFinite(r.durationSec) ? r.durationSec : 0,
      category: r.categoryLabel || '', host: r.host || '', audio_url: r.mp3 || '',
      expires_utc: Number.isSafeInteger(r.expiresAt) ? isoUtc(r.expiresAt) : '',
    });
    const s = shows.get(r.sho) || { station: o.station, show_key: r.sho, show_title: title, category: r.categoryLabel || '',
      episodes: 0, oldest_air_date_local: local.date, newest_air_date_local: local.date, total_seconds: 0 };
    s.episodes++;
    if (local.date < s.oldest_air_date_local) s.oldest_air_date_local = local.date;
    if (local.date > s.newest_air_date_local) s.newest_air_date_local = local.date;
    s.total_seconds += Number.isFinite(r.durationSec) ? r.durationSec : 0;
    shows.set(r.sho, s);
  }
  return {
    manifest: {
      dataset: 'inventory',
      station: o.station,
      station_timezone: o.stationTimezone,
      schema_version: SCHEMA_VERSION,
      generated_at: o.generatedAt,
      from_air_date_local: o.from,
      to_air_date_local: o.to,
      episodes: episodes.length,
      shows: shows.size,
      selection: `Episodes listeners can play in the archive (programs in the published schedule; basis "${o.scheduleBasis}"), `
        + `whose air date in ${o.stationTimezone} falls in the span.`,
      personal_data: PERSONAL,
      tables: tablesManifest(COLUMNS, NOTES),
    },
    episodes,
    shows: [...shows.values()].sort((a, b) => (a.show_title || a.show_key).localeCompare(b.show_title || b.show_key)),
  };
}

function exportFilename(m, table, ext) {
  const span = `${m.from_air_date_local}_${m.to_air_date_local}`;
  if (ext === 'csv') return `${m.station}-archive-${table}-${span}.csv`;
  if (ext === 'json') return `${m.station}-archive-${span}.json`;
  return `${m.station}-archive-${span}-README.txt`;
}

function manifestText(m) {
  return readmeText(m, `${m.station.toUpperCase()} archive export`, [
    ['Station', m.station],
    ['Air dates', `${m.from_air_date_local} to ${m.to_air_date_local} (${m.station_timezone})`],
    ['Held', `${m.episodes} episodes of ${m.shows} shows`],
    ['Generated', m.generated_at],
    ['Schema version', String(m.schema_version)],
    ['Selection', m.selection],
  ]);
}

module.exports = { buildInventory, manifestText, exportFilename, COLUMNS, SCHEMA_VERSION };
