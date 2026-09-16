'use strict';

/**
 * The `profile` export — the station's own public settings, for a station
 * setting this app up and for Pacifica comparing stations (docs/exports.md,
 * phase 4).
 *
 * Built by ADDING to the projection /api/station already serves
 * (publicProfile in lib/station-config.js), never by trimming the raw profile:
 * a field added to stations/<id>.json later — a secret, a feed address — can
 * then never reach this file by being forgotten in a list of things to remove.
 * The one addition is the category map, a lookup from Pacifica's category
 * names to this app's groups.
 */
const { readmeText } = require('./common');

const SCHEMA_VERSION = 1;
// No tables: the profile is nested, so it is JSON (plus a read-me) only.
const COLUMNS = {};

const PERSONAL = 'This file holds the station\'s public settings only — the same values the listener app '
  + 'publishes at /api/station, plus its category map. It contains no listener data, no password, no '
  + 'feed address and no server configuration.';

/**
 * @param {object} o
 * @param {object} o.publicProfile  publicProfile(station) — exactly what /api/station serves
 * @param {object} o.categories     the profile's category map {Pacifica label: app group}
 * @param {object[]} o.datasets     [{ name, schemaVersion }] the exports this build offers
 * @param {string} o.appVersion
 * @param {string} o.generatedAt
 */
function buildProfile(o) {
  const categories = {};
  for (const [label, group] of Object.entries(o.categories || {})) {
    if (typeof label === 'string' && typeof group === 'string') categories[label] = group;
  }
  return {
    manifest: {
      dataset: 'profile',
      station: o.publicProfile.id,
      schema_version: SCHEMA_VERSION,
      generated_at: o.generatedAt,
      app_version: o.appVersion,
      exports_available: o.datasets,
      personal_data: PERSONAL,
      tables: {},
    },
    profile: { ...o.publicProfile, categories },
  };
}

function exportFilename(m, table, ext) {
  const day = m.generated_at.slice(0, 10);
  return ext === 'json' ? `${m.station}-profile-${day}.json` : `${m.station}-profile-${day}-README.txt`;
}

function manifestText(m) {
  return readmeText(m, `${m.station.toUpperCase()} station profile export`, [
    ['Station', m.station],
    ['Generated', m.generated_at],
    ['App version', m.app_version],
    ['Schema version', String(m.schema_version)],
    ['Exports available', m.exports_available.map((d) => `${d.name} (schema ${d.schemaVersion})`).join(', ')],
    ['Contents', 'identity (name, frequency, city, timezone), live stream, links, socials, artwork files, capabilities, category map'],
  ]);
}

module.exports = { buildProfile, manifestText, exportFilename, COLUMNS, SCHEMA_VERSION };
