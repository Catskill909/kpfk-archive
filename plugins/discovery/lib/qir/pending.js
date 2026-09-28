'use strict';

// QIR-behind fallback (2026-09-26). QIR stopped taking in new episodes for hours; Discovery
// shows only what QIR has, so Just aired froze while the station archive had five newer
// programs. Recent archive episodes that QIR does not have are therefore listed too, in
// QIR's own record shape, with `pending: true`: no summary or transcript yet, audio and
// song list (cue file) as usual. When QIR catches up, the mp3 matches and the pending copy
// disappears on its own.
//
// No age limit (Paul, 2026-09-28): every aired archive episode QIR lacks is listed for as
// long as the station archive carries it. Until 2026-09-28 only the last 48 h were, because
// "Transcript pending" would have been untrue for shows QIR never processes; those now read
// "No transcript" (skipped, below), so real shows such as Reggae Central no longer vanish
// from Discovery two days after airing. Future-dated items (pre-uploads) wait until they air.
//
// Waiting vs skipped (2026-09-27): QIR never processes some shows (Nightscapes, All Of The
// Above, Aware Show...) and occasionally misses one episode (World Massive 2026-09-26). Such
// an episode is not waiting: QIR has already processed something that aired after it. It is
// marked `skipped` ("No transcript", not "Transcript pending") and is not QIR lag. If QIR
// works out of order during a catch-up, an episode can read skipped until it lands; the
// mp3 match then removes it like any pending copy.

// The station's playlist log (cue file) for an archive row. Only on-air recordings have one:
// upload-list items (`2kpfk`) name a cue URL that is always 404 (checked 2026-09-26).
const cueUrl = (row, primaryChannel) => row.archiveSource === primaryChannel ? row.vtiUrl || '' : '';

function wallClock(seconds, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(seconds * 1000).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

// qirEpisodes: the published QIR catalog; archive: the podcast web app's /api/archive
// (rows already filtered to safe audio by server.js). Returns QIR-shaped records.
function pendingEpisodes(qirEpisodes, archive, { now, timeZone, primaryChannel = 'kpfk' }) {
  const known = new Set(qirEpisodes.map(e => e.mp3_url));
  const directory = archive.directory || {};
  const newestDone = archive.shows.reduce((a, r) => known.has(r.mp3) && r.dt * 1000 <= now ? Math.max(a, r.dt) : a, -Infinity);
  return archive.shows
    .filter(row => row.dt * 1000 <= now && !known.has(row.mp3))
    .map(row => {
      const { date, time } = wallClock(row.dt, timeZone);
      const topic = (row.published || []).map(p => p.topic).find(Boolean) || '';
      return {
        public_id: 'pending-' + row.id, pending: true, skipped: row.dt < newestDone, aired_at: row.dt,
        show_key: row.upstreamAltId, show_name: (directory[row.sho] || {}).name || row.title,
        title: '', headline: topic, summary: row.episodeDesc || '', guest: '', host: row.host || '',
        category: row.categoryLabel || '', air_date: date, air_start: time, air_end: '',
        duration_minutes: (row.durationSec || 0) / 60, mp3_url: row.mp3, vti_url: cueUrl(row, primaryChannel),
        updated_at: null,
      };
    });
}

// Episodes dated after "now" in station wall-clock time (pre-uploaded items, e.g. Politics Or
// Pedagogy the day before it airs) are held back until they air (Paul, 2026-09-26), as the
// podcast web app does. A record with a date but no start time is held until that day.
// QIR records carry no song list; attach the archive's by exact mp3 (music shows open on
// Songs, and every episode with both can switch — public/along.js).
function withSongLists(qirEpisodes, archive, primaryChannel) {
  const byMp3 = new Map(archive.shows.map(r => [r.mp3, cueUrl(r, primaryChannel)]));
  return qirEpisodes.map(e => { const vti = byMp3.get(e.mp3_url); return vti ? { ...e, vti_url: vti } : e; });
}
function splitByAirTime(episodes, { now, timeZone }) {
  const { date, time } = wallClock(Math.floor(now / 1000), timeZone), at = `${date} ${time}`;
  const aired = [], held = [];
  for (const e of episodes) (`${e.air_date} ${e.air_start || '00:00:00'}` > at ? held : aired).push(e);
  return { aired, held };
}

// Music window (2026-09-27, Paul): the webcast music licence allows archived music programmes
// for two weeks at most. Music episodes whose air time is more than `days` before now (station
// wall clock) are left out; everything else is kept. Music = category "Music" or a key in
// `musicShows` (station profile). QIR keeps every episode it processed, back to 2025, so
// without this Discovery listed months of music the station's own feeds no longer carry.
function splitByMusicWindow(episodes, { now, timeZone, days, musicShows = [] }) {
  if (!days) return { kept: episodes, expired: [] };
  const { date, time } = wallClock(Math.floor(now / 1000) - days * 86400, timeZone), cutoff = `${date} ${time}`;
  const extra = new Set(musicShows), kept = [], expired = [];
  for (const e of episodes) {
    const music = /music/i.test(e.category || '') || extra.has(e.show_key);
    (music && `${e.air_date} ${e.air_start || '00:00:00'}` < cutoff ? expired : kept).push(e);
  }
  return { kept, expired };
}

module.exports = { pendingEpisodes, splitByAirTime, splitByMusicWindow, withSongLists, cueUrl };
