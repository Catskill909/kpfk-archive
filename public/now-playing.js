/* "Now Playing" on phones (2026-09-29, Paul: mobile is where listeners are). Tapping the mini
 * player opens a full sheet: big artwork, the whole episode title, a large scrub bar, big ±15 and
 * play/pause, actions (Transcript/Songs, Show & episodes, Share) and "More from this show".
 * It has no audio of its own: everything goes through window.ArchiveApp.player (public/app.js),
 * so the bar, the lock screen and this sheet can never disagree.
 *
 * TESTERS ONLY until Paul switches it on for everyone: open the site once with ?np=on (this
 * browser remembers it; ?np=off forgets). Active on phones (up to 699 px wide, like Listen along).
 * The live stream keeps its own live player. */
(function () {
  'use strict';
  var KEY = 'nowPlaying';
  var PHONE = '(max-width: 699px)';
  // ---- the tester switch (a per-browser convenience; storage may be blocked — then it is off)
  function flag() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  (function readParam() {
    var m = /[?&]np=(on|off)\b/.exec(location.search);
    if (!m) return;
    try { if (m[1] === 'on') localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY); }
    catch (e) { console.warn('[now-playing] could not remember the tester switch:', e.message); }
    try { history.replaceState(history.state, '', location.pathname + location.search.replace(/([?&])np=(on|off)&?/, '$1').replace(/[?&]$/, '') + location.hash); }
    catch (e) { /* the address keeps ?np=; harmless */ }
  })();

  var app = null, dlg = null, els = {}, pushed = false, seeking = false;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function icon(path, extra) { return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (extra || '') + '>' + path + '</svg>'; }
  var ICON = {
    play: icon('<path fill="currentColor" d="M8 5v14l11-7z"/>'),
    pause: icon('<path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
    back: icon('<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="16.6" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor">15</text>'),
    fwd: icon('<g transform="translate(24,0) scale(-1,1)"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></g><text x="12" y="16.6" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor">15</text>'),
    down: icon('<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    show: icon('<path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    share: icon('<path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    small: icon('<path fill="currentColor" d="M8 5v14l11-7z"/>'),
  };

  function build() {
    dlg = el('dialog', 'np');
    dlg.id = 'nowPlaying';
    dlg.setAttribute('aria-label', 'Now playing');
    dlg.innerHTML =
      '<div class="np-sheet">' +
        '<div class="np-grab"><button class="np-close" type="button" aria-label="Close Now Playing">' + ICON.down + '</button><span class="np-grab-bar" aria-hidden="true"></span></div>' +
        '<div class="np-scroll">' +
          '<div class="np-art"><img alt=""></div>' +
          '<div class="np-titles"><p class="np-show"></p><h2 class="np-title"></h2><p class="np-meta"></p></div>' +
          '<div class="np-scrub"><input class="np-range" type="range" min="0" max="0" step="1" value="0" aria-label="Position">' +
            '<div class="np-times"><span class="np-cur">0:00</span><span class="np-dur">0:00</span></div></div>' +
          '<div class="np-transport">' +
            '<button class="np-skip" type="button" data-skip="-1" aria-label="Back 15 seconds">' + ICON.back + '</button>' +
            '<button class="np-toggle" type="button" aria-label="Play">' + ICON.play + '<span class="spinner" aria-hidden="true"></span></button>' +
            '<button class="np-skip" type="button" data-skip="1" aria-label="Forward 15 seconds">' + ICON.fwd + '</button>' +
          '</div>' +
          '<div class="np-actions">' +
            '<button class="np-action np-along" type="button" hidden></button>' +
            '<button class="np-action np-open-show" type="button">' + ICON.show + '<span>Episodes</span></button>' +
            '<button class="np-action np-share" type="button" hidden>' + ICON.share + '<span>Share</span></button>' +
          '</div>' +
          '<section class="np-more" hidden><h3 class="np-more-head">More from this show</h3><ul class="np-list"></ul></section>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    ['sheet', 'grab', 'close', 'scroll', 'show', 'title', 'meta', 'range', 'cur', 'dur', 'toggle', 'along', 'share', 'more', 'list']
      .forEach(function (k) { els[k] = dlg.querySelector('.np-' + k); });
    els.img = dlg.querySelector('.np-art img');
    els.openShow = dlg.querySelector('.np-open-show');
    els.img.addEventListener('error', function () { els.img.removeAttribute('src'); dlg.querySelector('.np-art').classList.add('is-empty'); });

    els.close.addEventListener('click', close);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });   // Esc
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });    // the dimmed area
    els.toggle.addEventListener('click', function () { app.player.toggle(); });
    dlg.querySelectorAll('.np-skip').forEach(function (b) { b.addEventListener('click', function () { app.player.skip(Number(b.dataset.skip)); }); });
    els.range.addEventListener('input', function () { seeking = true; els.cur.textContent = app.player.formatTime(Number(els.range.value)); });
    els.range.addEventListener('change', function () { app.player.seek(Number(els.range.value)); seeking = false; });
    els.openShow.addEventListener('click', function () {
      var c = app.player.current(); if (!c || !c.row) return;
      closeThen(function () { app.player.openShow(c.row.id); });
    });
    els.share.addEventListener('click', function () {
      var c = app.player.current(); if (!c || !c.row || !navigator.share) return;
      navigator.share({ title: c.row.title, text: c.row.title + ' — ' + app.player.stationLabel() + ' Archive', url: app.player.shareUrl(c.row) })
        .catch(function () { /* dismissed by the listener, or no target chosen */ });
    });
    els.along.addEventListener('click', function () {
      var t = document.getElementById('playerAlong');
      if (t) closeThen(function () { t.click(); });
    });
    els.list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) app.player.play(b.dataset.id);   // the sheet follows (loadstart repaints it)
    });
    dragToClose();

    var a = app.player.audio;
    ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'].forEach(function (t) { a.addEventListener(t, paintTime); });
    ['play', 'pause', 'playing', 'waiting', 'ended', 'loadstart'].forEach(function (t) { a.addEventListener(t, paintState); });
    a.addEventListener('loadstart', function () { if (dlg.open) setTimeout(paint, 0); });
    document.addEventListener('archive:barmode', function (e) { if (e.detail && e.detail.mode !== 'archive' && dlg.open) close(); });
    window.addEventListener('popstate', function () { if (dlg.open && pushed) { pushed = false; hide(); } });
  }

  // Drag the top of the sheet down to close it (phones). A short drag springs back.
  function dragToClose() {
    var startY = 0, dy = 0, dragging = false;
    els.grab.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.np-close')) return;
      dragging = true; startY = e.clientY; dy = 0;
      els.grab.setPointerCapture(e.pointerId);
      els.sheet.classList.add('is-dragging');
    });
    els.grab.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      els.sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      els.sheet.classList.remove('is-dragging');
      els.sheet.style.transform = '';
      if (dy > 110) close();
    }
    els.grab.addEventListener('pointerup', end);
    els.grab.addEventListener('pointercancel', end);
  }

  // The big line: the episode's own title (a topic) when it has one; otherwise the date — a
  // repeat of the show name above it tells the listener nothing. dateText is
  // "Tuesday, September 29, 2026 8:00 am": the day for the headline, the time underneath.
  function headline(r, short) {
    var own = app.player.episodeTitle(r), d = /^(.*\d{4}) (\d{1,2}:\d{2} [ap]m)$/.exec(r.dateText || '');
    var day = d ? d[1].replace(/, \d{4}$/, '') : (r.dateText || ''), time = d ? d[2] : '';
    if (own && own !== r.title && own.indexOf(r.title + ' — ') !== 0) {
      return { title: own, meta: [r.dateText, short ? r.length : (r.host ? 'with ' + r.host : '')].filter(Boolean).join(' · ') };
    }
    return { title: day || r.title, meta: [time, short ? r.length : (r.host ? 'with ' + r.host : '')].filter(Boolean).join(' · ') };
  }
  function paintTime() {
    if (!dlg || !dlg.open) return;
    var a = app.player.audio, d = isFinite(a.duration) ? a.duration : 0;
    els.range.max = String(Math.floor(d));
    if (!seeking) { els.range.value = String(Math.floor(a.currentTime || 0)); els.cur.textContent = app.player.formatTime(a.currentTime); }
    els.dur.textContent = app.player.formatTime(d);
    var pct = d ? Math.min(100, (a.currentTime / d) * 100) : 0;
    els.range.style.setProperty('--np-fill', pct + '%');   // CSSOM: allowed by the CSP
  }
  function paintState() {
    if (!dlg || !dlg.open) return;
    var c = app.player.current(), a = app.player.audio, on = !!c && !a.paused && !a.ended;
    els.toggle.innerHTML = (on ? ICON.pause : ICON.play) + '<span class="spinner" aria-hidden="true"></span>';
    els.toggle.setAttribute('aria-label', on ? 'Pause' : 'Play');
    els.toggle.classList.toggle('is-loading', !!(c && c.loading));
  }
  function paint() {
    var c = app.player.current();
    if (!c) { close(); return; }
    var r = c.row;
    els.img.alt = r ? r.title : c.title;
    dlg.querySelector('.np-art').classList.toggle('is-empty', !c.photo);
    if (c.photo) els.img.src = c.photo; else els.img.removeAttribute('src');
    var h = r ? headline(r) : { title: c.title, meta: c.sub };
    els.show.textContent = r ? r.title : '';
    els.title.textContent = h.title;
    els.meta.textContent = h.meta;
    els.openShow.hidden = !r;
    els.share.hidden = !(r && navigator.share);
    // Transcript / Songs: the player bar's own button (Discovery), when it offers one.
    var t = document.getElementById('playerAlong');
    els.along.hidden = !t || t.hidden;
    if (t && !t.hidden) els.along.innerHTML = t.innerHTML;
    // More from this show
    var more = r ? app.player.showEpisodes(r, 5) : [];
    els.list.textContent = '';
    more.forEach(function (x) {
      var li = el('li');
      var b = el('button', 'np-ep'); b.type = 'button'; b.dataset.id = x.id;
      var hx = headline(x, true);
      b.setAttribute('aria-label', 'Play ' + hx.title + ', ' + hx.meta);
      b.innerHTML = '<span class="np-ep-play">' + ICON.small + '</span>';
      var txt = el('span', 'np-ep-text');
      txt.appendChild(el('span', 'np-ep-title', hx.title));
      txt.appendChild(el('span', 'np-ep-meta', hx.meta));
      b.appendChild(txt);
      li.appendChild(b); els.list.appendChild(li);
    });
    els.more.hidden = !more.length;
    paintTime(); paintState();
  }

  function open(trigger) {
    if (!app || !app.player.current()) return;
    if (!dlg) build();
    dlg.showModal();          // open first: paintTime/paintState only paint an open sheet
    paint();
    dlg.classList.add('is-open');
    els.scroll.scrollTop = 0;
    els.close.focus();
    try { history.pushState(Object.assign({}, history.state, { nowPlaying: 1 }), ''); pushed = true; }
    catch (e) { pushed = false; }
    open.trigger = trigger || null;
  }
  function hide() {
    if (!dlg || !dlg.open) return;
    dlg.classList.remove('is-open');
    dlg.close();
    if (open.trigger && document.contains(open.trigger)) open.trigger.focus();
  }
  function close() {
    if (pushed) { pushed = false; history.back(); }   // popstate is ignored: pushed is already false
    hide();
  }
  // Close, then do something that opens another layer (the show sheet, Listen along).
  function closeThen(fn) { close(); setTimeout(fn, 60); }

  window.NowPlaying = {
    active: function () { return !!app && flag() && matchMedia(PHONE).matches; },
    open: open,
    close: close,
    isOpen: function () { return !!(dlg && dlg.open); },
  };
  // app.js is loaded before this file (both deferred, in order).
  app = window.ArchiveApp || null;
  if (!app || !app.player) console.warn('[now-playing] the player interface is missing; Now Playing is off.');
})();
