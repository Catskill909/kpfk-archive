'use strict';

/**
 * What one day of usage counters holds — the ONE list. The server builds day
 * records from it (statsDay), the backup carries and validates it, the exports
 * read it. There used to be two copies: feature clicks (2026-09-28) reached the
 * server's and not the backup's, so a backup silently dropped them and an
 * import of a file holding them was refused (found 2026-09-29).
 *
 * Counts only. No field may ever hold an identifier or free text (README).
 */

// Whole-number totals per day.
const COUNTERS = ['pageviews', 'plays', 'live', 'searches', 'shares', 'listenSeconds', 'liveSeconds'];

// Feature clicks (integration step 6). A closed list: `ui` events naming anything
// else are dropped, so the beacon can never carry free text. Most exist only
// where Discovery is on.
const UI_COUNTERS = ['transcriptOpen', 'songsOpen', 'lineJump', 'songJump', 'transcriptFind',
  'summaryShown', 'pendingShown', 'justAiredPlay'];
// What each means, for the exports (the studio tiles use the same words).
const UI_LABELS = {
  justAiredPlay: 'Just aired plays', transcriptOpen: 'Transcript opened', lineJump: 'Transcript line played',
  transcriptFind: 'Find in episode', songsOpen: 'Song list opened', songJump: 'Song played from list',
  summaryShown: 'Summaries seen', pendingShown: '"Processing" seen',
};

// Maps of name → count. `keys` says which names a map may hold.
const ZONES = ['local', 'national', 'intl', 'unknown'];
const SHOW_KEY = /^[A-Za-z0-9_.-]{1,200}$/;
const MAPS = {
  byShow: k => SHOW_KEY.test(k),
  secondsByShow: k => SHOW_KEY.test(k),
  byZone: k => ZONES.includes(k),
  clicks: k => UI_COUNTERS.includes(k),
};

module.exports = { COUNTERS, UI_COUNTERS, UI_LABELS, MAPS, MAP_NAMES: Object.keys(MAPS), ZONES };
