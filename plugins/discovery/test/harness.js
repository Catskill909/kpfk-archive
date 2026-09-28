'use strict';
// Runs the Discovery plugin the way the host server does (server.js: createDiscovery, then
// discovery.handle for its routes), with test doubles for what the host provides:
//   - the archive listing: fetched through the test's fetchImpl from ARCHIVE_URL, as the
//     separate app used to, so the tests moved from kpfk-discovery-plugin keep their fixtures;
//     `revision` is a hash of the body, as the host's changes when the listing changes;
//   - the catalog: `catalog` [{altid, photoUrl}] decorated as the host's decorateCatalog does
//     (an image URL becomes /api/artwork/<sha256>; none becomes the station icon).
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { loadProfile } = require('../../../lib/station-config');
const { createDiscovery } = require('..');

const ROOT = path.join(__dirname, '../../..');
const ARCHIVE_URL = 'https://podcast.kpfk.org/api/archive';
const token = url => '/api/artwork/' + crypto.createHash('sha256').update(url).digest('hex');

function createApp({ env = {}, fetchImpl = async () => { throw Error('no network'); }, dataDir = null, now, catalog = [], profile = 'stations/kpfk.json' } = {}) {
  const station = loadProfile(env.STATION_PROFILE || profile, { root: ROOT, env: {} });
  station.plugins.discovery = true;
  async function getArchive() {
    const r = await fetchImpl(ARCHIVE_URL);
    if (!r.ok) throw Error('Archive HTTP ' + r.status);
    const text = await r.text();
    return { ...JSON.parse(text), revision: crypto.createHash('sha256').update(text).digest('hex') };
  }
  const directory = Object.fromEntries(catalog.map(s => [`${station.id}.kpfk.${s.altid}`,
    { upstreamAltId: s.altid, photo: s.photoUrl ? token(s.photoUrl) : station.assets.icon }]));
  const securityHeaders = () => ({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'" });
  const discovery = createDiscovery({ station, env, dataDir, fetchImpl, now, getArchive, peekCatalog: () => ({ directory }), securityHeaders });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(discovery.status())); }
    if (await discovery.handle(req, res, url)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not_found"}');
  });
  server.discovery = discovery;
  return server;
}

module.exports = { createApp, token, ARCHIVE_URL };
