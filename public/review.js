/* Optional Discover interface; existing archive data, no QIR dependency or tracking. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const station = window.StationConfig;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const excerpt = (value, query = '', limit = 160) => {
    const text = String(value || '').replace(/\s+/g,' ').trim();
    const pos = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    const start = pos > 50 ? pos - 40 : 0;
    return (start ? '…' : '') + text.slice(start,start + limit) + (text.length > start + limit ? '…' : '');
  };
  const params = new URLSearchParams(location.search);
  let source = params.get('source') === 'qir' ? 'qir' : 'archive';
  let dateFrom = params.get('from') || '', dateTo = params.get('to') || '';
  let qirStatus = null, loadVersion = 0;
  const transcriptCache = new Map(), transcriptPending = new Set();
  let query = params.get('q') || '', category = params.get('category') || 'all';
  let scope = ['all','shows','episodes'].includes(params.get('scope')) ? params.get('scope') : 'all';
  let rows = [], shows = [], byShow = new Map(), byId = new Map(), visible = 16, route = null, trigger = null;
  let modalHistory = false;
  let episodeShow = params.get('episode_show') || '';
  let showLimit = 6;
  const labels = {news:'News','public-affairs':'Public Affairs',arts:'Arts & Culture',health:'Health',music:'Music',science:'Science & Tech',special:'Special Programming'};
  const date = row => row.qir ? row.qir.air_date : new Intl.DateTimeFormat('en-US',{timeZone:station.timezone,month:'short',day:'numeric',year:'numeric'}).format(new Date(row.dt * 1000));
  const time = row => row.qir ? row.qir.air_start.slice(0,5)+' · Los Angeles' : new Intl.DateTimeFormat('en-US',{timeZone:station.timezone,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(row.dt * 1000));
  const duration = row => row.durationSec ? `${Math.round(row.durationSec / 60)} min` : '';
  const title = row => row.published?.find(p => p.topic)?.topic || `${row.title} · ${date(row)}`;
  const photo = row => /^(\/api\/artwork\/|\/assets\/)/.test(row.photo || '') ? row.photo : station.assets.icon;
  const art = (row, eager = false) => `<img src="${esc(photo(row))}" alt="" loading="${eager ? 'eager' : 'lazy'}">`;
  const action = (kind, id, text, cls = 'rv-quiet') => `<button type="button" class="${cls}" data-${kind}="${esc(id)}">${esc(text)}</button>`;
  const playButton = row => `<button class="rv-play" type="button" data-play="${esc(row.id)}" aria-label="Play ${esc(title(row))}">▶</button>`;
  function syncUrl(push = false) {
    const p = new URLSearchParams();
    if(source === 'qir') p.set('source','qir');
    if(dateFrom) p.set('from',dateFrom);
    if(dateTo) p.set('to',dateTo);
    if(query) p.set('q',query);
    if(category !== 'all') p.set('category',category);
    if(scope !== 'all') p.set('scope',scope);
    if(episodeShow) p.set('episode_show',episodeShow);
    if(route) p.set(route.kind,route.id);
    history[push ? 'pushState' : 'replaceState']({review:true},'',location.pathname + (p.size ? '?' + p : ''));
  }
  function rank(text,q) {
    const n = norm(text); if(!q) return 1;
    if(n === q) return 100;
    if(n.startsWith(q)) return 80;
    if(n.includes(q)) return 60;
    return q.split(' ').every(word => n.includes(word)) ? 30 : 0;
  }
  function showMatch(show) {
    const q = norm(query);
    return Math.max(rank(show.name,q),rank(show.host,q)*.65,rank(show.description,q)*.35,rank(labels[show.cat],q)*.3);
  }
  function episodeMatch(row) {
    const q = norm(query);
    return Math.max(rank(row.published?.map(p => p.topic).join(' '),q),rank(row.episodeDesc,q)*.65,rank(row.title,q)*.55,rank(row.host,q)*.4);
  }
  function episodeHtml(row, withExcerpt = false) {
    const text = withExcerpt && row.episodeDesc ? excerpt(row.episodeDesc,query) : '';
    return `<article class="rv-episode">${art(row)}<div class="rv-copy">${action('episode',row.id,title(row),'rv-titlebutton')}<p class="rv-meta">${esc(row.title)} · ${esc(date(row))} · ${esc(time(row))}${duration(row) ? ' · '+duration(row) : ''}</p>${text ? `<p class="rv-excerpt">${esc(text)}</p>` : ''}</div>${playButton(row)}</article>`;
  }
  function showCard(show) {
    return `<button type="button" class="rv-showcard" data-show="${esc(show.id)}">${art(show.latest)}<p class="rv-eyebrow">${esc(labels[show.cat] || 'Show')}</p><h3>${esc(show.name)}</h3><p>${esc(show.host || station.name)}</p><p>Latest · ${esc(date(show.latest))}</p></button>`;
  }
  function showResult(show) {
    const matchedDescription = query && !rank(show.name,norm(query)) && rank(show.description,norm(query));
    return `<article class="rv-showresult">${art(show.latest)}<div class="rv-copy">${matchedDescription ? '<div class="rv-match">Matches the show description</div>' : ''}${action('show',show.id,show.name,'rv-titlebutton')}<p>${esc(excerpt(show.description,query,145) || show.host || labels[show.cat])}</p><p class="rv-meta">${show.episodes.length} available episodes · Latest ${esc(date(show.latest))}</p></div>${action('show',show.id,'View show →')}</article>`;
  }
  function airDay(row) {
    return row.qir ? row.qir.air_date : new Intl.DateTimeFormat('en-CA',{timeZone:station.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.dt*1000));
  }
  function inDates(row) { const day=airDay(row);return (!dateFrom || day>=dateFrom)&&(!dateTo || day<=dateTo); }
  function render() {
    const matchingShows = shows.filter(s => s.episodes.some(inDates) && (category === 'all' || s.cat === category) && showMatch(s)).sort((a,b) => showMatch(b)-showMatch(a) || a.name.localeCompare(b.name));
    const matchingEpisodes = rows.filter(r => inDates(r) && (!episodeShow || r.sho === episodeShow) && (category === 'all' || r.cat === category) && episodeMatch(r)).sort((a,b) => episodeMatch(b)-episodeMatch(a) || b.dt-a.dt);
    if(dateFrom && dateTo && dateFrom>dateTo) { $('status').textContent='Choose an end date on or after the start date.';$('results').innerHTML='';return; }
    $('clear').hidden = !query;
    document.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.scope === scope)));
    $('status').textContent = `${matchingShows.length} ${matchingShows.length === 1 ? 'show' : 'shows'} · ${matchingEpisodes.length} ${matchingEpisodes.length === 1 ? 'episode' : 'episodes'}${query ? ` matching “${query}”` : ' available'}${episodeShow && byShow.has(episodeShow) ? ' · '+byShow.get(episodeShow).name : ''}${category !== 'all' ? ' · '+labels[category] : ''}`;
    let html = '';
    const home = !query && scope === 'all';
    if(home && matchingEpisodes.length) html += `<section class="rv-section"><div class="rv-sectionhead"><h2>Just aired</h2><span>Latest episodes</span></div><div class="rv-latest">${matchingEpisodes.slice(0,3).map(r => episodeHtml(r)).join('')}</div></section>`;
    if(scope !== 'episodes' && matchingShows.length) {
      const list = matchingShows.slice(0,query ? showLimit : visible);
      html += `<section class="rv-section"><div class="rv-sectionhead"><h2>${query ? 'Shows' : 'Explore shows'}</h2><span>${matchingShows.length} shows</span></div><div class="${query ? 'rv-results-list' : 'rv-showgrid'}">${list.map(query ? showResult : showCard).join('')}</div>${matchingShows.length > list.length ? action('more','shows',`Show more shows (${matchingShows.length-list.length})`,'rv-quiet rv-more') : ''}</section>`;
    }
    if(!home && scope !== 'shows' && matchingEpisodes.length) {
      const list = matchingEpisodes.slice(0,visible);
      let contents;
      if(scope === 'all') {
        const groups = new Map();
        list.forEach(r => {if(!groups.has(r.sho)) groups.set(r.sho,[]);groups.get(r.sho).push(r);});
        contents = [...groups].map(([id,items]) => `<div class="rv-results-list rv-group"><div class="rv-grouphead">${action('show',id,byShow.get(id).name,'rv-showlink')}<span>${matchingEpisodes.filter(r=>r.sho===id).length} matches</span></div>${items.slice(0,3).map(r => episodeHtml(r,true)).join('')}${matchingEpisodes.filter(r=>r.sho===id).length>3 ? action('matches',id,'View all matching episodes →','rv-quiet rv-more') : ''}</div>`).join('');
      } else contents = `<div class="rv-results-list">${list.map(r => episodeHtml(r,true)).join('')}</div>`;
      html += `<section class="rv-section"><div class="rv-sectionhead"><h2>Episodes</h2><span>${matchingEpisodes.length} matches</span></div>${contents}${matchingEpisodes.length > visible ? action('more','episodes','Show more episodes','rv-quiet rv-more') : ''}</section>`;
    }
    if(!html) html = `<section class="rv-empty"><p class="rv-eyebrow">A little further off the dial</p><h2>No ${scope === 'all' ? 'results' : scope} found${query ? ` for “${esc(query)}”` : ''}</h2><p>Try a show name, host, or a broader topic.${category !== 'all' ? ' A category filter is active.' : ''}</p>${action('reset','all','Clear search and filters')}</section>`;
    $('results').innerHTML = html;
    $('results').setAttribute('aria-busy','false');
  }
  function paintDetail() {
    const row = route.kind === 'episode' ? byId.get(route.id) : null;
    const show = byShow.get(row ? row.sho : route.id);
    if(!show) { $('detailBody').innerHTML = '<h2 id="detailTitle">No longer available</h2><p>This item is not in the current archive.</p>'; return; }
    $('dialogKind').textContent = row ? 'Episode' : 'Show';
    $('dialogBack').hidden = !row;
    $('dialogBack').dataset.show = show.id;
    const selected = row || show.latest;
    let html = `<div class="rv-detailhead">${art(selected,true)}<div>${row ? action('show',show.id,show.name+' →','rv-showlink') : `<p class="rv-eyebrow">${esc(labels[show.cat])}</p>`}<h2 id="detailTitle">${esc(row ? title(row) : show.name)}</h2><p class="rv-detailmeta">${esc(row ? date(row)+' · '+time(row)+(duration(row) ? ' · '+duration(row) : '') : show.host || '')}</p></div></div>`;
    if(row) {
      const isCurrent = $('audio').dataset.id === row.id;
      html += `<div class="rv-detailactions">${action('play',row.id,isCurrent ? ($('audio').paused ? '▶ Resume episode' : 'Ⅱ Pause episode') : '▶ Play episode','rv-primary')}${action('show',show.id,`All ${show.episodes.length} episodes`)}</div><h3>About this episode</h3><p class="rv-bodytext">${esc(row.episodeDesc || 'Episode notes are not available for this broadcast.')}</p><details><summary>About ${esc(show.name)}</summary><p class="rv-bodytext">${esc(show.description || 'Show description unavailable.')}</p></details>`;
    } else {
      html += `<p class="rv-bodytext">${esc(show.description || 'Explore the available broadcasts of this show.')}</p><div class="rv-detailactions">${action('play',show.latest.id,'▶ Play latest episode','rv-primary')}</div><h3>${show.episodes.length} available episodes</h3><p class="rv-dialognote">Newest first · Recordings currently published in the archive</p>${show.episodes.map(r => episodeHtml(r)).join('')}`;
    }
    if(row && row.qir) html += '<section class="rv-transcript"><h3>Transcript</h3><p class="rv-dialognote">Provided by QIR · Timestamps follow transcript cues, not editorial chapters.</p><div id="transcriptContent"></div></section>';
    $('detailBody').innerHTML = html;
    if(row && row.qir) paintTranscript(row);
    $('detailBody').scrollTop = 0;
  }
  function stamp(seconds) { return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0'); }
  function paintTranscript(row) {
    const box=$('transcriptContent');if(!box)return;
    const cached=transcriptCache.get(row.id);
    if(!cached){box.innerHTML=action('transcript',row.id,transcriptPending.has(row.id)?'Loading transcript…':'Load transcript');const b=box.querySelector('button');b.disabled=transcriptPending.has(row.id);return;}
    if(cached.error){box.innerHTML='<p class="rv-dialognote">'+esc(cached.error)+'</p>'+action('transcript',row.id,'Try again');return;}
    box.innerHTML='<label class="rv-transcript-label">Find in this transcript<input type="search" id="transcriptQuery" placeholder="Search words or a phrase"></label><p id="transcriptCount" class="rv-dialognote" role="status"></p><div id="transcriptMatches"></div>';
    const input=$('transcriptQuery');
    const draw=()=>{
      const q=norm(input.value), cues=cached.cues.filter(c=>!q||norm(c.text).includes(q));
      if(cached.cues.length){
        $('transcriptCount').textContent=cues.length+' matching segments'+(cues.length>200?' · Showing first 200; narrow your search':'');
        $('transcriptMatches').innerHTML=cues.slice(0,200).map(c=>'<div class="rv-cue"><button type="button" data-seek="'+c.start+'" data-seek-id="'+esc(row.id)+'" aria-label="Play from '+stamp(c.start)+'">'+stamp(c.start)+'</button><p>'+esc(c.text)+'</p></div>').join('');
      } else {
        const paras=cached.text.split(/\n+/).filter(t=>!q||norm(t).includes(q));
        $('transcriptCount').textContent='Plain text · Timed segments unavailable';
        $('transcriptMatches').innerHTML=paras.length?paras.slice(0,200).map(t=>'<p class="rv-bodytext">'+esc(t)+'</p>').join(''):'<p>No matching text.</p>';
      }
    };input.addEventListener('input',draw);draw();
  }
  async function loadTranscript(id) {
    const row=byId.get(id);if(!row?.qir||transcriptPending.has(id))return;
    transcriptCache.delete(id);transcriptPending.add(id);if(route?.id===id)paintTranscript(row);
    try {
      const response=await fetch('/api/plugins/qir/transcript/'+encodeURIComponent(row.qir.public_id));
      if(!response.ok)throw new Error(response.status===404?'QIR has no transcript for this episode.':'The transcript service is unavailable. Please try again later.');
      const data=await response.json();transcriptCache.set(id,{text:data.transcript||'',cues:window.QirTranscript.parse(data.vtt,row.durationSec)});
    } catch(error){transcriptCache.set(id,{error:error.message});}
    finally {transcriptPending.delete(id);if(route?.id===id)paintTranscript(row);}
  }
  async function seekTranscript(id,seconds) {
    const row=byId.get(id);if(!row||!Number.isFinite(seconds)||seconds<0||seconds>row.durationSec)return;
    const audio=$('audio');
    if(audio.dataset.id!==id) { audio.src=row.mp3;audio.dataset.id=id; }
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
    if(!wasOpen) $('detail').showModal();
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
    if(audio.dataset.id === id && !audio.paused) { audio.pause(); if(route) paintDetail(); return; }
    if(audio.dataset.id !== id) { audio.src = row.mp3; audio.dataset.id = id; }
    $('playingTitle').textContent = row.title;
    $('playingDate').textContent = date(row)+' · '+time(row);
    $('playerError').textContent = ''; $('player').hidden = false;
    if($('detail').open) closeDetail();
    try { await audio.play(); } catch(error) { $('playerError').textContent = 'Playback could not start. Try the player controls.'; console.warn('Review playback failed:',error.message); }
  }
  $('audio').addEventListener('error',() => { $('playerError').textContent = 'This recording could not be loaded. Try another episode.'; });
  $('stop').onclick = () => { $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load(); delete $('audio').dataset.id; $('player').hidden = true; };
  document.addEventListener('click',event => {
    const el = event.target.closest('button'); if(!el) return;
    if(el.dataset.transcript) loadTranscript(el.dataset.transcript);
    else if(el.dataset.seek !== undefined) seekTranscript(el.dataset.seekId,Number(el.dataset.seek));
    else if(el.dataset.show) openDetail('show',el.dataset.show);
    else if(el.dataset.episode) openDetail('episode',el.dataset.episode);
    else if(el.dataset.play) play(el.dataset.play);
    else if(el.dataset.matches) { episodeShow=el.dataset.matches;scope='episodes';visible=16;syncUrl();render(); }
    else if(el.dataset.scope) { episodeShow='';scope=el.dataset.scope;visible=16;syncUrl();render(); }
    else if(el.dataset.more) { if(el.dataset.more === 'shows' && query) showLimit += 12; else if(el.dataset.more === 'episodes' && scope === 'all') { scope='episodes';visible=16; } else visible += 16;syncUrl();render(); }
    else if(el.dataset.reset) { query='';dateFrom='';dateTo='';$('dateFrom').value='';$('dateTo').value='';episodeShow='';category='all';scope='all';$('search').value='';$('category').value='all';visible=16;syncUrl();render();$('search').focus(); }
  });
  $('close').onclick = closeDetail;
  $('detail').addEventListener('cancel',event => { event.preventDefault();closeDetail(); });
  $('detail').addEventListener('close',() => { if(trigger?.isConnected) trigger.focus(); });
  $('detail').addEventListener('click',event => { if(event.target === $('detail')) { const r=$('detail').getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeDetail(); } });
  $('searchForm').onsubmit = event => { event.preventDefault();query=$('search').value.trim();episodeShow='';showLimit=6;visible=16;syncUrl();render(); };
  $('search').addEventListener('input',() => { query=$('search').value.trim();episodeShow='';showLimit=6;visible=16;syncUrl();render(); });
  $('clear').onclick = () => { query='';episodeShow='';$('search').value='';visible=16;syncUrl();render();$('search').focus(); };
  $('category').onchange = () => { category=$('category').value;visible=16;syncUrl();render(); };
  $('theme').onclick = () => { const next=window.StationTheme.active() === 'dark' ? 'light' : 'dark'; window.StationTheme.save(next); window.StationTheme.apply(next); };
  window.addEventListener('popstate',() => {
    const p=new URLSearchParams(location.search);
    const restoredSource=p.get('source')==='qir'?'qir':'archive';
    dateFrom=p.get('from')||'';dateTo=p.get('to')||'';$('dateFrom').value=dateFrom;$('dateTo').value=dateTo;
    if(restoredSource!==source){source=restoredSource;$('source').value=source;route=null;$('detail').close();load();}
    query=p.get('q')||'';episodeShow=p.get('episode_show')||'';category=p.get('category')||'all';scope=['all','shows','episodes'].includes(p.get('scope')) ? p.get('scope') : 'all';$('search').value=query;$('category').value=category;render();
    if(p.has('episode') || p.has('show')) openDetail(p.has('episode')?'episode':'show',p.get('episode')||p.get('show'),true);
    else { route=null;modalHistory=false;$('detail').close(); }
  });
  function adaptQir(data) {
    const directory={};
    for(const s of data.shows) directory['qir:'+s.key]={name:s.display_name,desc:'',dj:'',shortdesc:''};
    const converted=data.episodes.map(e=>{
      const cat=/music/i.test(e.category)?'music':/arts|entertainment/i.test(e.category)?'arts':/health|spiritual/i.test(e.category)?'health':/news/i.test(e.category)?'news':/public affairs/i.test(e.category)?'public-affairs':'special';
      // Local wall-clock sort key only; QIR date/time are displayed verbatim.
      return {id:'qir:'+e.public_id,sho:'qir:'+e.show_key,title:e.show_name||e.title,host:e.host,cat,
        dt:Date.parse(e.air_date+'T'+e.air_start+'Z')/1000,durationSec:Math.round(e.duration_minutes*60),mp3:e.mp3_url,
        episodeDesc:[e.summary,e.guest?'Guests: '+e.guest:''].filter(Boolean).join('\n\n'),
        published:e.headline?[{topic:e.headline}]:[],qir:e,photo:''};
    });return {shows:converted,directory};
  }
  async function load() {
    const version=++loadVersion;
    $('results').setAttribute('aria-busy','true');$('status').textContent='Loading '+(source==='qir'?'QIR episodes':'the archive')+'…';
    $('results').innerHTML='';
    try {
      const response = await fetch(source==='qir'?'/api/plugins/qir/catalog':'/api/archive');
      if(!response.ok) throw new Error(source==='qir'?'QIR is not connected or is temporarily unavailable. The station archive preview is still available.':`Archive HTTP ${response.status}`);
      const payload=await response.json();if(version!==loadVersion)return;
      const data=source==='qir'?adaptQir(payload):payload;
      $('providerTitle').textContent=source==='qir'?'QIR API beta':'Archive preview';
      $('providerStatus').textContent=source==='qir'?(payload.stale?'Showing the last successful QIR response; refresh is unavailable.':'QIR summaries and transcripts · KPFK beta'):'Existing station feed · This view is not QIR output.';
      byShow=new Map();byId=new Map();rows = data.shows.slice().sort((a,b)=>b.dt-a.dt); const directory=data.directory || {};
      for(const row of rows) {
        byId.set(row.id,row);
        if(!byShow.has(row.sho)) {const info=directory[row.sho]||{};byShow.set(row.sho,{id:row.sho,name:info.name||row.title,host:info.dj||row.host,description:info.desc||info.shortdesc||'',cat:row.cat,latest:row,episodes:[]});}
        byShow.get(row.sho).episodes.push(row);
      }
      shows=[...byShow.values()];
      $('category').innerHTML='<option value="all">All categories</option>'+[...new Set(shows.map(s=>s.cat))].sort().map(c=>`<option value="${esc(c)}">${esc(labels[c]||c)}</option>`).join('');
      if(!shows.some(s=>s.cat === category)) category='all';
      $('search').value=query;$('category').value=category;render();
      const currentParams=new URLSearchParams(location.search);
      if(currentParams.has('episode')||currentParams.has('show')) openDetail(currentParams.has('episode')?'episode':'show',currentParams.get('episode')||currentParams.get('show'),true);
    } catch(error) { if(version!==loadVersion)return;rows=[];shows=[];byShow=new Map();byId=new Map();$('providerTitle').textContent=source==='qir'?'QIR connection pending':'Archive preview';$('providerStatus').textContent=error.message;$('status').textContent='Content is unavailable.';$('results').setAttribute('aria-busy','false');$('results').innerHTML='<div class="rv-empty"><h2>'+ (source==='qir'?'QIR is not ready yet':'Unable to load the archive')+'</h2><p>'+esc(error.message)+'</p></div>';console.error(error); }
  }
  $('source').value=source;$('dateFrom').value=dateFrom;$('dateTo').value=dateTo;
  $('source').onchange=()=>{source=$('source').value;route=null;episodeShow='';category='all';scope='all';visible=16;syncUrl();load();};
  const changeDates=()=>{dateFrom=$('dateFrom').value;dateTo=$('dateTo').value;visible=16;syncUrl();render();};
  $('dateFrom').onchange=changeDates;$('dateTo').onchange=changeDates;
  $('clearDates').onclick=()=>{$('dateFrom').value='';$('dateTo').value='';changeDates();};
  fetch('/api/plugins/qir/status').then(r=>r.ok?r.json():null).then(s=>{
    qirStatus=s;
    if(source==='archive' && !s?.configured) $('providerStatus').textContent='QIR access is pending. Browsing the existing station archive preview.';
  }).catch(()=>{if(source==='archive')$('providerStatus').textContent='QIR status unavailable. Archive preview is independent.';});
  load();
})();
