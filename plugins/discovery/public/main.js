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
      row.qir = {id: q.public_id, headline: q.headline || '', summary: q.summary || ''};
      if(!hasTopic(row) && q.headline) row.published = (row.published || []).concat([{host:'', guest:'', topic:q.headline, notes:''}]);
      if(!row.episodeDesc && q.summary) row.episodeDesc = q.summary;
      n++;
    });
    return n;
  }
  function start(win){
    var app = win.ArchiveApp;
    if(!app) return;
    var byMp3 = null;
    app.addPlugin({name: 'discovery', enrich: function(rows){ enrich(rows, byMp3); }});
    // After the page has shown: the catalog is ~1 MB and the archive never waits for it.
    function load(){
      win.fetch('/api/plugins/qir/catalog', {cache: 'no-store'})
        .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(catalog){ byMp3 = index(catalog); app.refresh(); })
        // Caught: QIR switched off, down or slow. The archive works without it; say so once.
        .catch(function(e){ console.warn('Discovery: QIR catalog unavailable (' + e.message + '); the archive works without it.'); });
    }
    if('requestIdleCallback' in win) win.requestIdleCallback(load, {timeout: 3000}); else win.setTimeout(load, 1500);
  }
  return {index: index, enrich: enrich, start: start};
});
