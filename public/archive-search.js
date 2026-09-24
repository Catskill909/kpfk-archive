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
  return {build:build, find:find, normalize:normalize, episodeTitle:episodeTitle, episodeBlurb:episodeBlurb, TITLE_MAX:TITLE_MAX};
});
