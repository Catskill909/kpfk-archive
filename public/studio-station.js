/* Studio: Station & appearance (station template, slice 1 — step 5b, 2026-09-29).
 * Name, frequency, city, logo, side-menu links and social accounts, edited by anyone signed in
 * to the studio. The form sends the edits as differences from the station profile; the server
 * validates them exactly like the profile file (lib/station-overrides.js). Preview is required
 * before Apply; Undo puts the last change back. Kept apart from studio.js and
 * studio-discovery.js so none can break the others. In-app dialogs only (StudioDialog). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var section = $('stationSection'), tabs = $('studioTabs');
  if (!section || !tabs) return;
  var state = null, csrf = null, busy = false, pendingLogo = null, previewed = null;
  // The brand colour chosen in the form: '#rrggbb', or null for the design's own colours.
  var accent = null;
  var DESIGN_ACCENT = '#e14a2e';   // what the colour picker shows when no colour is set

  var LINK_LABELS = { website: 'Station website', archive: 'Original archive', donate: 'Donate', privacy: 'Privacy policy',
    schedule: 'Schedule page', programs: 'Programs A–Z', androidApp: 'Android app', appleApp: 'Apple app', about: 'About',
    mission: 'Mission', pacifica: 'Pacifica Foundation', news: 'News', volunteer: 'Volunteer', contact: 'Contact' };
  var SOCIAL_LABELS = { x: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn', bluesky: 'Bluesky' };
  var TEXT = { name: 'Name', frequency: 'Frequency', city: 'City' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function say(text, kind) { $('stStatus').textContent = text; $('stStatus').className = 'export-status' + (kind ? ' is-' + kind : ''); }
  function withCsrf() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/studio/health', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { csrf = d.csrf; return csrf; });
  }
  function post(path, body, type) {
    return withCsrf().then(function (token) {
      return fetch('/api/studio/station/' + path, { method: 'POST', body: body,
        headers: { 'Content-Type': type || 'application/json', 'X-Studio-CSRF': token } });
    }).then(function (r) {
      if (r.status === 401) { location.replace('/studio'); throw new Error('Your studio session has ended.'); }
      return r.json().then(function (d) { d.httpStatus = r.status; return d; });
    });
  }

  // ---- form <-> values
  function fieldGrid(box, group, keys, labels) {
    box.textContent = '';
    keys.forEach(function (k) {
      var l = el('label', 'studio-field');
      l.appendChild(el('span', 'studio-field-label', labels[k] || k));
      var i = el('input', 'studio-input');
      i.type = 'url'; i.id = 'st-' + group + '-' + k; i.setAttribute('data-group', group); i.setAttribute('data-key', k);
      i.placeholder = 'https://…'; i.autocomplete = 'off';
      l.appendChild(i);
      box.appendChild(l);
    });
  }
  function fill(cur) {
    Object.keys(TEXT).forEach(function (k) { $('st' + k.charAt(0).toUpperCase() + k.slice(1)).value = cur[k] || ''; });
    ['links', 'social'].forEach(function (g) {
      state.keys[g].forEach(function (k) { $('st-' + g + '-' + k).value = (cur[g] && cur[g][k]) || ''; });
    });
    pendingLogo = null;
    $('stLogo').src = cur.logo;
    setAccent(cur.accent);
  }
  function setAccent(v) {
    accent = v || null;
    $('stAccent').value = accent || DESIGN_ACCENT;
    $('stAccentHex').textContent = accent ? accent : 'The design’s own colour';
    $('stSwatches').hidden = true;
  }
  function logoNow() { return pendingLogo || state.current.logo; }
  /** The edits as differences from the station PROFILE (not from the current edits): the
   *  server keeps only these, so a field put back to the profile's value stops being an edit. */
  function edits() {
    var p = state.profile, out = {};
    Object.keys(TEXT).forEach(function (k) {
      var v = $('st' + k.charAt(0).toUpperCase() + k.slice(1)).value.trim();
      if (v !== p[k]) out[k] = v;
    });
    ['links', 'social'].forEach(function (g) {
      var d = {};
      state.keys[g].forEach(function (k) {
        var v = $('st-' + g + '-' + k).value.trim();
        if (v !== ((p[g] && p[g][k]) || '')) d[k] = v;
      });
      if (Object.keys(d).length) out[g] = d;
    });
    if (logoNow() !== p.logo) out.logo = logoNow();
    if (accent && accent !== p.accent) out.accent = accent;
    return out;
  }
  /** What applying would change on the listener site, compared with what it shows now. */
  function changes() {
    var c = state.current, list = [];
    Object.keys(TEXT).forEach(function (k) {
      var v = $('st' + k.charAt(0).toUpperCase() + k.slice(1)).value.trim();
      if (v !== c[k]) list.push(TEXT[k] + ': “' + c[k] + '” → “' + v + '”');
    });
    [['links', LINK_LABELS, ' link'], ['social', SOCIAL_LABELS, '']].forEach(function (g) {
      state.keys[g[0]].forEach(function (k) {
        var was = (c[g[0]] && c[g[0]][k]) || '', now = $('st-' + g[0] + '-' + k).value.trim(), name = (g[1][k] || k) + g[2];
        if (was === now) return;
        list.push(!now ? name + ': removed' : !was ? name + ': added (' + now + ')' : name + ': ' + was + ' → ' + now);
      });
    });
    if (logoNow() !== c.logo) list.push(logoNow() === state.profile.logo ? 'Logo: back to the profile’s logo' : 'Logo: the newly uploaded image');
    if (accent !== (c.accent || null)) list.push(!accent ? 'Colour: back to the design’s own' : 'Colour: ' + (c.accent || 'the design’s own') + ' → ' + accent);
    return list;
  }
  function dirty() { previewed = null; $('stApply').disabled = true; $('stReview').hidden = true; }

  function paint(d) {
    state = d;
    tabs.querySelector('[data-studio-tab="discovery"]').hidden = false;
    section.hidden = false;
    fieldGrid($('stLinks'), 'links', d.keys.links, LINK_LABELS);
    fieldGrid($('stSocial'), 'social', d.keys.social, SOCIAL_LABELS);
    fill(d.current);
    dirty();
    $('stUndo').disabled = !d.history.length;
    $('stWhen').textContent = (Object.keys(d.edits).length ? 'Edited here: ' + Object.keys(d.edits).map(function (k) { return TEXT[k] || (k === 'links' ? 'links' : k === 'social' ? 'social accounts' : k); }).join(', ')
      + (d.updatedAt ? ' · last change ' + new Date(d.updatedAt).toLocaleString() : '') : 'No edits yet: everything comes from the station profile file.')
      + (d.bootError ? ' · The saved edits are not valid with the current profile and are not in use: ' + d.bootError : '');
    var f = d.fixed || {}, facts = el('dl', 'disc-facts');
    [['Time zone', f.timezone], ['Data source', f.provider]].concat(Object.keys(f.feeds || {}).map(function (k) { return ['Feed: ' + k, f.feeds[k]]; }))
      .forEach(function (r) { facts.appendChild(el('dt', '', r[0])); facts.appendChild(el('dd', '', r[1] || '')); });
    $('discStation').textContent = '';
    $('discStation').appendChild(facts);
  }
  function load() {
    return fetch('/api/studio/station', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.status === 401) { location.replace('/studio'); return null; } return r.json(); })
      .then(function (d) { if (d && d.available) paint(d); })
      .catch(function (e) { console.error('[studio] station settings failed:', e); say('Could not load the station settings: ' + e.message, 'bad'); });
  }

  // ---- actions
  $('stForm').addEventListener('input', function (e) { if (e.target.id !== 'stLogoFile') { dirty(); say(''); } });
  $('stPreview').addEventListener('click', function () {
    if (busy || !state) return;
    var list = changes();
    if (!list.length) { dirty(); say('Nothing has changed.'); return; }
    busy = true; say('Checking…');
    var body = edits();
    post('preview', JSON.stringify(body)).then(function (d) {
      busy = false;
      if (!d.ok) { dirty(); say('Not valid: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
      previewed = JSON.stringify(body);
      $('stChanges').textContent = '';
      list.forEach(function (t) { $('stChanges').appendChild(el('li', '', t)); });
      $('stReview').hidden = false;
      $('stApply').disabled = false;
      // How the colour will look in each theme (CSSOM styles: the CSP allows these, not inline ones).
      var cols = d.preview && d.preview.colors;
      $('stSwatches').hidden = !cols;
      if (cols) [['stSwatchDark', cols.dark], ['stSwatchLight', cols.light]].forEach(function (x) {
        $(x[0]).style.backgroundColor = x[1].accent; $(x[0]).style.color = x[1].ink;
        $(x[0]).parentNode.style.backgroundColor = cols.surfaces[x[0] === 'stSwatchDark' ? 'dark' : 'light'];
        $(x[0]).title = x[1].accent + (x[1].adjusted ? ' (adjusted to be readable)' : '');
      });
      say('Looks good. Apply to put ' + (list.length === 1 ? 'this change' : 'these ' + list.length + ' changes') + ' on the listener site.', 'ok');
    }).catch(function (e) { busy = false; console.error('[studio] station preview failed:', e); say(e.message, 'bad'); });
  });
  $('stApply').addEventListener('click', function () {
    if (busy || !previewed || previewed !== JSON.stringify(edits())) { dirty(); return; }
    window.StudioDialog.confirm({ title: 'Apply to the listener site?', confirmLabel: 'Apply',
      message: 'Listeners see this as soon as their page reloads. You can undo it here afterwards.' })
      .then(function (ok) {
        if (!ok) return;
        busy = true; say('Applying…');
        return post('apply', previewed).then(function (d) {
          busy = false;
          if (!d.ok) { say('Not applied: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
          paint(d);
          say('Applied. Reload the listener site to see it.', 'ok');
        });
      }).catch(function (e) { busy = false; console.error('[studio] station apply failed:', e); say(e.message, 'bad'); });
  });
  $('stUndo').addEventListener('click', function () {
    if (busy || !state || !state.history.length) return;
    window.StudioDialog.confirm({ title: 'Undo the last change?', confirmLabel: 'Undo',
      message: 'The listener site goes back to how it was before the last change you applied here.' })
      .then(function (ok) {
        if (!ok) return;
        busy = true; say('Undoing…');
        return post('undo', '').then(function (d) {
          busy = false;
          if (!d.ok) { say((d.errors || [d.error]).join(' '), 'bad'); return; }
          paint(d);
          say('Undone. Reload the listener site to see it.', 'ok');
        });
      }).catch(function (e) { busy = false; console.error('[studio] station undo failed:', e); say(e.message, 'bad'); });
  });
  $('stLogoFile').addEventListener('change', function () {
    var f = this.files && this.files[0], input = this;
    if (!f || busy) return;
    if (state && f.size > state.logoMaxBytes) { say('That image is larger than ' + Math.round(state.logoMaxBytes / 1024) + ' KB.', 'bad'); input.value = ''; return; }
    busy = true; say('Uploading the logo…');
    post('logo', f, f.type || 'application/octet-stream').then(function (d) {
      busy = false; input.value = '';
      if (!d.ok) { say('Logo not accepted: ' + (d.errors || [d.error]).join(' '), 'bad'); return; }
      pendingLogo = d.logo; $('stLogo').src = d.logo; dirty();
      say('Logo uploaded. Preview, then apply, to use it on the listener site.', 'ok');
    }).catch(function (e) { busy = false; input.value = ''; console.error('[studio] logo upload failed:', e); say(e.message, 'bad'); });
  });
  $('stAccent').addEventListener('input', function () { setAccent(this.value.toLowerCase()); dirty(); });
  $('stAccentReset').addEventListener('click', function () { setAccent(null); dirty(); say('The design’s own colour is selected. Preview, then apply.'); });
  $('stLogoReset').addEventListener('click', function () {
    if (!state) return;
    pendingLogo = state.profile.logo; $('stLogo').src = state.profile.logo; dirty();
    say('The profile’s logo is selected. Preview, then apply.');
  });

  load();
})();
