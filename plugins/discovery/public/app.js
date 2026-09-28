/* Optional Discover interface; existing archive data, no QIR dependency or tracking. */
'use strict';
(() => {
  if(document.body.dataset.view === 'admin') return; // admin.js owns that view
  const $ = id => document.getElementById(id);
  const station = window.StationConfig;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const params = new URLSearchParams(location.search);
  // An explicit ?source= wins; otherwise QIR is the default once the server has a key, since
  // its summaries are what episode search needs (the archive feed rarely carries episode notes).
  // Every URL read and write goes through defaultSource/sourceFrom so a link without
  // ?source= means the same thing on load, reload, share and Back.
  let defaultSource = 'archive', qirAvailable = true;
  const sourceFrom = p => { const v = ['qir','archive'].includes(p.get('source')) ? p.get('source') : defaultSource; return v === 'qir' && !qirAvailable ? 'archive' : v; };
  let source = sourceFrom(params);
  let dateFrom = params.get('from') || '', dateTo = params.get('to') || '';
  let qirStatus = null, loadVersion = 0;
  let pendingAlong = null; // {id, kind}: Listen along to open once the dialog has closed
  let query = params.get('q') || '', category = params.get('category') || 'all';
  let scope = ['all','shows','episodes'].includes(params.get('scope')) ? params.get('scope') : 'all';
  let rows = [], shows = [], byShow = new Map(), byId = new Map(), visible = 16, route = null, trigger = null;
  const expanded = new Set(); // show groups opened with "Show all N matches"
  let liveQir = false, directoryNow = {}, lastCheck = 0, checking = false;
  let modalHistory = false, searchIndex = null, hits = {shows:new Map(), episodes:new Map()}, hitsKey = '';
  let episodeShow = params.get('episode_show') || '';
  let showLimit = 6;
  // Browse order for "Explore shows" — same choices as the podcast app's sort menu.
  // Search results keep relevance order. URL wins over this device's saved choice.
  const SORTS = ['az','recent','category'];
  let sortBy = (() => { const u = params.get('sort'); if(SORTS.includes(u)) return u; try { const v = localStorage.getItem(station.storagePrefix+'sort'); return SORTS.includes(v) ? v : 'az'; } catch { return 'az'; } })();
  const CAT_ORDER = ['news','public-affairs','arts','health','music','science','special'];
  const labels = {news:'News','public-affairs':'Public Affairs',arts:'Arts & Culture',health:'Health',music:'Music',science:'Science & Tech',espanol:'En Español',special:'Special Programming'};
  const date = row => row.qir ? row.qir.air_date : new Intl.DateTimeFormat('en-US',{timeZone:station.timezone,month:'short',day:'numeric',year:'numeric'}).format(new Date(row.dt * 1000));
  const time = row => row.qir ? (row.qir.air_start ? row.qir.air_start.slice(0,5)+' · Los Angeles' : 'Time not listed') : new Intl.DateTimeFormat('en-US',{timeZone:station.timezone,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(row.dt * 1000));
  const duration = row => (row.totalSec || row.durationSec) ? `${Math.round((row.totalSec || row.durationSec) / 60)} min` : '';
  // Shared rule (archive-search.js): an over-long topic is a description, not a title.
  const title = row => window.ArchiveSearch.episodeTitle(row) || `${row.title} · ${date(row)}`;
  const photo = row => /^(\/api\/artwork\/|\/assets\/)/.test(row.photo || '') ? row.photo : station.assets.icon;
  const art = (row, eager = false) => `<img src="${esc(photo(row))}" alt="" loading="${eager ? 'eager' : 'lazy'}">`;
  const action = (kind, id, text, cls = 'rv-quiet') => `<button type="button" class="${cls}" data-${kind}="${esc(id)}">${esc(text)}</button>`;
  // Every play control is drawn from, and re-synced to, the one audio element's state
  // (same model as the podcast template's updatePlayButtons), so no button shows stale state.
  let loadingId = '';
  const svgPlay = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const svgPause = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  // A second part (a corrected hour cut in two, lib/qir/corrections.js) plays under its first part's card.
  const owner = id => (byId.get(id) || {}).partOf || id;
  function playState(id) {
    const audio = $('audio'), current = !!audio.dataset.id && owner(audio.dataset.id) === id, loading = current && owner(loadingId) === id;
    return {current, loading, playing: current && !loading && !audio.paused && !audio.ended};
  }
  const glyph = s => s.loading ? '<span class="rv-spin" aria-hidden="true"></span>' : s.playing ? svgPause : svgPlay;
  const playVerb = s => s.loading ? 'Loading' : s.playing ? 'Pause' : 'Play';
  const detailLabel = (s, idle) => s.loading ? 'Loading…' : s.playing ? 'Ⅱ Pause episode' : s.current ? '▶ Resume episode' : idle;
  const playButton = row => { const s = playState(row.id); return `<button class="rv-play${s.playing ? ' playing' : ''}${s.loading ? ' loading' : ''}" type="button" data-play="${esc(row.id)}" data-title="${esc(title(row))}" aria-label="${playVerb(s)} ${esc(title(row))}">${glyph(s)}</button>`; };
  const detailPlay = (id, idle) => `<button type="button" class="rv-primary rv-detailplay" data-play="${esc(id)}" data-idle="${esc(idle)}">${esc(detailLabel(playState(id), idle))}</button>`;
  function syncPlayButtons() {
    document.querySelectorAll('.rv-play[data-play]').forEach(btn => {
      const s = playState(btn.dataset.play);
      btn.classList.toggle('playing', s.playing); btn.classList.toggle('loading', s.loading);
      btn.innerHTML = glyph(s); btn.setAttribute('aria-label', playVerb(s)+' '+btn.dataset.title);
    });
    document.querySelectorAll('.rv-detailplay').forEach(btn => { btn.textContent = detailLabel(playState(btn.dataset.play), btn.dataset.idle); });
  }
  // Show more / Show less on a result preview (markup from ArchiveSearch.expandable).
  function toggleExpand(button) {
    const box = button.parentNode, open = button.getAttribute('aria-expanded') !== 'true';
    box.querySelector('.search-short').hidden = open; box.querySelector('.search-full').hidden = !open;
    button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Show less' : 'Show more';
  }
  function syncUrl(push = false) {
    const p = new URLSearchParams();
    if(source !== defaultSource) p.set('source',source);
    if(dateFrom) p.set('from',dateFrom);
    if(dateTo) p.set('to',dateTo);
    if(query) p.set('q',query);
    if(category !== 'all') p.set('category',category);
    if(sortBy !== 'az') p.set('sort',sortBy);
    if(scope !== 'all') p.set('scope',scope);
    if(episodeShow) p.set('episode_show',episodeShow);
    if(route) p.set(route.kind,route.id);
    history[push ? 'pushState' : 'replaceState']({review:true},'',location.pathname + (p.size ? '?' + p : ''));
  }
  // Ranking is the podcast template's shared ArchiveSearch index; this view only filters and lays out.
  function searchHits() {
    const key = query+'\u0000'+category;
    if(key !== hitsKey && searchIndex) {
      const found = window.ArchiveSearch.find(searchIndex, query, category);
      hits = {shows:new Map(found.shows.map(h => [h.show.id,h])), episodes:new Map(found.episodes.map(h => [h.row.id,h]))};
      hitsKey = key;
    }
    return hits;
  }
  const showMatch = show => !norm(query) ? 1 : searchHits().shows.get(show.id)?.score || 0;
  const episodeMatch = row => !norm(query) ? 1 : searchHits().episodes.get(row.id)?.score || 0;
  const matchReason = (kind, id) => norm(query) ? searchHits()[kind].get(id)?.reason || '' : '';
  // Archive episode QIR lacks (lib/qir/pending.js): not reached yet, or skipped (QIR has
  // processed later episodes, so none is coming). Either way no summary or transcript.
  const pendingNote = row => !(row.qir && row.qir.pending) ? '' : row.qir.skipped ? ' · No transcript' : ' · Transcript pending';
  function episodeHtml(row, withExcerpt = false) {
    const blurb = window.ArchiveSearch.episodeBlurb(row);
    // Search results: matched words highlighted, long previews expandable (shared helpers).
    const text = withExcerpt && blurb ? window.ArchiveSearch.expandable(blurb,query,160) : '';
    const heading = withExcerpt ? `<button type="button" class="rv-titlebutton" data-episode="${esc(row.id)}">${window.ArchiveSearch.highlight(title(row),query)}</button>` : action('episode',row.id,title(row),'rv-titlebutton');
    const reason = withExcerpt ? matchReason('episodes',row.id) : '';
    return `<article class="rv-episode">${art(row)}<div class="rv-copy">${reason ? `<div class="rv-match">Matches ${esc(reason.toLowerCase())}</div>` : ''}${heading}<p class="rv-meta">${esc(row.title)} · ${esc(date(row))} · ${esc(time(row))}${duration(row) ? ' · '+duration(row) : ''}${pendingNote(row)}</p>${text ? `<p class="rv-excerpt">${text}</p>` : ''}</div>${playButton(row)}</article>`;
  }
  function showCard(show) {
    return `<button type="button" class="rv-showcard" data-show="${esc(show.id)}">${art(show.latest)}<p class="rv-eyebrow">${esc(labels[show.cat] || 'Show')}</p><h3>${esc(show.name)}</h3><p>${esc(show.host || station.name)}</p><p>Latest · ${esc(date(show.latest))}</p></button>`;
  }
  function showResult(show) {
    const reason = matchReason('shows',show.id);
    return `<article class="rv-showresult">${art(show.latest)}<div class="rv-copy">${reason && reason !== 'Show name' ? `<div class="rv-match">Matches ${esc(reason.toLowerCase())}</div>` : ''}<button type="button" class="rv-titlebutton" data-show="${esc(show.id)}">${window.ArchiveSearch.highlight(show.name,query)}</button><p>${show.description ? window.ArchiveSearch.expandable(show.description,query,145) : esc(show.host || labels[show.cat])}</p><p class="rv-meta">${show.episodes.length} available episodes · Latest ${esc(date(show.latest))}</p></div>${action('show',show.id,'View show →')}</article>`;
  }
  // Sort lives in the Explore shows header (it orders that grid only, not Just aired).
  function sortControl() {
    const opt = (v,l) => `<option value="${v}"${sortBy===v?' selected':''}>${l}</option>`;
    return `<label class="rv-category rv-sortlabel">Sort <select id="sort">${opt('az','A–Z')}${opt('recent','Recently aired')}${opt('category','Category')}</select></label>`;
  }
  function browseOrder(a,b) {
    if(sortBy === 'recent') return b.latest.dt - a.latest.dt || a.name.localeCompare(b.name);
    if(sortBy === 'category') return (CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat)) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  }
  // Category order gets a full-width heading wherever the category changes.
  function showCards(list) {
    let last = null;
    return list.map(s => { const head = sortBy === 'category' && s.cat !== last ? `<h3 class="rv-gridheading">${esc(labels[s.cat] || 'Other')}</h3>` : ''; last = s.cat; return head + showCard(s); }).join('');
  }
  function airDay(row) {
    return row.qir ? row.qir.air_date : new Intl.DateTimeFormat('en-CA',{timeZone:station.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.dt*1000));
  }
  function inDates(row) { const day=airDay(row);return (!dateFrom || day>=dateFrom)&&(!dateTo || day<=dateTo); }
  // Lazy load (2026-09-25, as kpfk-archive does): when a list is the last thing on the page,
  // its "Show more" button loads the next batch as it nears the viewport. The button stays
  // for keyboard users and browsers without IntersectionObserver. Not in an "All" search,
  // where shows sit above episodes and that episodes button switches to the Episodes tab.
  const autoMore = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    if(entries.some(e => e.isIntersecting)) { autoMore.disconnect(); entries[0].target.click(); }
  },{rootMargin:'600px 0px'}) : null;
  // Just aired rows for the current filters (render and the live refresh share this).
  const matchingEpisodeRows = () => rows.filter(r => inDates(r) && (!episodeShow || r.sho === episodeShow) && (category === 'all' || r.cat === category) && episodeMatch(r)).sort((a,b) => episodeMatch(b)-episodeMatch(a) || b.dt-a.dt);
  const railRows = list => JustAired.pick(list,{timeZone:station.timezone});
  function render() {
    const matchingShows = shows.filter(s => s.episodes.some(inDates) && (category === 'all' || s.cat === category) && showMatch(s)).sort(query ? (a,b) => showMatch(b)-showMatch(a) || a.name.localeCompare(b.name) : browseOrder);
    const matchingEpisodes = matchingEpisodeRows();
    if(dateFrom && dateTo && dateFrom>dateTo) { $('status').textContent='Choose an end date on or after the start date.';$('results').innerHTML='';return; }
    $('clear').hidden = !query;
    document.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.scope === scope)));
    $('status').textContent = `${matchingShows.length} ${matchingShows.length === 1 ? 'show' : 'shows'} · ${matchingEpisodes.length} ${matchingEpisodes.length === 1 ? 'episode' : 'episodes'}${query ? ` matching “${query}”` : ' available'}${episodeShow && byShow.has(episodeShow) ? ' · '+byShow.get(episodeShow).name : ''}${category !== 'all' ? ' · '+labels[category] : ''}`;
    let html = '';
    const home = !query && scope === 'all';
    if(home && matchingEpisodes.length) html += `<section class="rv-section"><div class="rv-sectionhead"><h2>Just aired</h2>${action('scope','episodes','Latest episodes','rv-seeall')}</div><div class="rv-latest">${railRows(matchingEpisodes).map(r => episodeHtml(r)).join('')}</div></section>`;
    if(scope !== 'episodes' && matchingShows.length) {
      const list = matchingShows.slice(0,query ? showLimit : visible);
      html += `<section class="rv-section"><div class="rv-sectionhead"><h2>${query ? 'Shows' : 'Explore shows'}</h2>${query ? `<span>${matchingShows.length} shows</span>` : `<span class="rv-sectionside"><span>${matchingShows.length} shows</span>${sortControl()}</span>`}</div><div class="${query ? 'rv-results-list' : 'rv-showgrid'}">${query ? list.map(showResult).join('') : showCards(list)}</div>${matchingShows.length > list.length ? action('more','shows',`Show more shows (${matchingShows.length-list.length})`,'rv-quiet rv-more') : ''}</section>`;
    }
    if(!home && scope !== 'shows' && matchingEpisodes.length) {
      const list = matchingEpisodes.slice(0,visible);
      let contents;
      if(scope === 'all') {
        const groups = new Map();
        list.forEach(r => {if(!groups.has(r.sho)) groups.set(r.sho,[]);groups.get(r.sho).push(r);});
        // Groups expand in place (no view change, nothing for Back to undo). Keyed by
        // query so a new search starts collapsed.
        contents = [...groups].map(([id,items]) => { const all=matchingEpisodes.filter(r=>r.sho===id), open=expanded.has(query+'\u0000'+id), shown=open?all:items.slice(0,3);
          return `<div class="rv-results-list rv-group"><div class="rv-grouphead">${action('show',id,byShow.get(id).name,'rv-showlink')}<span>${all.length} ${all.length===1?'match':'matches'}</span></div>${shown.map(r => episodeHtml(r,true)).join('')}${all.length>3 ? `<button type="button" class="rv-quiet rv-more" data-expand="${esc(id)}" aria-expanded="${open}">${open?'Show fewer':`Show all ${all.length} matches`}</button>` : ''}</div>`; }).join('');
      } else contents = `<div class="rv-results-list">${list.map(r => episodeHtml(r,true)).join('')}</div>`;
      html += `<section class="rv-section"><div class="rv-sectionhead"><h2>Episodes</h2><span>${matchingEpisodes.length} matches</span></div>${contents}${matchingEpisodes.length > visible ? action('more','episodes','Show more episodes','rv-quiet rv-more') : ''}</section>`;
    }
    if(!html) html = `<section class="rv-empty"><p class="rv-eyebrow">A little further off the dial</p><h2>No ${scope === 'all' ? 'results' : scope} found${query ? ` for “${esc(query)}”` : ''}</h2><p>Try a show name, host, or a broader topic.${category !== 'all' ? ' A category filter is active.' : ''}</p>${action('reset','all','Clear search and filters')}</section>`;
    $('results').innerHTML = html;
    $('results').setAttribute('aria-busy','false');
    autoMore?.disconnect();
    const more = [...$('results').querySelectorAll('[data-more]')].pop();
    if(more && !(scope === 'all' && query)) autoMore?.observe(more);
  }
  function paintDetail() {
    const row = route.kind === 'episode' ? byId.get(route.id) : null;
    const show = byShow.get(row ? row.sho : route.id);
    if(!show) { $('detailBody').innerHTML = '<h2 id="detailTitle">No longer available</h2><p>This item is not in the current archive.</p>'; return; }
    $('dialogKind').textContent = row ? 'Episode' : 'Show';
    $('dialogBack').hidden = !row;
    $('dialogBack').dataset.show = show.id;
    const selected = row || show.latest;
    // Layout (2026-09-28, docs/DESIGN-SYSTEM.md rule 2): Play sits in the header beside the
    // title, never below a stack of blocks. Two parts: the side (header, description) and
    // the main part (episode list, or the episode's notes and transcript). On desktop they
    // are two columns (app.css); on phones they stack, Play still in the header row.
    const actions = row
      ? `${detailPlay(row.id,'▶ Play episode')}${action('show',show.id,`All ${show.episodes.length} episodes`)}`
      : detailPlay(show.latest.id,'▶ Play latest');
    const head = `<div class="rv-detailhead">${art(selected,true)}<div>${row ? action('show',show.id,show.name+' →','rv-showlink') : `<p class="rv-eyebrow">${esc(labels[show.cat])}</p>`}<h2 id="detailTitle">${esc(row ? title(row) : show.name)}</h2><p class="rv-detailmeta">${esc(row ? date(row)+' · '+time(row)+(duration(row) ? ' · '+duration(row) : '')+pendingNote(row) : show.host || '')}</p><div class="rv-detailactions">${actions}</div></div></div>`;
    let side = head, main = '';
    if(row) {
      main += `<h3>About this episode</h3><p class="rv-bodytext">${esc(row.episodeDesc || 'Episode notes are not available for this broadcast.')}</p><details><summary>About ${esc(show.name)}</summary><p class="rv-bodytext">${esc(show.description || 'Show description unavailable.')}</p></details>`;
    } else {
      if(show.description) side += `<p class="rv-bodytext">${esc(show.description)}</p>`;
      main += `<h3>${show.episodes.length} ${show.episodes.length === 1 ? 'episode' : 'episodes'} <span class="rv-dialognote">· newest first</span></h3>${show.episodes.map(r => episodeHtml(r)).join('')}`;
    }
    // Every way to listen along this episode offers, default first (music: Songs).
    for(const along of row ? window.ListenAlong.kindsOf(row) : []) main += `<section class="rv-transcript"><h3>${along === 'transcript' ? 'Transcript' : 'Songs in this episode'}</h3><p class="rv-dialognote">${along === 'transcript' ? 'Read along with the audio, search inside it and play from any line.' : 'The songs played, with times. Tap one to play from there.'}</p><button type="button" class="rv-quiet" data-along="${esc(row.id)}" data-along-kind="${along}">${along === 'transcript' ? 'Read transcript' : 'Show songs'} →</button></section>`;
    const html = `<div class="rv-detailside">${side}</div><div class="rv-detailmain">${main}</div>`;
    $('detailBody').innerHTML = html;
    $('detailBody').scrollTop = 0;
  }
  async function seekTranscript(id,seconds) {
    const row=byId.get(id);if(!row||!Number.isFinite(seconds)||seconds<0||seconds>row.durationSec)return;
    const audio=$('audio');
    if(audio.dataset.id!==id) { audio.dataset.photo=photo(row);audio.src=row.mp3;audio.dataset.id=id; }
    try {
      if(audio.readyState<1) await new Promise((resolve,reject)=>{
        const done=()=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',ok);audio.removeEventListener('error',bad);};
        const ok=()=>{done();resolve();},bad=()=>{done();reject(new Error('Audio unavailable'));};
        const timer=setTimeout(bad,12000);audio.addEventListener('loadedmetadata',ok,{once:true});audio.addEventListener('error',bad,{once:true});audio.load();
      });
      audio.currentTime=Math.min(seconds,Number.isFinite(audio.duration)?audio.duration:seconds);
      $('playingTitle').textContent=row.title;$('playingDate').textContent=date(row)+' · '+time(row);$('player').hidden=false;
      $('playerError').textContent='';if($('detail').open)closeDetail();await audio.play();
    }catch(error){$('player').hidden=false;$('playerError').textContent='Audio could not start at this timestamp.';console.warn('Transcript seek failed:',error.message);}
  }
  function openDetail(kind,id,fromPop = false) {
    if(!$('detail').open) trigger = document.activeElement;
    const wasOpen = $('detail').open;
    route = {kind,id}; paintDetail();
    // Non-modal (2026-09-28): a modal dialog sits in the browser's top layer, above the
    // player bar, and blocks it. docs/DESIGN-SYSTEM.md rule 1; refreshScrollLock() does
    // the dimming and inerting instead.
    if(!wasOpen) $('detail').show();
    refreshScrollLock();
    $('close').focus();
    if(!fromPop) { syncUrl(!wasOpen); if(!wasOpen) modalHistory = true; }
  }
  function closeDetail() {
    if(modalHistory) { history.back(); return; }
    route = null; syncUrl(); $('detail').close();
  }
  async function play(id) {
    const row = byId.get(id); if(!row) return;
    const audio = $('audio');
    if(audio.dataset.id && owner(audio.dataset.id) === id && audio.dataset.id !== id) { if(!audio.paused) audio.pause(); else audio.play().catch(()=>{}); return; }
    if(audio.dataset.id === id && !audio.paused) { audio.pause(); return; }
    if(audio.dataset.id !== id) { audio.dataset.photo=photo(row);audio.src = row.mp3; audio.dataset.id = id; }
    $('playingTitle').textContent = row.title;
    $('playingDate').textContent = date(row)+' · '+time(row);
    $('playerError').textContent = ''; $('player').hidden = false;
    if($('detail').open) closeDetail();
    try { await audio.play(); } catch(error) { $('playerError').textContent = 'Playback could not start. Try the player controls.'; console.warn('Review playback failed:',error.message); }
  }
  // Station mp3s end in a damaged last frame: Chrome raises a decode error (code 3) ~0.25 s
  // before the end instead of 'ended' (every recording tested 2026-09-27). Caught here: that
  // error in the last 2 s is the recording finishing, not a failure; any other error is shown.
  const endedAtTail = a => !!a.error && a.error.code === 3 && Number.isFinite(a.duration) && a.duration - a.currentTime < 2;
  $('audio').addEventListener('error',() => { const a = $('audio'); if(endedAtTail(a)) { finished(); return; } $('playerError').textContent = 'This recording could not be loaded. Try another episode.'; });
  {
    const audio = $('audio');
    audio.addEventListener('loadstart',() => { loadingId = audio.dataset.id || ''; syncPlayButtons(); });
    audio.addEventListener('waiting',() => { loadingId = audio.paused ? '' : audio.dataset.id || ''; syncPlayButtons(); });
    ['playing','pause','ended','error','emptied'].forEach(name => audio.addEventListener(name,() => { loadingId = ''; syncPlayButtons(); }));
    audio.addEventListener('play',syncPlayButtons);
    // One show in two files: the first part ends, the next part plays on.
    audio.addEventListener('ended',finished);
  }
  // The recording finished ('ended', or the damaged-tail decode error above). One show in two
  // files continues quietly: the player bar, open panels and the card stay as they are.
  function finished() {
    const audio = $('audio'), next = byId.get((byId.get(audio.dataset.id) || {}).next); if(!next) return;
    audio.dataset.photo=photo(next);audio.src=next.mp3;audio.dataset.id=next.id;
    audio.play().catch(error => { $('playerError').textContent = 'The second part could not start. Press play to continue.'; console.warn('Part hand-over failed:',error.message); });
  }
  $('stop').onclick = () => { $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load(); delete $('audio').dataset.id; $('player').hidden = true; };
  document.addEventListener('click',event => {
    const el = event.target.closest('button'); if(!el) return;
    if(el.classList.contains('search-expand')) { toggleExpand(el); return; }
    if(el.dataset.along) openAlong(el.dataset.along,el.dataset.alongKind||'');
    else if(el.dataset.show) openDetail('show',el.dataset.show);
    else if(el.dataset.episode) openDetail('episode',el.dataset.episode);
    else if(el.dataset.play) play(el.dataset.play);
    else if(el.dataset.expand) {
      const id=el.dataset.expand,key=query+'\u0000'+id,group=el.closest('.rv-group'),top=group.getBoundingClientRect().top;
      if(expanded.has(key)) expanded.delete(key); else expanded.add(key);
      render();
      // Keep the reader in place: collapsing must not strand them far below the group.
      const again=document.querySelector(`[data-expand="${CSS.escape(id)}"]`);
      if(again){ const g=again.closest('.rv-group'); if(!expanded.has(key)) window.scrollBy(0,g.getBoundingClientRect().top-top); again.focus({preventScroll:true}); }
    }
    else if(el.dataset.scope) { episodeShow='';scope=el.dataset.scope;visible=16;syncUrl();render();
      // A shortcut outside the tab bar (Just aired's "Latest episodes") lands on its tab.
      if(!el.closest('#scopes')) document.querySelector(`#scopes [data-scope="${scope}"]`).focus(); }
    else if(el.dataset.more) { if(el.dataset.more === 'shows' && query) showLimit += 12; else if(el.dataset.more === 'episodes' && scope === 'all') { scope='episodes';visible=16; } else visible += 16;syncUrl();render(); }
    else if(el.dataset.reset) { query='';dateFrom='';dateTo='';$('dateFrom').value='';$('dateTo').value='';episodeShow='';category='all';scope='all';$('search').value='';$('category').value='all';visible=16;syncUrl();render();$('search').focus(); }
  });
  $('close').onclick = closeDetail;
  $('detail').addEventListener('cancel',event => { event.preventDefault();closeDetail(); });
  $('detail').addEventListener('close',() => { refreshScrollLock(); if(trigger?.isConnected) trigger.focus(); });
  // The detail popup is non-modal (see openDetail), so Escape is ours to handle. The
  // transcript panel handles its own Escape first and stops it (along.js).
  document.addEventListener('keydown',event => { if(event.key==='Escape' && $('detail').open && !event.defaultPrevented){ event.preventDefault(); closeDetail(); } });
  // One owner for "is anything covering the page?". The lock must sit on <html>: with
  // html{overflow-x:clip} the root is the scroll container and body{overflow:hidden}
  // does nothing (the podcast template's touch-dev.md F7 trap). The wide-screen
  // push drawer leaves the page usable, so only covering layouts lock.
  const wide = matchMedia('(min-width:1100px)');
  function refreshScrollLock() {
    const open = $('detail').open;
    const covering = open || (window.ListenAlong.isOpen() && !wide.matches);
    document.documentElement.classList.toggle('scroll-lock', covering);
    // What showModal() used to do for us: dim the page and make it unreachable. The
    // player bar and transcript panel are left out, so they stay usable (design rule 1).
    document.body.classList.toggle('detail-open', open);
    for (const el of document.querySelectorAll('.rv-skip, .rv-reviewbar, .rv-header, #main')) el.inert = open;
  }
  wide.addEventListener('change', refreshScrollLock);
  $('detail').addEventListener('click',event => { if(event.target === $('detail')) { const r=$('detail').getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeDetail(); } });
  $('searchForm').onsubmit = event => { event.preventDefault();query=$('search').value.trim();episodeShow='';showLimit=6;visible=16;syncUrl();render(); };
  $('search').addEventListener('input',() => { query=$('search').value.trim();episodeShow='';showLimit=6;visible=16;syncUrl();render(); });
  $('clear').onclick = () => { query='';episodeShow='';$('search').value='';visible=16;syncUrl();render();$('search').focus(); };
  $('category').onchange = () => { category=$('category').value;visible=16;syncUrl();render(); };
  // #sort is re-rendered with the grid, so its change is handled by delegation and
  // focus is returned to the new control after the redraw.
  document.addEventListener('change', event => {
    if(event.target.id !== 'sort') return;
    sortBy = event.target.value;
    try { localStorage.setItem(station.storagePrefix+'sort',sortBy); } catch { /* private mode: URL still carries it */ }
    visible=16; syncUrl(); render(); $('sort')?.focus();
  });
  $('theme').onclick = () => { const next=window.StationTheme.active() === 'dark' ? 'light' : 'dark'; window.StationTheme.save(next); window.StationTheme.apply(next); };
  window.addEventListener('popstate',() => {
    const p=new URLSearchParams(location.search);
    const restoredSource=sourceFrom(p);
    dateFrom=p.get('from')||'';dateTo=p.get('to')||'';$('dateFrom').value=dateFrom;$('dateTo').value=dateTo;
    if(restoredSource!==source){source=restoredSource;$('source').value=source;route=null;$('detail').close();load();}
    query=p.get('q')||'';episodeShow=p.get('episode_show')||'';category=p.get('category')||'all';sortBy=SORTS.includes(p.get('sort'))?p.get('sort'):sortBy;scope=['all','shows','episodes'].includes(p.get('scope')) ? p.get('scope') : 'all';$('search').value=query;$('category').value=category;render();
    if(p.has('episode') || p.has('show')) openDetail(p.has('episode')?'episode':'show',p.get('episode')||p.get('show'),true);
    else { route=null;modalHistory=false;$('detail').close(); }
    if(pendingAlong && !$('detail').open) { const {id,kind}=pendingAlong;pendingAlong=null;window.ListenAlong.open(id,{query,kind}); }
  });
  // The dialog is modal, so it closes first; with dialog history that close is a
  // history.back(), and the panel opens from popstate once it has landed.
  function openAlong(id,kind='') {
    if($('detail').open && modalHistory) { pendingAlong={id,kind}; closeDetail(); return; }
    if($('detail').open) closeDetail();
    window.ListenAlong.open(id,{query,kind});
  }
  window.DiscoveryMediaSession.init({getRow:id=>byId.get(id),title,artist:row=>[byShow.get(row.sho)?.name||row.title,row.host].filter(Boolean).join(' · '),album:()=>station.name+' '+station.frequency,photo});
  window.ListenAlong.init({onChange:refreshScrollLock,getRow:id=>byId.get(id),query:()=>query,about:row=>row.episodeDesc||'',show:row=>row.title||'',art:photo,title,meta:row=>date(row)+' · '+time(row),seek:(id,at)=>seekTranscript(id,at)});
  function adaptQir(data) {
    const directory={},artwork=data.artwork||{};
    // The name episodes carry is the station's current one (directory display_name can be an
    // older form, e.g. "Cary Harrison Files"); display_name covers shows with no episodes.
    const names=new Map(data.episodes.map(e=>[e.show_key,e.show_name]));
    for(const s of data.shows) directory['qir:'+s.key]={name:names.get(s.key)||s.display_name,desc:'',dj:'',shortdesc:''};
    const converted=data.episodes.map(e=>{
      const cat=/music/i.test(e.category)?'music':/arts|entertainment/i.test(e.category)?'arts':/health|spiritual/i.test(e.category)?'health':/news/i.test(e.category)?'news':/public affairs/i.test(e.category)?'public-affairs':/espa[ñn]ol/i.test(e.category)?'espanol':'special';
      // Local wall-clock sort key only; QIR date/time are displayed verbatim.
      return {id:'qir:'+e.public_id,sho:'qir:'+e.show_key,title:e.show_name||e.title,host:e.host,cat,
        dt:Date.parse(e.air_date+'T'+(e.air_start||'00:00:00')+'Z')/1000,durationSec:Math.round(e.duration_minutes*60),mp3:e.mp3_url,
        episodeDesc:[e.summary,e.guest?'Guests: '+e.guest:''].filter(Boolean).join('\n\n'),
        published:e.headline?[{topic:e.headline}]:[],qir:e,vtiUrl:e.vti_url||'',photo:artwork.byMp3?.[e.mp3_url]||artwork.byShow?.[e.show_key]||'',
        partOf:e.part_of?'qir:'+e.part_of:'',next:e.parts&&e.parts[0]?'qir:'+e.parts[0]:''};
    });
    // A show in two files is one card: the first part carries the whole length and both summaries.
    const byQid=new Map(converted.map(r=>[r.id,r]));
    for(const r of converted){let p=byQid.get(r.next),total=r.durationSec;while(p){total+=p.durationSec;if(p.episodeDesc)r.episodeDesc=[r.episodeDesc,p.episodeDesc].filter(Boolean).join('\n\n');p=byQid.get(p.next);}if(r.next)r.totalSec=total;}
    return {shows:converted,directory};
  }
  async function load() {
    const version=++loadVersion;
    $('results').setAttribute('aria-busy','true');$('status').textContent='Loading '+(source==='qir'?'QIR episodes':'the archive')+'…';
    $('results').innerHTML='';
    try {
      let response = await fetch(source==='qir'?'/api/plugins/qir/catalog':'/api/archive'), fellBack = false;
      // Second safeguard (2026-09-26): QIR has no catalog to serve at all (never loaded, or
      // switched off mid-visit). The station archive is shown instead, and says so.
      if(!response.ok && source==='qir') { const archive = await fetch('/api/archive'); if(archive.ok) { response = archive; fellBack = true; } }
      if(!response.ok) throw new Error(source==='qir'?'QIR is not connected or is temporarily unavailable. The station archive preview is still available.':`Archive HTTP ${response.status}`);
      const payload=await response.json();if(version!==loadVersion)return;
      const qirData=source==='qir' && !fellBack, waiting=qirData && payload.pending ? payload.pending.count : 0;
      const data=qirData?adaptQir(payload):payload;
      $('providerTitle').textContent=qirData?'QIR API beta':fellBack?'QIR unavailable':'Archive preview';
      $('providerStatus').textContent=fellBack?'QIR is not responding. Showing the station archive: audio and song lists, no summaries or transcripts.':qirData?(payload.stale?'Showing the last successful QIR response; refresh is unavailable.':'QIR summaries and transcripts · KPFK beta')+(waiting?` · ${waiting} recent episode${waiting===1?'':'s'} waiting for QIR (transcript pending)`:''):qirStatus && ['switched_off','disabled'].includes(qirStatus.state)?'Station archive · Transcripts are not enabled for this station.':'Existing station feed · This view is not QIR output.';
      byShow=new Map();byId=new Map(data.shows.map(r=>[r.id,r]));rows = data.shows.filter(r=>!r.partOf).sort((a,b)=>b.dt-a.dt); const directory=data.directory || {};
      for(const row of rows) {
        if(!byShow.has(row.sho)) {const info=directory[row.sho]||{};byShow.set(row.sho,{id:row.sho,name:info.name||row.title,host:info.dj||row.host,description:info.desc||info.shortdesc||'',cat:row.cat,latest:row,episodes:[]});}
        byShow.get(row.sho).episodes.push(row);
      }
      // Show ids end in the upstream key (qir:friedman, kpfk.kpfk.friedman). byShow keeps
      // hidden shows so their episodes still group, link and open in search.
      const hidden=new Set(station.hiddenShows||[]);
      shows=[...byShow.values()].filter(s=>!hidden.has(s.id.split(/[:.]/).pop()));
      searchIndex=window.ArchiveSearch.build(rows,directory,labels);hitsKey='';
      directoryNow=directory;liveQir=qirData;lastCheck=Date.now();
      $('category').innerHTML='<option value="all">All categories</option>'+[...new Set(shows.map(s=>s.cat))].sort().map(c=>`<option value="${esc(c)}">${esc(labels[c]||c)}</option>`).join('');
      if(!shows.some(s=>s.cat === category)) category='all';
      $('search').value=query;$('category').value=category;render();
      const currentParams=new URLSearchParams(location.search);
      if(currentParams.has('episode')||currentParams.has('show')) openDetail(currentParams.has('episode')?'episode':'show',currentParams.get('episode')||currentParams.get('show'),true);
    } catch(error) { if(version!==loadVersion)return;rows=[];shows=[];byShow=new Map();byId=new Map();searchIndex=null;hitsKey='';$('providerTitle').textContent=source==='qir'?'QIR connection pending':'Archive preview';$('providerStatus').textContent=error.message;$('status').textContent='Content is unavailable.';$('results').setAttribute('aria-busy','false');$('results').innerHTML='<div class="rv-empty"><h2>'+ (source==='qir'?'QIR is not ready yet':'Unable to load the archive')+'</h2><p>'+esc(error.message)+'</p></div>';console.error(error); }
  }
  $('source').value=source;$('dateFrom').value=dateFrom;$('dateTo').value=dateTo;
  $('source').onchange=()=>{source=$('source').value;route=null;episodeShow='';category='all';scope='all';visible=16;syncUrl();load();};
  const changeDates=()=>{dateFrom=$('dateFrom').value;dateTo=$('dateTo').value;visible=16;syncUrl();render();};
  $('dateFrom').onchange=changeDates;$('dateTo').onchange=changeDates;
  $('clearDates').onclick=()=>{$('dateFrom').value='';$('dateTo').value='';changeDates();};
  fetch('/api/plugins/qir/status').then(r=>r.ok?r.json():null).catch(()=>null).then(s=>{
    qirStatus=s;
    // Switched off in admin (or unsupported): QIR is not offered at all, even via ?source=qir.
    if(s && ['switched_off','disabled'].includes(s.state)) { qirAvailable=false; $('source').querySelector('option[value=qir]').remove(); }
    else if(s?.configured) defaultSource='qir';
    source=sourceFrom(new URLSearchParams(location.search)); $('source').value=source;
    load();
    if(source==='archive') $('providerStatus').textContent=!s?'QIR status unavailable. Archive preview is independent.':['switched_off','disabled'].includes(s.state)?'Station archive · Transcripts are not enabled for this station.':!s.configured?'QIR access is pending. Browsing the existing station archive preview.':$('providerStatus').textContent;
  });

  // Live refresh (2026-09-27, Paul): Just aired used to need a second reload (the server asks QIR
  // in the background when someone visits). While the page is visible it asks every 2 min for
  // episodes aired since the newest it has (or the oldest still waiting for QIR), a few KB. New
  // ones are slotted in; a "Transcript pending" copy is replaced when QIR's record arrives (same
  // mp3). Nothing new: nothing changes. Only the Just aired row is redrawn, with a push.
  const CHECK_MS = 120000;
  const airKey = r => r.qir.air_date+' '+(r.qir.air_start || '00:00:00');
  function sinceKey() {
    const all = [...byId.values()].filter(r => r.qir);
    const newest = all.filter(r => !r.qir.pending).map(airKey).sort().pop() || '';
    const waiting = all.filter(r => r.qir.pending && !r.qir.skipped).map(airKey);
    return [newest, ...waiting].filter(Boolean).sort()[0] || '';
  }
  function removeRow(row) {
    byId.delete(row.id); rows = rows.filter(r => r !== row);
    const show = byShow.get(row.sho); if(show) { show.episodes = show.episodes.filter(r => r !== row); if(show.latest === row) show.latest = show.episodes[0] || row; }
  }
  function mergeRecent(payload) {
    const fresh = adaptQir({episodes: payload.episodes, shows: [], artwork: payload.artwork}).shows;
    const added = [];
    for(const row of fresh) {
      if(byId.has(row.id)) continue;
      if(!row.qir.pending) for(const old of [...byId.values()]) if(old.qir && old.qir.pending && old.mp3 === row.mp3) removeRow(old);
      byId.set(row.id, row);
      if(row.partOf) { const head = byId.get(row.partOf); if(head && !head.next) { head.next = row.id; head.totalSec = head.durationSec + row.durationSec; } continue; }
      rows.push(row); added.push(row);
      if(!byShow.has(row.sho)) { const s = {id:row.sho,name:row.title,host:row.host,description:'',cat:row.cat,latest:row,episodes:[]}; byShow.set(row.sho, s); shows.push(s); }
      const show = byShow.get(row.sho); show.episodes.push(row); show.episodes.sort((a,b) => b.dt-a.dt); show.latest = show.episodes[0];
    }
    if(added.length || fresh.some(r => !r.qir.pending)) { rows.sort((a,b) => b.dt-a.dt); searchIndex = window.ArchiveSearch.build(rows, directoryNow, labels); hitsKey = ''; }
    return added;
  }
  // The push: cards that stay glide from their old place (FLIP), a new card slides in from the
  // start, a card that leaves fades where it was. Reduced motion: a plain fade.
  function refreshRail(added) {
    const rail = $('results').querySelector('.rv-latest');
    if(!rail || query || scope !== 'all') return;
    const next = railRows(matchingEpisodeRows());
    const idOf = el => el.querySelector('[data-play]')?.dataset.play || '';
    const before = new Map([...rail.children].map(el => [idOf(el), el.getBoundingClientRect()]));
    if(next.map(r => r.id).join() === [...before.keys()].join()) return;
    const box = rail.getBoundingClientRect(), leaving = [...rail.children].filter(el => !next.some(r => r.id === idOf(el)));
    const focusId = rail.contains(document.activeElement) ? idOf(document.activeElement.closest('article') || rail) : '';
    rail.innerHTML = next.map(r => episodeHtml(r)).join('');
    if(focusId) rail.querySelector(`[data-play="${CSS.escape(focusId)}"]`)?.focus();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, ease = 'cubic-bezier(.2,.7,.2,1)';
    for(const el of rail.children) {
      const was = before.get(idOf(el)), now = el.getBoundingClientRect();
      if(!was) el.animate(reduce ? [{opacity:0},{opacity:1}] : [{opacity:0,transform:'translateX(-28px)'},{opacity:1,transform:'none'}], {duration: reduce ? 300 : 480, easing: ease});
      else if(!reduce && (was.left !== now.left || was.top !== now.top)) el.animate([{transform:`translate(${was.left-now.left}px,${was.top-now.top}px)`},{transform:'none'}], {duration:480, easing:ease});
    }
    if(!reduce) for(const el of leaving) {
      const r = before.get(idOf(el)), ghost = el.cloneNode(true);
      ghost.setAttribute('aria-hidden','true'); ghost.inert = true;
      Object.assign(ghost.style, {position:'absolute', left:(r.left-box.left)+'px', top:(r.top-box.top)+'px', width:r.width+'px', height:r.height+'px', margin:0, pointerEvents:'none'});
      rail.append(ghost); ghost.animate([{opacity:1},{opacity:0}], {duration:360, easing:'ease-out'}).finished.then(() => ghost.remove(), () => ghost.remove());
    }
    const shown = added.filter(r => next.includes(r));
    if(shown.length) $('railNews').textContent = 'New: ' + shown.map(r => `${r.title}, ${(r.qir.air_start || '').slice(0,5)}`).join('; ');
  }
  async function checkRecent() {
    if(!liveQir || checking || document.visibilityState !== 'visible') return;
    const since = sinceKey(); if(!since) return;
    checking = true; lastCheck = Date.now();
    try {
      const response = await fetch('/api/plugins/qir/recent?since=' + encodeURIComponent(since));
      if(!response.ok) return;
      const payload = await response.json();
      if(!liveQir) return;
      const before = rows.length;
      const added = mergeRecent(payload);
      if(added.length || rows.length !== before) refreshRail(added); // Search and other views pick new episodes up on their next render, never mid-read.
    } catch(error) { console.warn('Just aired refresh failed:', error.message); } // Caught: offline or server restarting; the next check retries.
    finally { checking = false; }
  }
  setInterval(checkRecent, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_MS / 2) checkRecent(); });
  window.DiscoveryLive = {check: checkRecent};
})();
