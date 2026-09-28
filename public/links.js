/* Permanent links to shows and episodes (Paul, 2026-09-28: for station websites and social
 * posts). One file for the server (link previews) and the page (opening the popup), so the
 * two can never disagree about what a link means.
 *
 *   /show/<code>             the show, on its latest episode
 *   /show/<code>/<episode>   that episode; once it rotates out of the archive, the show on its
 *                            latest episode instead (with a note), so a posted link never dies
 *
 * <code> is the station's own show code from Confessor (the feed's altid, e.g. "onconta"). It
 * stays the same when a show is renamed; a link built from the name would break on rename.
 * The show's name also works as <code> ("/show/law-and-disorder"), as a convenience.
 * <episode> is the last part of the episode id (kpfk.kpfk.139887 -> 139887).
 * The old "?show=<episode id>" links keep working (app.js openDeepLink). */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShowLinks = factory();
})(typeof window === 'undefined' ? this : window, function(){
  'use strict';
  function slug(value){
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function lastPart(value){ return String(value || '').split('.').pop(); }
  function showPath(sho){ return '/show/' + encodeURIComponent(lastPart(sho)); }
  function episodePath(row){ return showPath(row.sho) + '/' + encodeURIComponent(lastPart(row.id)); }
  // {show, episode} for a /show/... path, else null.
  function parse(pathname){
    var m = /^\/show\/([^\/?#]+)(?:\/([^\/?#]+))?\/?$/.exec(String(pathname || ''));
    if(!m) return null;
    try { return {show: decodeURIComponent(m[1]).toLowerCase(), episode: m[2] ? decodeURIComponent(m[2]) : ''}; }
    catch(e){ return null; }   // malformed %-escape: not a link we can read
  }
  // Match a parsed link against the archive rows. Returns null when no show matches, else
  // {sho, row, rotated}: row is the linked episode, or the show's latest when the episode
  // has rotated out (rotated: true) or none was named.
  function resolve(link, rows, directory){
    if(!link) return null;
    var byShow = {};
    (rows || []).forEach(function(r){ (byShow[r.sho] = byShow[r.sho] || []).push(r); });
    var keys = Object.keys(byShow);
    var sho = keys.filter(function(k){ return lastPart(k).toLowerCase() === link.show; })[0] ||
      keys.filter(function(k){ return slug(((directory || {})[k] || {}).name || byShow[k][0].title) === link.show; })[0];
    if(!sho) return null;
    var list = byShow[sho];
    var latest = list.reduce(function(a, b){ return b.dt > a.dt ? b : a; });
    var row = link.episode ? list.filter(function(r){ return lastPart(r.id) === link.episode; })[0] : null;
    return {sho: sho, row: row || latest, rotated: !!link.episode && !row};
  }
  return {slug: slug, showPath: showPath, episodePath: episodePath, parse: parse, resolve: resolve};
});
