/* "Listen along" — one panel for timed text beside the audio: a QIR transcript, or the
 * station's cue-file song list. Wide screens: a drawer that pushes the page; tablets: a
 * drawer over it; phones: a bottom sheet above the player with half/full stops. The panel
 * follows whatever is playing, highlights the current line, and taps seek the audio. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stamp = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sec = String(s%60).padStart(2,'0'); return h ? `${h}:${String(m).padStart(2,'0')}:${sec}` : `${m}:${sec}`; };
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 699px)').matches;
  const cueId = row => (/\/cue\/(\d{1,10})\.vti$/.exec(row?.vtiUrl || '') || [])[1] || '';
  // What an episode offers, default first: a QIR transcript (not for a pending record, which
  // QIR has not processed yet) and/or the station's song list. Music shows open on Songs —
  // skipping song to song is the point of them (Paul, 2026-09-26); the switch shows the other.
  const kindsOf = row => {
    const k = [];
    if(row?.qir && !row.qir.pending) k.push('transcript');
    if(cueId(row)) k.push('songs');
    return row?.cat === 'music' ? k.reverse() : k;
  };
  const kindOf = row => kindsOf(row)[0] || '';

  const TRANSCRIPT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></svg>';
  const SONGS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  const tally = k => window.ArchiveStats?.count(k); // stats step 6: named counters only
  let findCounted = false;
  let api = null, panel, list, find, note = '', openId = '', lines = [], plainText = '', kind = '', following = true, nowIndex = -1, matches = [], matchAt = -1, pushed = false, loadToken = 0;
  // The host's audio element, player bar and Transcript button, and which episode is playing
  // (integration step 4e: Discovery's page passes nothing and keeps its own; the main page
  // passes its player). currentId() is the playing episode's row id, '' when none.
  const audioEl = () => api.audio || $('audio');
  const playerEl = () => api.player || $('player');
  const toggleEl = () => api.toggle || $('alongToggle');
  const currentId = () => api.currentId ? api.currentId() : (audioEl().dataset.id || '');
  // Open or closed as the listener sees it, set the moment they open or close it. The panel
  // stays un-hidden for its 300 ms slide-out, so "not hidden" read as open while closing and
  // the Transcript button stayed lit after the panel was closed (2026-09-28).
  let isShown = false;
  const cache = new Map();

  function build() {
    panel = document.createElement('aside');
    panel.id = 'along'; panel.className = 'rv-along'; panel.hidden = true; panel.setAttribute('aria-labelledby','alongTitle');
    panel.innerHTML = `<div class="rv-along-handle" id="alongHandle" aria-hidden="true"><span></span></div>
<header class="rv-along-head"><img class="rv-along-art" id="alongArt" alt="" hidden><div class="rv-along-headtext"><p class="rv-eyebrow" id="alongKind"></p><p class="rv-along-show" id="alongShow"></p></div>
<button type="button" class="rv-close" id="alongClose" aria-label="Close listen along">×</button>
<h2 id="alongTitle" tabindex="-1"></h2><p class="rv-along-sub"><span id="alongSub"></span><button type="button" class="rv-along-more" id="alongMore" aria-expanded="false" aria-controls="alongAbout" hidden><span>About</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></p><div class="rv-along-switch" id="alongSwitch" role="group" aria-label="Listen along with" hidden><button type="button" data-kind="transcript">Transcript</button><button type="button" data-kind="songs">Songs</button></div></header>
<div class="rv-along-body"><div class="rv-along-about" id="alongAbout" role="region" aria-label="About this episode" hidden></div>
<div class="rv-along-find"><input id="alongFind" type="search" placeholder="Find in this episode" aria-label="Find in this episode" autocomplete="off">
<span id="alongCount" class="rv-along-count" role="status" aria-live="polite"></span>
<button type="button" class="rv-along-step" id="alongPrev" aria-label="Previous match">↑</button><button type="button" class="rv-along-step" id="alongNext" aria-label="Next match">↓</button>
<label class="rv-along-only" id="alongOnlyLabel" hidden><input type="checkbox" id="alongOnly"> Matches only</label></div>
<div class="rv-along-list" id="alongList" tabindex="-1"></div></div>
<button type="button" class="rv-along-now" id="alongNow" hidden>↓ Back to now</button>`;
    document.body.appendChild(panel);
    list = $('alongList'); find = $('alongFind');
    $('alongClose').onclick = () => close();
    $('alongSwitch').onclick = e => { const b = e.target.closest('button[data-kind]'); if(b && b.dataset.kind !== kind) { show(openId, {query: find.value, kind: b.dataset.kind}); tallyKind(); } };
    $('alongMore').onclick = () => setExpanded(!aboutOpen());
    // Escape and a tap outside the About card close the card first, then the panel.
    panel.addEventListener('keydown', e => { if(e.key === 'Escape') { e.stopPropagation(); if(aboutOpen()) { setExpanded(false); $('alongMore').focus(); } else close(); } });
    panel.addEventListener('pointerdown', e => { if(aboutOpen() && !e.target.closest('#alongAbout, #alongMore')) setExpanded(false); });
    find.addEventListener('input', () => { paintLines(); stepMatch(0); if(!findCounted && find.value.trim().length >= 2) { findCounted = true; tally('transcriptFind'); } });
    find.addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); } });
    $('alongNext').onclick = () => stepMatch(1); $('alongPrev').onclick = () => stepMatch(-1);
    $('alongOnly').onchange = () => { paintLines(); stepMatch(0); };
    list.addEventListener('click', e => { const b = e.target.closest('[data-at]'); if(b) { following = true; api.seek(openId, Number(b.dataset.at)); tally(kind === 'songs' ? 'songJump' : 'lineJump'); } });
    // Any deliberate scroll by the reader stops auto-follow until "Back to now".
    for(const type of ['wheel','touchmove','keydown']) list.addEventListener(type, e => { if(type !== 'keydown' || /^(Arrow|Page|Home|End)/.test(e.key)) { following = false; paintNowPill(); } }, {passive:true});
    $('alongNow').onclick = () => { following = true; scrollToNow(true); paintNowPill(); };
    dragSheet();
    // The main page measures --player-h itself (app.js); only Discovery's page needs this.
    if(!api.hostMeasuresPlayer) new ResizeObserver(() => document.documentElement.style.setProperty('--player-h', (playerEl().hidden ? 0 : playerEl().offsetHeight) + 'px')).observe(playerEl());
    window.addEventListener('popstate', () => { if(isShown && pushed && !history.state?.along) { pushed = false; hide(); } });
  }

  // Phone sheet: drag the handle between half and full height; drag low to close.
  function dragSheet() {
    const handle = $('alongHandle'); let startY = 0, startH = 0, dragging = false;
    handle.addEventListener('pointerdown', e => { if(!phone()) return; dragging = true; startY = e.clientY; startH = panel.getBoundingClientRect().height; handle.setPointerCapture(e.pointerId); panel.classList.add('dragging'); });
    handle.addEventListener('pointermove', e => { if(dragging) panel.style.height = Math.max(80, startH + startY - e.clientY) + 'px'; });
    const end = () => {
      if(!dragging) return; dragging = false; panel.classList.remove('dragging');
      const h = panel.getBoundingClientRect().height, room = innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-h')) || 0);
      panel.style.height = '';
      if(h < room * 0.3) close(); else panel.classList.toggle('full', h > room * 0.72);
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', () => panel.classList.toggle('full'));
  }

  function lineHtml(l, i, q) {
    const mark = text => { if(!q) return esc(text); const lower = text.toLowerCase(); let out = '', from = 0, at; while((at = lower.indexOf(q, from)) >= 0) { out += esc(text.slice(from, at)) + '<mark>' + esc(text.slice(at, at + q.length)) + '</mark>'; from = at + q.length; } return out + esc(text.slice(from)); };
    const sub = l.artist ? `<span class="rv-along-artist">${mark(l.artist)}</span>` : '';
    return `<button type="button" class="rv-along-line${kind === 'songs' ? ' song' : ''}" data-at="${l.start}" data-i="${i}"><span class="rv-along-time">${stamp(l.start)}</span><span class="rv-along-text">${mark(l.text)}${sub}</span></button>`;
  }
  function paintLines() {
    const q = find.value.trim().toLowerCase(), only = $('alongOnly').checked && q;
    matches = q ? lines.map((l, i) => (l.text + ' ' + (l.artist || '')).toLowerCase().includes(q) ? i : -1).filter(i => i >= 0) : [];
    if(!lines.length) { list.innerHTML = plainText ? plainText.split(/\n{2,}/).map(p => `<p class="rv-bodytext">${esc(p)}</p>`).join('') : ''; $('alongCount').textContent = ''; return; }
    const shown = only ? matches.map(i => [lines[i], i]) : lines.map((l, i) => [l, i]);
    // The provenance note scrolls with the lines so it never costs the phone sheet space.
    list.innerHTML = `<p class="rv-along-note" lang="en">${esc(note)}</p>` + (shown.length ? shown.map(([l, i]) => lineHtml(l, i, q)).join('') : `<p class="rv-along-empty">No matches for “${esc(find.value)}”.</p>`);
    $('alongOnlyLabel').hidden = !q;
    $('alongCount').textContent = q ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}` : '';
    $('alongPrev').disabled = $('alongNext').disabled = !matches.length;
    nowIndex = -1; followAudio();
  }
  function stepMatch(dir) {
    if(!matches.length) { matchAt = -1; return; }
    matchAt = dir === 0 ? 0 : (matchAt + dir + matches.length) % matches.length;
    const el = list.querySelector(`[data-i="${matches[matchAt]}"]`); if(!el) return;
    list.querySelectorAll('.is-match').forEach(e => e.classList.remove('is-match')); el.classList.add('is-match');
    following = false; paintNowPill();
    el.scrollIntoView({block:'center', behavior: reduceMotion() ? 'auto' : 'smooth'});
    $('alongCount').textContent = `${matchAt + 1} of ${matches.length}`;
  }
  function currentIndex(t) {
    let lo = 0, hi = lines.length - 1, found = -1;
    while(lo <= hi) { const mid = (lo + hi) >> 1; if(lines[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found >= 0 && t < lines[found].end + 0.25 ? found : -1;
  }
  // Read-along (2026-09-24, after Paul's "jump" feedback): the old follow re-centred
  // the list instantly on every line, several times a minute. Now the current line
  // rests in a comfort zone about a third of the way down and the list glides only
  // when it nears the edges; past lines fade, the current line shows a progress bar;
  // changes cross-fade in CSS. Reduced motion: no glide, no fades.
  // Revised after Paul's second look: big occasional glides still read as jumps, so each
  // new line now takes one short glide back to the resting point, and the list's top and
  // bottom edges fade (CSS mask) so text dissolves as it leaves rather than vanishing.
  const REST = 0.33;
  function followAudio() {
    if(panel.hidden || !lines.length) return;
    const audio = audioEl(), mine = currentId() === openId, t = audio.currentTime || 0;
    const i = mine ? currentIndex(t) : -1;
    if(i !== nowIndex) {
      const prev = nowIndex;
      list.querySelector('.is-now')?.classList.remove('is-now'); list.querySelector('[aria-current]')?.removeAttribute('aria-current');
      nowIndex = i;
      paintPast(prev, i);
      const el = i >= 0 ? list.querySelector(`[data-i="${i}"]`) : null;
      if(el) { el.classList.add('is-now'); el.setAttribute('aria-current','true'); if(following) keepInZone(el); }
      paintNowPill();
    }
  }
  // Lines before the current one are "past". Forward steps only touch the lines
  // crossed; a seek (backwards, or a jump) repaints them all.
  function paintPast(prev, i) {
    const els = list.querySelectorAll('.rv-along-line');
    if(prev >= -1 && i >= prev && i - prev < 50) { for(let k = Math.max(prev, 0); k < i; k++) list.querySelector(`[data-i="${k}"]`)?.classList.add('is-past'); return; }
    els.forEach(el => el.classList.toggle('is-past', i >= 0 && Number(el.dataset.i) < i));
  }
  function lineTop(el) { return el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop; }
  // One short glide per line: rest the current line a third of the way down.
  function keepInZone(el) {
    const target = lineTop(el) - list.clientHeight * REST;
    if(Math.abs(target - list.scrollTop) < 2) return;
    list.scrollTo({top: target, behavior: reduceMotion() ? 'auto' : 'smooth'});
  }
  function scrollToNow(smooth) {
    const el = list.querySelector('.is-now'); if(!el) return;
    // Measured against the list, not the panel: the header above it must not count.
    list.scrollTo({top: lineTop(el) - list.clientHeight * REST, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto'});
  }
  // About opens as a card over the find bar and the top of the list, never in the
  // header's flow: the header keeps its height, so the transcript is not squashed.
  // The title stays clamped to two lines; the card repeats it in full when clipped.
  const aboutOpen = () => !$('alongAbout').hidden;
  function setExpanded(open) {
    const head = panel.querySelector('.rv-along-head');
    open = open && !$('alongMore').hidden;
    head.classList.toggle('expanded', open); $('alongAbout').hidden = !open;
    $('alongMore').setAttribute('aria-expanded', String(open));
  }
  function paintAbout(summary) {
    const title = $('alongTitle'), card = $('alongAbout');
    card.innerHTML = ''; setExpanded(false);
    requestAnimationFrame(() => {
      const clipped = title.scrollHeight > title.clientHeight + 1;
      card.innerHTML = (clipped ? `<p class="rv-along-about-title">${esc(title.textContent)}</p>` : '') + (summary ? `<p>${esc(summary)}</p>` : '');
      $('alongMore').hidden = !card.innerHTML;
    });
  }
  function paintNowPill() { $('alongNow').hidden = following || nowIndex < 0; }

  async function loadData(row, k) {
    const key = k + ':' + row.id;
    if(cache.has(key)) return cache.get(key);
    let data;
    if(k === 'transcript') {
      const r = await fetch('/api/plugins/qir/transcript/' + encodeURIComponent(row.qir.public_id));
      if(!r.ok) throw new Error(r.status === 404 ? 'There is no transcript for this episode yet.' : 'The transcript service is unavailable. Try again shortly.');
      const j = await r.json();
      data = {lines: window.QirTranscript.parse(j.vtt, row.durationSec), text: j.transcript || '', lang: window.PlainText.langCode(j.language)};
    } else {
      const r = await fetch('/api/cue/' + cueId(row));
      if(!r.ok) throw new Error('The song list for this episode is unavailable.');
      const j = await r.json();
      data = {lines: window.Playlist.parse(j.vtt, row.durationSec).map(t => ({start:t.start, end:t.end, text:t.title, artist:t.artist})), text: ''};
    }
    if(cache.size > 40) cache.delete(cache.keys().next().value);
    cache.set(key, data); return data;
  }
  async function show(id, {query = api.query ? api.query() : '', kind: want = ''} = {}) {
    const row = api.getRow(id); if(!row) return;
    const kinds = kindsOf(row);
    openId = id; kind = kinds.includes(want) ? want : kinds[0] || ''; following = true; nowIndex = -1; matchAt = -1;
    $('alongSwitch').hidden = kinds.length < 2;
    for(const b of $('alongSwitch').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    $('alongKind').textContent = kind === 'transcript' ? 'Transcript' : kind === 'songs' ? 'Songs in this episode' : 'Listen along';
    $('alongTitle').textContent = api.title(row); $('alongSub').textContent = api.meta(row);
    $('alongShow').textContent = api.show ? api.show(row) : '';
    const art = api.art ? api.art(row) : ''; $('alongArt').hidden = !art; if(art) $('alongArt').src = art;
    paintAbout(api.about ? api.about(row) : '');
    note = kind === 'transcript' ? 'Machine transcript from QIR — names and words may be wrong. Tap any line to play from there.' : kind === 'songs' ? 'From the station’s playlist log. Tap a song to play from there.' : '';
    findCounted = false; find.value = query; $('alongOnly').checked = false; $('alongOnlyLabel').hidden = !query;
    const token = ++loadToken;
    if(!kind) { lines = []; plainText = ''; list.innerHTML = '<p class="rv-along-empty">No transcript or song list is available for this episode.</p>'; paintAvailability(); return; }
    list.removeAttribute('lang');
    list.innerHTML = '<p class="rv-along-empty">Loading…</p>';
    try {
      const data = await loadData(row, kind); if(token !== loadToken) return;
      lines = data.lines; plainText = data.text;
      list.classList.toggle('has-hours', lines.some(l => l.start >= 3600));
      if(data.lang) list.lang = data.lang; else list.removeAttribute('lang');
      if(!lines.length && !plainText) { list.innerHTML = `<p class="rv-along-empty">${kind === 'songs' ? 'No songs were logged for this episode — it is probably all talk.' : 'This transcript is empty.'}</p>`; return; }
      paintLines(); if(query) stepMatch(0); else scrollToNow(false);
    } catch(error) { if(token === loadToken) { lines = []; list.innerHTML = `<p class="rv-along-empty">${esc(error.message)}</p>`; console.warn('Listen along load failed:', error.message); } }
    paintAvailability();
  }
  // show() settles `kind` before its first await, so this reads the panel just opened.
  // Only user opens and the Transcript/Songs switch count — not the automatic re-follow.
  function tallyKind() { if(kind) tally(kind === 'songs' ? 'songsOpen' : 'transcriptOpen'); }
  function open(id, options) {
    if(!panel) build();
    const wasHidden = panel.hidden;
    panel.hidden = false; document.body.classList.add('along-open'); isShown = true;
    if(wasHidden) panel.classList.toggle('full', phone()); // small screens get all the height; drag down for half
    // Also when reopened mid-slide-out: the panel is not hidden yet but must slide back in.
    requestAnimationFrame(() => panel.classList.add('shown'));
    // The phone Back button closes the panel rather than leaving the page.
    if(!pushed) { history.pushState({...(history.state || {}), along: true}, '', location.href); pushed = true; }
    show(id, options); tallyKind(); api.onChange?.();
    $('alongTitle').focus({preventScroll: true});
  }
  function hide() {
    isShown = false; panel.classList.remove('shown'); document.body.classList.remove('along-open');
    const done = () => { if(!panel.classList.contains('shown')) panel.hidden = true; api.onChange?.(); };
    if(reduceMotion()) done(); else setTimeout(done, 300);
    paintAvailability(); toggleEl()?.focus({preventScroll: true});
  }
  function close() { if(!panel || !isShown) return; if(pushed) { pushed = false; history.back(); } hide(); }
  function paintAvailability() {
    const btn = toggleEl(); if(!btn) return;
    const row = api?.getRow(currentId()), k = kindOf(row);
    // Icon + label; phones show the icon only, so the label also names the button.
    const label = k === 'transcript' ? 'Transcript' : 'Songs';
    btn.hidden = !k; btn.querySelector('.rv-alongtoggle-label').textContent = label;
    btn.querySelector('.rv-alongtoggle-icon').innerHTML = k === 'songs' ? SONGS_ICON : TRANSCRIPT_ICON;
    btn.setAttribute('aria-label', (isShown ? 'Close ' : 'Open ') + label.toLowerCase());
    btn.setAttribute('aria-expanded', String(isShown));
  }
  function init(options) {
    api = options; build();
    const audio = audioEl();
    audio.addEventListener('timeupdate', followAudio); audio.addEventListener('seeked', followAudio);
    // The panel belongs to what is playing: a new episode brings its own words.
    audio.addEventListener('loadstart', () => { paintAvailability(); const id = currentId(); if(isShown && id && id !== openId) show(id); });
    toggleEl().onclick = () => isShown ? close() : open(currentId());
    paintAvailability();
  }
  window.ListenAlong = {init, open, close, kindOf, kindsOf, isOpen: () => isShown, refresh: () => paintAvailability()};
})();
