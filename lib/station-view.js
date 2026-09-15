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
    logo: p.assets.logo, icon: p.assets.icon, website: p.links.website, archive: p.links.archive };
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
    theme_color: '#1c1615', background_color: '#1c1615', icons: [{ src: profile.assets.icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
module.exports = { render, script, manifest };
