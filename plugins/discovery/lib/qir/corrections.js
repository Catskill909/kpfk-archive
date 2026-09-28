'use strict';

// Episode corrections (2026-09-27, Paul): a recording filed under the wrong show. The station's
// recorder names files by the schedule; when a fund-drive special replaces a show and nobody
// enters it in Confessor, the file keeps the scheduled show (Sunday 8:30 "On Contact" that was
// really the second half of an hour of Alan Watts — checked by listening). QIR summarises the
// audio correctly, so the card showed an Alan Watts headline under Chris Hedges. Each
// correction names the file (mp3 basename) and the show it really is, by key; nothing is
// guessed from summaries. The real fix is the special entered in Confessor (Otis / station).
const base = url => String(url || '').split('/').pop();

// episodes: QIR-shaped records. The real show's name and category are taken from QIR's own
// episodes of that show; a correction whose show QIR does not know is skipped and reported.
function applyCorrections(episodes, corrections, { reference = episodes, warn = () => {} } = {}) {
  if (!corrections || !corrections.length) return episodes;
  const byFile = new Map(corrections.map(c => [c.file, c]));
  const shows = new Map();
  for (const e of reference) if (e.show_key && !byFile.has(base(e.mp3_url)) && !shows.has(e.show_key)) shows.set(e.show_key, e);
  return episodes.map(e => {
    const c = byFile.get(base(e.mp3_url));
    if (!c) return e;
    const real = shows.get(c.show);
    if (!real) { warn(`Episode correction skipped: no episodes of show "${c.show}" to take its name from (${c.file})`); return e; }
    return { ...e, show_key: c.show, show_name: real.show_name, category: real.category, corrected_from: e.show_key };
  });
}

// One show, one card (Paul, 2026-09-27): the recorder cut the corrected hour at the schedule
// line, so Alan Watts 8:00 and the corrected 8:30 are two files of one broadcast. A corrected
// episode that starts where the same show's episode that day ends becomes its second part:
// `part_of` on the later one (hidden from lists, still playable by id), `parts` on the first
// (the player continues into it). Only corrected episodes are joined; nothing else changes.
const seconds = t => { const m = /^(\d\d):(\d\d)(?::(\d\d))?/.exec(t || ''); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) : NaN; };
const endOf = e => e.air_end ? seconds(e.air_end) : seconds(e.air_start) + Math.round((e.duration_minutes || 0) * 60);
function joinCorrectedParts(episodes) {
  const byDayShow = new Map();
  for (const e of episodes) { const k = e.air_date + ' ' + e.show_key; if (!byDayShow.has(k)) byDayShow.set(k, []); byDayShow.get(k).push(e); }
  const partOf = new Map();
  for (const e of episodes) {
    if (!e.corrected_from) continue;
    const head = (byDayShow.get(e.air_date + ' ' + e.show_key) || []).find(a => a !== e && !partOf.has(a.public_id) && Math.abs(endOf(a) - seconds(e.air_start)) <= 60);
    if (head) partOf.set(e.public_id, head.public_id);
  }
  if (!partOf.size) return episodes;
  const parts = new Map();
  for (const [part, head] of partOf) parts.set(head, [...(parts.get(head) || []), part]);
  return episodes.map(e => partOf.has(e.public_id) ? { ...e, part_of: partOf.get(e.public_id) }
    : parts.has(e.public_id) ? { ...e, parts: parts.get(e.public_id) } : e);
}

module.exports = { applyCorrections, joinCorrectedParts };
