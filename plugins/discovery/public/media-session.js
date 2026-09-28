/* Lock screen, headset keys and car displays (Media Session API), ported from the
 * podcast template (kpfk-archive public/app.js "Media Session"). Archive audio only:
 * this plugin has no live stream and no ordered track list, so previous/next stay off. */
'use strict';
(() => {
  const has = 'mediaSession' in navigator && 'MediaMetadata' in window;
  const SKIP = 15;
  let api = null, lastSync = 0;
  // Same-origin raster only: the OS silently drops cross-origin artwork and fails to
  // decode an SVG labelled as an image, then falls through to the next entry.
  const STATION_ART = [
    {src:'/assets/icon-192.png', sizes:'192x192', type:'image/png'},
    {src:'/assets/apple-touch-icon.png', sizes:'180x180', type:'image/png'}
  ];
  const artworkFor = photo => (photo && photo.startsWith('/api/artwork/') ? [{src:photo, sizes:'any', type:'image/jpeg'}] : []).concat(STATION_ART);
  // setActionHandler throws for actions a browser does not know; each call is guarded
  // so an unsupported action cannot stop the supported ones from binding.
  function handler(action, fn) { try { navigator.mediaSession.setActionHandler(action, fn); } catch(e) { /* unsupported action */ } }
  function position(audio) {
    if(!navigator.mediaSession.setPositionState) return;
    const d = audio.duration;
    if(!Number.isFinite(d) || d <= 0) return;
    try { navigator.mediaSession.setPositionState({duration:d, playbackRate:audio.playbackRate || 1, position:Math.min(Math.max(audio.currentTime, 0), d)}); }
    catch(e) { /* non-finite duration mid-load; the next timeupdate retries */ }
  }
  function describe(audio) {
    const row = api.getRow(audio.dataset.id || '');
    if(!row) { navigator.mediaSession.metadata = null; return; }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: api.title(row), artist: api.artist(row), album: api.album(), artwork: artworkFor(api.photo(row))
    });
  }
  function init(options) {
    if(!has) return;
    api = options;
    const audio = document.getElementById('audio');
    const seekBy = offset => { if(Number.isFinite(audio.duration)) { audio.currentTime = Math.min(Math.max(audio.currentTime + offset, 0), audio.duration); position(audio); } };
    handler('play', () => audio.play().catch(e => console.warn('Lock-screen play rejected:', e.message)));
    handler('pause', () => audio.pause());
    handler('stop', () => audio.pause());
    handler('seekbackward', d => seekBy(-((d && d.seekOffset) || SKIP)));
    handler('seekforward', d => seekBy((d && d.seekOffset) || SKIP));
    handler('seekto', d => { if(!d || !Number.isFinite(d.seekTime)) return; if(d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; position(audio); });
    handler('previoustrack', null); handler('nexttrack', null);
    audio.addEventListener('loadstart', () => { lastSync = 0; if(audio.dataset.id) describe(audio); });
    audio.addEventListener('play', () => { describe(audio); navigator.mediaSession.playbackState = 'playing'; });
    audio.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; position(audio); });
    audio.addEventListener('emptied', () => { if(!audio.dataset.id) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } });
    ['durationchange','seeked','ratechange'].forEach(e => audio.addEventListener(e, () => position(audio)));
    // Throttled: timeupdate fires ~4×/s; the OS extrapolates between syncs.
    audio.addEventListener('timeupdate', () => { if(Math.abs(audio.currentTime - lastSync) >= 5) { lastSync = audio.currentTime; position(audio); } });
  }
  window.DiscoveryMediaSession = {init};
})();
