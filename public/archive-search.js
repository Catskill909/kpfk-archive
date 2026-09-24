/* Shared pure search index: the browser and offline tests use the same contract. */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArchiveSearch = factory();
})(typeof window === 'undefined' ? this : window, function(){
  'use strict';
  function normalize(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function score(text, query){
    if(!text || !query) return 0;
    if(text === query) return 100;
    if(text.startsWith(query)) return 80;
    if(text.includes(query)) return 60;
    var words = text.split(' ');
    return query.split(' ').every(function(q){ return words.some(function(w){ return w.startsWith(q); }); }) ? 30 : 0;
  }
  function build(rows, directory, labels){
    var shows = new Map();
    var episodes = rows.map(function(row){
      var info = directory[row.sho] || {};
      var show = shows.get(row.sho);
      if(!show){
        show = {id:row.sho, name:info.name || row.title, host:info.dj || row.host || '',
          desc:info.desc || info.shortdesc || '', cat:row.cat, latest:row, count:0};
        show.fields = {name:normalize(show.name), host:normalize(show.host),
          description:normalize(show.desc), category:normalize(labels[row.cat] || row.categoryLabel)};
        shows.set(row.sho, show);
      }
      show.count++;
      if(row.dt > show.latest.dt) show.latest = row;
      return {row:row, fields:{name:normalize(row.title), host:normalize(row.host),
        topic:normalize((row.published || []).map(function(p){return p.topic;}).filter(Boolean).join(' ')),
        content:normalize([row.episodeDesc].concat((row.published || []).map(function(p){return [p.guest,p.notes].join(' ');})).join(' '))}};
    });
    return {shows:Array.from(shows.values()), episodes:episodes};
  }
  function find(index, query, category){
    var q = normalize(query);
    if(!q) return {shows:[], episodes:[]};
    var shows = index.shows.filter(function(s){return category === 'all' || s.cat === category;}).map(function(s){
      var candidates = [['Show name',score(s.fields.name,q)],['Host',score(s.fields.host,q)*.7],
        ['Show description',score(s.fields.description,q)*.4],['Category',score(s.fields.category,q)*.3]];
      candidates.sort(function(a,b){return b[1]-a[1];});
      return {show:s, score:candidates[0][1], reason:candidates[0][0]};
    }).filter(function(s){return s.score>0;}).sort(function(a,b){return b.score-a.score || a.show.name.localeCompare(b.show.name);});
    var episodes = index.episodes.filter(function(e){return category === 'all' || e.row.cat === category;}).map(function(e){
      var candidates = [['Episode topic',score(e.fields.topic,q)],['Episode notes',score(e.fields.content,q)*.75],
        ['Show name',score(e.fields.name,q)*.6],['Host',score(e.fields.host,q)*.4]];
      candidates.sort(function(a,b){return b[1]-a[1];});
      return {row:e.row, score:candidates[0][1], reason:candidates[0][0]};
    }).filter(function(e){return e.score>0;}).sort(function(a,b){return b.score-a.score || b.row.dt-a.row.dt || a.row.id.localeCompare(b.row.id);});
    return {shows:shows, episodes:episodes};
  }
  // A published topic is used as the episode title only when it reads like one.
  // Some producers paste the whole episode description into it (Rising Up,
  // This Way Out: 440-942 characters), which rendered as a bold paragraph where a
  // heading belongs. Measured 2026-09-24: real topics are 29-84 characters and
  // QIR headlines 99% under 117 (max 216), so over 200 means a description.
  var TITLE_MAX = 200;
  function firstTopic(row){
    var p = (row.published || []).filter(function(x){ return x && x.topic && String(x.topic).trim(); })[0];
    return p ? String(p.topic).trim() : '';
  }
  // The topic when it is title-length, else '' (callers fall back to show · date).
  function episodeTitle(row){ var t = firstTopic(row); return t.length <= TITLE_MAX ? t : ''; }
  // Text to preview under a result: the episode notes, or a demoted long topic.
  function episodeBlurb(row){ var t = firstTopic(row); return row.episodeDesc || (t.length > TITLE_MAX ? t : ''); }
  // ---- Result text: highlighted terms and expandable previews (both apps) ----
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  // A normalized copy of the text plus, for each of its characters, the index of
  // the original character it came from — so matches found accent- and
  // case-insensitively ("musica" in "Música") mark the original text.
  function foldMap(text){
    var folded = '', map = [];
    for(var i = 0; i < text.length; i++){
      var f = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      for(var k = 0; k < f.length; k++){ folded += f[k]; map.push(i); }
    }
    return {folded:folded, map:map};
  }
  function queryWords(query){ return normalize(query).split(' ').filter(function(w){ return w.length > 1; }); }
  // Escaped HTML with every query word wrapped in <mark class="search-hit">.
  function highlight(text, query){
    text = String(text || '');
    var words = queryWords(query);
    if(!words.length) return escapeHtml(text);
    var fm = foldMap(text), marked = [];
    words.forEach(function(w){
      for(var at = fm.folded.indexOf(w); at >= 0; at = fm.folded.indexOf(w, at + w.length)){
        for(var j = at; j < at + w.length; j++) marked[fm.map[j]] = true;
      }
    });
    var out = '', open = false;
    for(var i = 0; i < text.length; i++){
      if(marked[i] && !open){ out += '<mark class="search-hit">'; open = true; }
      else if(!marked[i] && open){ out += '</mark>'; open = false; }
      out += escapeHtml(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }
  // A window of about `limit` characters starting a little before the first match.
  function excerpt(text, query, limit){
    text = String(text || '').replace(/\s+/g, ' ').trim();
    var fm = foldMap(text), pos = -1;
    queryWords(query).forEach(function(w){ var at = fm.folded.indexOf(w); if(at >= 0 && (pos < 0 || fm.map[at] < pos)) pos = fm.map[at]; });
    var start = pos > 50 ? pos - 40 : 0, end = Math.min(text.length, start + limit);
    return {text:(start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''), clipped:start > 0 || end < text.length, full:text};
  }
  // Highlighted preview; when it had to be cut, the full text rides along hidden
  // with a Show more button (the app toggles it — this file stays DOM-free).
  function expandable(text, query, limit){
    var ex = excerpt(text, query, limit || 180);
    if(!ex.clipped) return highlight(ex.full, query);
    return '<span class="search-short">' + highlight(ex.text, query) + '</span>' +
      '<span class="search-full" hidden>' + highlight(ex.full, query) + '</span> ' +
      '<button type="button" class="search-expand" aria-expanded="false">Show more</button>';
  }
  return {build:build, find:find, normalize:normalize, episodeTitle:episodeTitle, episodeBlurb:episodeBlurb, TITLE_MAX:TITLE_MAX,
    escapeHtml:escapeHtml, highlight:highlight, excerpt:excerpt, expandable:expandable};
});
