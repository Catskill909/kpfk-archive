/* Discovery on the main page (integration step 4a, docs/INTEGRATION-PLAN.md).
 * The host adds this script only where the station has Discovery on (server.js, the
 * "plugins" marker in public/index.html). It gives the main page's episodes QIR's
 * headline (as the episode title), summary (as the episode notes) and transcript id,
 * matched by audio file. It only ADDS: a title or notes the station's feed already
 * carries are kept. The shared search (archive-search.js) indexes topic and notes, so
 * search, results and sheets pick this up with no second search.
 * Pure part (enrich) is exported for the offline tests. */
(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root);
})(typeof window === 'undefined' ? this : window, function(){
  'use strict';
  // byMp3: QIR episodes keyed by mp3 URL. Pending ones (an archive episode QIR has not
  // processed, lib/qir/pending.js) carry no headline or summary and are skipped.
  function index(catalog){
    var byMp3 = new Map();
    (catalog && catalog.episodes || []).forEach(function(e){ if(e && e.mp3_url && !e.pending) byMp3.set(e.mp3_url, e); });
    return byMp3;
  }
  function hasTopic(row){
    return (row.published || []).some(function(p){ return p && p.topic && String(p.topic).trim(); });
  }
  // Safe to run again on the same rows (the host re-runs it on refresh): nothing is added twice.
  function enrich(rows, byMp3){
    if(!byMp3) return 0;
    var n = 0;
    rows.forEach(function(row){
      var q = byMp3.get(row.mp3);
      if(!q) return;
      // Not row.qir: on Discovery's own page that marks a QIR row whose dt is station clock
      // time (just-aired.js reads it). Main-page rows keep real Unix times.
      row.qirEpisode = {id: q.public_id, headline: q.headline || '', summary: q.summary || ''};
      if(!hasTopic(row) && q.headline) row.published = (row.published || []).concat([{host:'', guest:'', topic:q.headline, notes:''}]);
      if(!row.episodeDesc && q.summary) row.episodeDesc = q.summary;
      n++;
    });
    return n;
  }
  // Listen along reads row.qir (a QIR row, Discovery's page) and row.vtiUrl. Main-page rows
  // carry qirEpisode instead; this gives Listen along its own view of a row without touching
  // the shared one (just-aired.js reads row.qir as station-clock time). Upload-list shows'
  // song files do not exist (their cue links are 404), so they offer no Songs.
  function forAlong(row){
    if(!row) return null;
    var view = Object.assign({}, row);
    view.qir = row.qirEpisode ? {public_id: row.qirEpisode.id} : null;
    view.vtiUrl = row.archiveSource === '2kpfk' ? '' : (row.vtiUrl || '');
    return view;
  }
  var ICONS = {
    transcript: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></svg>',
    songs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>'
  };
  function start(win){
    var app = win.ArchiveApp;
    if(!app) return;
    var byMp3 = null, rowsById = new Map();
    var doc = win.document, audio = doc.getElementById('mainAudio'), bar = doc.getElementById('playerBar');
    var along = win.ListenAlong;
    app.addPlugin({
      name: 'discovery',
      enrich: function(rows){ enrich(rows, byMp3); rowsById = new Map(rows.map(function(r){ return [r.id, r]; })); },
      // Show sheet: Transcript / Songs for the selected broadcast (step 4e).
      sheetActions: function(r){
        if(!along) return '';
        return along.kindsOf(forAlong(r)).map(function(k){
          return '<button class="sheet-link sheet-along" type="button" data-plugin-action="along-' + k + '" data-id="' + String(r.id).replace(/"/g, '&quot;') + '">' +
            ICONS[k] + '<span>' + (k === 'transcript' ? 'Transcript' : 'Songs') + '</span></button>';
        }).join('');
      },
      onAction: function(action, id){
        var m = /^along-(transcript|songs)$/.exec(action || '');
        if(!m || !along) return;
        // The panel sits under popups; close the sheet first, then open it for this episode.
        app.closeSheet();
        win.setTimeout(function(){ along.open(id, {kind: m[1]}); }, 50);
      }
    });
    // Listen along on the main player: a Transcript / Songs button in the player bar.
    if(along && audio && bar){
      var toggle = doc.createElement('button');
      toggle.type = 'button'; toggle.id = 'playerAlong'; toggle.className = 'player-along rv-alongtoggle'; toggle.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span class="rv-alongtoggle-icon">' + ICONS.transcript + '</span><span class="rv-alongtoggle-label">Transcript</span>';
      bar.insertBefore(toggle, doc.getElementById('playerClose'));
      // The playing episode, or '' when the bar holds the live stream (or nothing): the
      // archive audio element keeps the last episode loaded, paused, while live plays, so its
      // src alone would offer that episode's transcript over the live stream (2026-09-28 bug).
      var currentId = function(){
        if(app.barMode && app.barMode() !== 'archive') return '';
        var src = audio.currentSrc || audio.src || '';
        if(!src) return '';
        for(var r of rowsById.values()) if(r.mp3 === src) return r.id;
        return '';
      };
      along.init({
        audio: audio, player: bar, toggle: toggle, currentId: currentId, hostMeasuresPlayer: true,
        getRow: function(id){ return forAlong(rowsById.get(id)); },
        title: function(r){ return win.ArchiveSearch.episodeTitle(r) || r.title; },
        meta: function(r){ return r.dateText || ''; },
        show: function(r){ return r.title || ''; },
        art: function(r){ return r.photo || ''; },
        about: function(r){ return r.episodeDesc || ''; },
        seek: function(id, at){ app.playAt(id, at); }
      });
      // Live stream on (or player closed): no transcript to offer; close an open panel.
      doc.addEventListener('archive:barmode', function(e){
        if(e.detail && e.detail.mode !== 'archive' && along.isOpen()) along.close();
        along.refresh();
      });
    }
    // After the page has shown: the catalog is ~1 MB and the archive never waits for it.
    function load(){
      win.fetch('/api/plugins/qir/catalog', {cache: 'no-store'})
        .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(catalog){ byMp3 = index(catalog); app.refresh(); if(along) along.refresh(); recentTimer = win.setInterval(checkRecent, RECENT_MS); })
        // Caught: QIR switched off, down or slow. The archive works without it; say so once.
        .catch(function(e){ console.warn('Discovery: QIR catalog unavailable (' + e.message + '); the archive works without it.'); });
    }
    if('requestIdleCallback' in win) win.requestIdleCallback(load, {timeout: 3000}); else win.setTimeout(load, 1500);
    // Late headlines (2026-09-28, as on Discovery's page): QIR processes a show some time
    // after it airs, so every 2 minutes ask for the last two days' QIR episodes (a few KB,
    // /api/plugins/qir/recent) and redraw Just aired if any headline is new. The listing
    // is never redrawn under the reader. Stops if Discovery is switched off (404).
    var RECENT_MS = 2 * 60 * 1000, recentTimer = null;
    function stationDate(ms){
      var p = {};
      new Intl.DateTimeFormat('en-CA', {timeZone: (win.StationConfig || {}).timezone || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'})
        .formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    }
    function checkRecent(){
      if(win.document.hidden || !byMp3) return;
      var since = stationDate(Date.now() - 2 * 86400000) + ' 00:00:00';
      win.fetch('/api/plugins/qir/recent?since=' + encodeURIComponent(since), {cache: 'no-store'})
        .then(function(r){ if(r.status === 404) throw Object.assign(new Error('switched off'), {stop: true}); if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(d){
          var changed = false;
          (d.episodes || []).forEach(function(e){
            if(!e || !e.mp3_url || e.pending) return;
            var had = byMp3.get(e.mp3_url);
            if(!had || had.headline !== e.headline || had.summary !== e.summary){ byMp3.set(e.mp3_url, e); changed = true; }
          });
          if(changed){ app.refreshJustAired(); if(along) along.refresh(); }
        })
        // Caught: offline, or Discovery switched off since the page loaded (then stop asking).
        .catch(function(e){ if(e.stop && recentTimer) win.clearInterval(recentTimer); });
    }
  }
  return {index: index, enrich: enrich, start: start};
});
