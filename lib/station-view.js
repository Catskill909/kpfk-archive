'use strict';
const { publicProfile } = require('./station-config');
function escape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function render(html, profile) {
  const p = profile && publicProfile(profile);
  if (!p) return html;
  const values = { name: p.name, label: p.label, frequency: p.frequency, city: p.city,
    logo: p.assets.logo, icon: p.assets.icon, share: p.assets.share, touchIcon: p.assets.touchIcon, website: p.links.website, archive: p.links.archive };
  return html.replace(/\{\{station\.(\w+)\}\}/g, (_, key) => escape(values[key] || ''));
}
function script(profile) {
  // External script, not inline HTML; ensure encoding remains safe if embedded elsewhere later.
  return 'window.StationConfig = Object.freeze(' + JSON.stringify(publicProfile(profile))
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ');\n';
}
function manifest(profile) {
  return { id: '/', name: `${profile.name} ${profile.frequency} Archive`, short_name: `${profile.name} Archive`,
    description: `Browse and listen to ${profile.name} recordings.`, start_url: '/', scope: '/', display: 'standalone',
    theme_color: '#1c1615', background_color: '#1c1615', icons: [
      // PNG, not SVG: Android install and iOS home screens ignore SVG icons.
      { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ] };
}
module.exports = { render, script, manifest };
