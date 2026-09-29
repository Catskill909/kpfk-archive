/* Studio: Station & appearance (station template, step 5b, 2026-09-29).
 * A summary that reads like the site (Station, Side-menu links, Social accounts), one focused edit
 * panel per part, and a bar that collects changes until Review & publish (Paul: stacked forms were
 * "jarring and busy"). Edits are a local draft until published; the server checks every edit
 * exactly like the station's install settings (lib/station-overrides.js). Undo last publish puts
 * the previous version back. Anyone signed in to the studio may edit. In-app dialogs only. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var section = $('stationSection'), tabs = $('studioTabs'), dlg = $('stDialog');
  if (!section || !tabs || !dlg || typeof dlg.showModal !== 'function') return;
  var state = null, draft = null, csrf = null, busy = false, onDone = null;

  var LINK_LABELS = { website: 'Station website', archive: 'Original archive', donate: 'Donate', privacy: 'Privacy policy',
    schedule: 'Schedule page', programs: 'Programs A–Z', androidApp: 'Android app', appleApp: 'Apple app', about: 'About',
    mission: 'Mission', pacifica: 'Pacifica Foundation', news: 'News', volunteer: 'Volunteer', contact: 'Contact' };
  var SOCIAL_LABELS = { x: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn', bluesky: 'Bluesky' };
  var REQUIRED = { website: true, archive: true };   // the site needs these two links
  var TEXT = { name: 'Name', frequency: 'Frequency', city: 'City' };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function say(node, text, kind) { node.textContent = text; node.className = 'export-status' + (kind ? ' is-' + kind : ''); }
  function shortUrl(u) { return String(u || '').replace(/^https:\/\//, '').replace(/\/$/, ''); }
  function withCsrf() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/studio/health', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { csrf = d.csrf; return csrf; });
  }
  function post(path, body, type) {
    return withCsrf().then(function (token) {
      return fetch('/api/studio/station/' + path, { method: 'POST', body: body, headers: { 'Content-Type': type || 'application/json', 'X-Studio-CSRF': token } });
    }).then(function (r) {
      if (r.status === 401) { location.replace('/studio'); throw new Error('Your studio session has ended.'); }
      return r.json();
    });
  }

  // ---- the draft, against what is published (state.current) and the install settings (state.profile)
  /** Edits as differences from the install settings: the server keeps only these. */
  function edits() {
    var p = state.profile, out = {};
    Object.keys(TEXT).forEach(function (k) { if (draft[k] !== p[k]) out[k] = draft[k]; });
    ['links', 'social'].forEach(function (g) {
      var d = {};
      state.keys[g].forEach(function (k) { var v = draft[g][k] || '', was = (p[g] && p[g][k]) || ''; if (v !== was) d[k] = v; });
      if (Object.keys(d).length) out[g] = d;
    });
    if (draft.logo !== p.logo) out.logo = draft.logo;
    return out;
  }
  /** What publishing would change on the site, in words. */
  function changes() {
    var c = state.current, list = [];
    Object.keys(TEXT).forEach(function (k) { if (draft[k] !== c[k]) list.push(TEXT[k] + ': “' + c[k] + '” → “' + draft[k] + '”'); });
    [['links', LINK_LABELS, ' link'], ['social', SOCIAL_LABELS, '']].forEach(function (g) {
      state.keys[g[0]].forEach(function (k) {
        var was = c[g[0]][k] || '', now = draft[g[0]][k] || '', name = (g[1][k] || k) + g[2];
        if (was !== now) list.push(!now ? name + ': removed' : !was ? name + ': added' : name + ': changed');
      });
    });
    if (draft.logo !== c.logo) list.push(draft.logo === state.profile.logo ? 'Logo: back to the original' : 'Logo: new image');
    return list;
  }

  // ---- the summary cards
  function rows(box, group, labels) {
    box.textContent = '';
    var cur = state.current[group];
    state.keys[group].forEach(function (k) {
      var v = draft[group][k] || '', was = cur[k] || '';
      if (!v && !was) return;
      var li = el('li', 'st-row' + (v !== was ? ' is-changed' : ''));
      li.appendChild(el('span', 'st-row-label', labels[k] || k));
      li.appendChild(v ? el('span', 'st-row-value', shortUrl(v)) : el('span', 'st-row-value st-removed', 'Removed'));
      box.appendChild(li);
    });
    if (!box.children.length) box.appendChild(el('li', 'st-row st-empty', 'None yet'));
  }
  function render() {
    $('stLogoView').src = draft.logo;
    $('stNameView').textContent = draft.name;
    $('stSubView').textContent = draft.frequency + ' · ' + draft.city;
    $('stNameView').classList.toggle('is-changed', draft.name !== state.current.name);
    $('stSubView').classList.toggle('is-changed', draft.frequency !== state.current.frequency || draft.city !== state.current.city);
    $('stLogoView').classList.toggle('is-changed', draft.logo !== state.current.logo);
    rows($('stLinksView'), 'links', LINK_LABELS);
    rows($('stSocialView'), 'social', SOCIAL_LABELS);
    var n = changes().length;
    $('stBar').hidden = !n;
    $('stBarText').textContent = n === 1 ? '1 change not yet on the site' : n + ' changes not yet on the site';
    $('stUndo').hidden = !state.history.length;
  }
  function paint(d) {
    state = d;
    draft = copy(d.current);
    tabs.querySelector('[data-studio-tab="discovery"]').hidden = false;
    section.hidden = false;
    // Data sources: read-only placeholders for the full station template.
    var f = d.fixed || {}, o = f.origins || {}, src = $('stSourcesView');
    src.textContent = '';
    [['Catalog feed', (f.feeds || {}).catalog], ['Channels feed', (f.feeds || {}).channels],
      ['Schedule & now playing', 'From the channels feed'], ['Live stream', f.liveStream],
      ['Site address', f.siteUrl || 'Not set'], ['Time zone', f.timezone], ['Station ID', (f.id || '') + (f.primaryChannel && f.primaryChannel !== f.id ? ' · channel ' + f.primaryChannel : '')],
      ['Data format', f.provider === 'pacifica-json' ? 'Pacifica JSON feeds' : f.provider],
      ['Allowed hosts', ['feeds', 'audio', 'artwork'].map(function (k) { return k + ': ' + (o[k] || []).map(shortUrl).join(', '); }).join(' · ')]]
      .forEach(function (r) {
        var li = el('li', 'st-row');
        li.appendChild(el('span', 'st-row-label', r[0]));
        var v = el('span', 'st-row-value st-row-value--wrap', r[1] || '');
        v.title = r[1] || '';
        li.appendChild(v);
        src.appendChild(li);
      });
    if (d.bootError) say($('stStatus'), 'Saved changes are not in use because they no longer fit the install settings: ' + d.bootError, 'bad');
    render();
  }
  function load() {
    return fetch('/api/studio/station', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.status === 401) { location.replace('/studio'); return null; } return r.json(); })
      .then(function (d) { if (d && d.available) paint(d); })
      .catch(function (e) { console.error('[studio] station settings failed:', e); say($('stStatus'), 'Could not load the station settings: ' + e.message, 'bad'); });
  }

  // ---- the edit panel (one native <dialog>, filled per part)
  function field(label, value, attrs) {
    var l = el('label', 'studio-field');
    l.appendChild(el('span', 'studio-field-label', label));
    var i = el('input', 'studio-input');
    i.value = value || ''; i.autocomplete = 'off';
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    l.appendChild(i);
    return { label: l, input: i };
  }
  function open(title, okLabel, build, done) {
    $('stDialogTitle').textContent = title;
    $('stDialogOk').textContent = okLabel;
    $('stDialogOk').disabled = false;
    say($('stDialogStatus'), '');
    $('stDialogBody').textContent = '';
    build($('stDialogBody'));
    onDone = done;
    dlg.showModal();
    var first = $('stDialogBody').querySelector('input, select');
    if (first) first.focus();
  }
  function close() { if (dlg.open) dlg.close(); onDone = null; }

  function stationPanel() {
    var f = {}, logo = draft.logo;
    open('Station', 'Done', function (body) {
      var row = el('div', 'st-row3');
      Object.keys(TEXT).forEach(function (k) { f[k] = field(TEXT[k], draft[k], { maxlength: '80', 'data-field': k }); row.appendChild(f[k].label); });
      body.appendChild(row);
      body.appendChild(el('h3', 'st-sub-head', 'Logo'));
      var lg = el('div', 'st-logo-edit');
      var img = el('img', 'st-logo'); img.src = logo; img.alt = 'Logo';
      var up = el('label', 'export-file');
      var file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.id = 'stLogoFile';
      up.appendChild(file); up.appendChild(el('span', 'studio-btn', 'Upload a new logo…'));
      var reset = el('button', 'export-link', 'Use the original logo'); reset.type = 'button';
      reset.hidden = logo === state.profile.logo;
      lg.appendChild(img); lg.appendChild(up); lg.appendChild(reset);
      body.appendChild(lg);
      body.appendChild(el('p', 'st-hint', 'PNG, JPEG or WebP, up to 1 MB. Shown in the site’s header.'));
      file.addEventListener('change', function () {
        var fl = file.files && file.files[0];
        if (!fl) return;
        if (fl.size > state.logoMaxBytes) { say($('stDialogStatus'), 'That image is larger than ' + Math.round(state.logoMaxBytes / 1024) + ' KB.', 'bad'); file.value = ''; return; }
        say($('stDialogStatus'), 'Uploading…');
        post('logo', fl, fl.type || 'application/octet-stream').then(function (d) {
          file.value = '';
          if (!d.ok) { say($('stDialogStatus'), 'Not accepted: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
          logo = d.logo; img.src = logo; reset.hidden = logo === state.profile.logo;
          say($('stDialogStatus'), 'Uploaded.', 'ok');
        }).catch(function (e) { file.value = ''; console.error('[studio] logo upload failed:', e); say($('stDialogStatus'), e.message, 'bad'); });
      });
      reset.addEventListener('click', function () { logo = state.profile.logo; img.src = logo; reset.hidden = true; });
    }, function () {
      for (var k in f) {
        var v = f[k].input.value.trim();
        if (!v) { say($('stDialogStatus'), TEXT[k] + ' cannot be empty.', 'bad'); f[k].input.focus(); return false; }
      }
      for (var j in f) draft[j] = f[j].input.value.trim();
      draft.logo = logo;
      return true;
    });
  }
  /** Links / social: the ones in use, each editable and removable, and "Add…" for the rest.
   *  A row shows while its key is in `work`; Add puts a key in, × takes it out. */
  function listPanel(group, title, labels, addText) {
    var work = copy(draft[group]), list, add;
    function paintList(focusKey) {
      list.textContent = '';
      state.keys[group].forEach(function (k) {
        if (!(k in work)) return;
        var li = el('li', 'st-edit-row');
        var f = field(labels[k] || k, work[k], { type: 'url', placeholder: 'https://…', 'data-key': k });
        f.input.addEventListener('input', function () { work[k] = f.input.value.trim(); });
        li.appendChild(f.label);
        if (!(group === 'links' && REQUIRED[k])) {
          var rm = el('button', 'st-remove', '×'); rm.type = 'button';
          rm.setAttribute('aria-label', 'Remove ' + (labels[k] || k));
          rm.addEventListener('click', function () { delete work[k]; paintList(); });
          li.appendChild(rm);
        }
        list.appendChild(li);
        if (k === focusKey) setTimeout(function () { f.input.focus(); }, 0);
      });
      add.textContent = '';
      var none = el('option', '', addText); none.value = ''; add.appendChild(none);
      state.keys[group].forEach(function (k) { if (!(k in work)) { var o = el('option', '', labels[k] || k); o.value = k; add.appendChild(o); } });
      add.hidden = add.options.length < 2;
    }
    open(title, 'Done', function (body) {
      list = el('ul', 'st-edit-list');
      add = el('select', 'studio-input st-add'); add.setAttribute('aria-label', addText);
      add.addEventListener('change', function () { var k = add.value; if (k) { work[k] = ''; paintList(k); } });
      body.appendChild(list);
      body.appendChild(add);
      body.appendChild(el('p', 'st-hint', 'Every link starts with https://.' + (group === 'links' ? ' The station website and archive links are required.' : '')));
      paintList();
    }, function () {
      var out = {};
      for (var k in work) if (work[k]) out[k] = work[k];
      for (var j in out) if (!/^https:\/\/\S+$/.test(out[j])) { say($('stDialogStatus'), (labels[j] || j) + ': must start with https://', 'bad'); return false; }
      if (group === 'links' && (!out.website || !out.archive)) { say($('stDialogStatus'), 'The station website and archive links are required.', 'bad'); return false; }
      draft[group] = out;
      return true;
    });
  }
  function review() {
    var list = changes(), body = edits();
    if (!list.length) return;
    open('Review & publish', 'Publish', function (b) {
      b.appendChild(el('p', 'st-hint', 'These go on the listener site as soon as you publish. Pages already open show them after a reload.'));
      var ul = el('ul', 'st-changes');
      list.forEach(function (t) { ul.appendChild(el('li', '', t)); });
      b.appendChild(ul);
    }, function () {
      busy = true; $('stDialogOk').disabled = true; say($('stDialogStatus'), 'Publishing…');
      post('apply', JSON.stringify(body)).then(function (d) {
        busy = false;
        if (!d.ok) { $('stDialogOk').disabled = false; say($('stDialogStatus'), 'Not published: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
        close(); paint(d);
        say($('stStatus'), 'Published. Reload the listener site to see it.', 'ok');
      }).catch(function (e) { busy = false; $('stDialogOk').disabled = false; console.error('[studio] publish failed:', e); say($('stDialogStatus'), e.message, 'bad'); });
      return 'wait';
    });
    // Ask the server first: a change the site would refuse never gets a Publish button.
    $('stDialogOk').disabled = true;
    say($('stDialogStatus'), 'Checking…');
    post('preview', JSON.stringify(body)).then(function (d) {
      if (!d.ok) { say($('stDialogStatus'), 'Cannot publish: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
      $('stDialogOk').disabled = false; say($('stDialogStatus'), '');
    }).catch(function (e) { console.error('[studio] preview failed:', e); say($('stDialogStatus'), e.message, 'bad'); });
  }

  // ---- wiring
  section.addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]');
    if (!b || !state || busy) return;
    var part = b.getAttribute('data-edit');
    if (part === 'station') stationPanel();
    else if (part === 'links') listPanel('links', 'Side-menu links', LINK_LABELS, 'Add a link…');
    else if (part === 'social') listPanel('social', 'Social accounts', SOCIAL_LABELS, 'Add an account…');
  });
  $('stDialogForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!onDone) { close(); return; }
    var r = onDone();
    if (r === 'wait') return;
    if (r !== false) { close(); render(); say($('stStatus'), ''); }
  });
  $('stDialogCancel').addEventListener('click', close);
  $('stDialogClose').addEventListener('click', close);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  $('stReview').addEventListener('click', function () { if (state && !busy) review(); });
  $('stDiscard').addEventListener('click', function () {
    window.StudioDialog.confirm({ title: 'Discard these changes?', confirmLabel: 'Discard', message: 'Nothing has been published; the site stays as it is.' })
      .then(function (ok) { if (ok) { draft = copy(state.current); render(); say($('stStatus'), ''); } });
  });
  $('stUndo').addEventListener('click', function () {
    if (busy || !state || !state.history.length) return;
    window.StudioDialog.confirm({ title: 'Undo the last publish?', confirmLabel: 'Undo',
      message: 'The listener site goes back to how it was before the last publish.' + (changes().length ? ' Changes you have not published are discarded too.' : '') })
      .then(function (ok) {
        if (!ok) return;
        busy = true;
        return post('undo', '').then(function (d) {
          busy = false;
          if (!d.ok) { say($('stStatus'), (d.errors || [d.error]).join(' '), 'bad'); return; }
          paint(d); say($('stStatus'), 'Undone. Reload the listener site to see it.', 'ok');
        });
      }).catch(function (e) { busy = false; console.error('[studio] undo failed:', e); say($('stStatus'), e.message, 'bad'); });
  });

  load();
})();
