/* Studio: tab bar and the Discovery tab (integration step 5, docs/INTEGRATION-PLAN.md).
 * Moved from Discovery's own admin page (kpfk-discovery.pacifica.audio/admin), behind the
 * studio's one sign-in. Two switches, saved on the data volume and applied at once:
 * Discovery on/off for listeners, and QIR transcripts & summaries.
 * Kept apart from studio.js (the stats page) so neither can break the other. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tabs = $('studioTabs'), panel = $('discoveryPanel'), stats = $('main');
  if (!tabs || !panel || !stats) return;
  var csrf = null, state = null, busy = false;

  // ---- tabs
  function show(tab) {
    tabs.querySelectorAll('.studio-tab').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.studioTab === tab)); });
    panel.hidden = tab !== 'discovery';
    stats.hidden = tab === 'discovery';
    try { history.replaceState(null, '', tab === 'discovery' ? '#discovery' : location.pathname); } catch (e) {}
    if (tab === 'discovery') load();
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('.studio-tab');
    if (b && !b.hidden) show(b.dataset.studioTab);
  });

  // ---- data
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(); }
  function withCsrf() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/studio/health', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { csrf = d.csrf; return csrf; });
  }
  function paintSwitch(el, on, disabled) {
    el.setAttribute('aria-checked', String(!!on));
    el.disabled = !!disabled || busy;
  }
  function paint(d) {
    state = d;
    var q = d.qir || {}, st = q.status || {}, p = d.pending || {};
    paintSwitch($('discEnabled'), d.enabled, false);
    $('discEnabledStatus').textContent = (d.enabled ? 'On for listeners (open pages show it after a reload)' : 'Off — listeners see the site without Discovery') +
      (d.updatedAt ? ' · changed ' + when(d.updatedAt) : '') + (d.persisted ? '' : ' · not saved (no data volume)');
    paintSwitch($('discQir'), q.enabled, !q.supported);
    var parts = [];
    if (!q.supported) parts.push('Not available for this station');
    else if (!q.keyConfigured) parts.push('No QIR key configured on the server');
    else if (!d.enabled) parts.push(q.enabled ? 'Ready — starts when Discovery is switched on' : 'Off');
    else if (!q.enabled) parts.push('Off');
    else {
      // The QIR service's states in plain words (lib/qir/service.js status()).
      var words = { ready: 'On', not_verified: 'Loading from QIR… (about 20 seconds after switching on)',
        unavailable: 'QIR is not answering — showing the last good copy if there is one',
        not_configured: 'No QIR key configured on the server', disabled: 'Not available for this station' };
      parts.push(words[st.state] || ('Status: ' + (st.state || 'unknown')));
      if (st.episodes != null) parts.push(Number(st.episodes).toLocaleString() + ' episodes loaded');
      var skipped = st.skipped && typeof st.skipped === 'object' ? st.skipped.count : st.skipped;
      if (skipped) parts.push(skipped + ' skipped (bad data)');
      if (st.lastSuccess) parts.push('updated ' + when(st.lastSuccess));
      if (p.count) parts.push(p.count + ' recent episode' + (p.count === 1 ? '' : 's') + ' waiting for QIR' + (p.behindHours ? ' (' + p.behindHours + ' h behind)' : ''));
      if (st.error) parts.push('Last error: ' + st.error);
    }
    $('discQirStatus').textContent = parts.join(' · ');
  }
  function load() {
    return fetch('/api/studio/discovery', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.status === 401) { location.replace('/studio'); return null; } return r.json(); })
      .then(function (d) {
        if (!d) return;
        // No Discovery at this station: hide its part only. The tab also holds Station &
        // appearance (studio-station.js shows the tab for that), so it is not hidden here.
        if (!d.available) { $('discoverySection').hidden = true; return; }
        $('discoverySection').hidden = false;
        tabs.querySelector('[data-studio-tab="discovery"]').hidden = false;
        if (!panel.hidden) paint(d);
      })
      .catch(function (e) { $('discError').textContent = 'Could not load Discovery settings: ' + e.message; });
  }
  function change(body, label, confirmLabel) {
    if (busy) return;
    window.StudioDialog.confirm({ title: label + '?', message: 'This changes the listener site right away. Pages already open show the change after a reload.', confirmLabel: confirmLabel })
      .then(function (ok) { if (ok) apply(body); });
  }
  function apply(body) {
    busy = true; $('discError').textContent = '';
    paint(state);
    withCsrf().then(function (token) {
      return fetch('/api/studio/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': token }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); return d; });
    }).then(function (d) { busy = false; paint(d); })
      .catch(function (e) { busy = false; paint(state); $('discError').textContent = 'Not changed: ' + e.message; });
  }
  $('discEnabled').addEventListener('click', function () {
    var on = !(state && state.enabled);
    change({ enabled: on }, on ? 'Switch Discovery on for listeners' : 'Switch Discovery off for listeners', on ? 'Switch on' : 'Switch off');
  });
  $('discQir').addEventListener('click', function () {
    var on = !(state && state.qir && state.qir.enabled);
    change({ qir: on }, on ? 'Switch QIR transcripts & summaries on' : 'Switch QIR transcripts & summaries off', on ? 'Switch on' : 'Switch off');
  });

  // Show the Discovery tab only where the station may have it; open it from #discovery.
  load().then(function () { if (location.hash === '#discovery' && !tabs.querySelector('[data-studio-tab="discovery"]').hidden) show('discovery'); });
  // Refresh the status while the tab is open (QIR loads in the background after switching on).
  setInterval(function () { if (!panel.hidden && !document.hidden && !busy) load(); }, 15000);
})();
