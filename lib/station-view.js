'use strict';
const { publicProfile } = require('./station-config');
function escape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Side menu ----
// Built from the station profile so a station edits stations/<id>.json, not
// index.html: every item appears only when its link is configured, and a group
// with no items is left out entirely. Glyphs are inline SVG (no icon font, no
// sprite request) inheriting currentColor, as the stylesheet expects.
const STROKE = 'class="menu-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS = {
  schedule: `<svg ${STROKE}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.6h17M8 3.4v3.2M16 3.4v3.2" /></svg>`,
  programs: `<svg ${STROKE}><path d="M9 6.8h10.5M9 12h10.5M9 17.2h10.5M4.6 6.8h.01M4.6 12h.01M4.6 17.2h.01" /></svg>`,
  androidApp: `<svg ${STROKE}><path d="M6 12a6 6 0 0 1 12 0" /><path d="M6 12v5.4A1.6 1.6 0 0 0 7.6 19h8.8a1.6 1.6 0 0 0 1.6-1.6V12z" /><path d="M8.2 7.2 6.8 4.8M15.8 7.2l1.4-2.4M9.8 9.6h.01M14.2 9.6h.01" /></svg>`,
  appleApp: '<svg class="menu-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.1.7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.4 2.5-.4 6.1 1 8.1.7 1 1.5 2.1 2.6 2 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.2-.8-2.2-3zM14.4 6.3c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.6.9.1 1.9-.5 2.6-1.2z" /></svg>',
  about: `<svg ${STROKE}><circle cx="12" cy="12" r="8.5" /><path d="M12 11.2v5M12 7.8h.01" /></svg>`,
  mission: `<svg ${STROKE}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.2" /><path d="M12 12h.01" /></svg>`,
  pacifica: `<svg ${STROKE}><circle cx="12" cy="12" r="8.5" /><path d="M3.6 12h16.8" /><path d="M12 3.5c2.2 2.4 3.4 5.3 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.3-3.4-8.5S9.8 5.9 12 3.5z" /></svg>`,
  news: `<svg ${STROKE}><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h9A1.5 1.5 0 0 1 16 6.5V19H6a2 2 0 0 1-2-2z" /><path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V17a2 2 0 0 1-2 2h-2" /><path d="M7.2 8.6h5.6M7.2 12h5.6M7.2 15.4h3.6" /></svg>`,
  donate: `<svg ${STROKE}><path d="M12 20.2s-7.3-4.4-7.3-9.3A4.1 4.1 0 0 1 12 8.3a4.1 4.1 0 0 1 7.3 2.6c0 4.9-7.3 9.3-7.3 9.3z" /></svg>`,
  volunteer: `<svg ${STROKE}><path d="M15.2 19.8v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4v1.6" /><circle cx="9.35" cy="8" r="3.4" /><path d="M20.5 19.8v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.7 4.8a3.4 3.4 0 0 1 0 6.4" /></svg>`,
  contact: `<svg ${STROKE}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.6 8.2 6.3 4.5a2 2 0 0 0 2.2 0l6.3-4.5" /></svg>`,
  privacy: `<svg ${STROKE}><path d="M12 3.5l7 2.5v5.4c0 4.6-3 8.2-7 9.6-4-1.4-7-5-7-9.6V6l7-2.5z" /><path d="M9.3 12.2l1.9 1.9 3.5-3.9" /></svg>`,
  website: `<svg ${STROKE}><path d="M14 4.5h5.5V10M19.3 4.7 11.6 12.4" /><path d="M18.2 14v4.6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4.6" /></svg>`,
};
const SOCIAL = {
  x: ['X', '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4l7.5 9.5L4.3 20H7l5-5.7 4 5.7h4l-7.8-10L19.6 4H17l-4.6 5.2L8.5 4z" /></svg>'],
  facebook: ['Facebook', '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5h2.5V5.2C16 5.1 14.9 5 13.7 5 11.1 5 9.4 6.6 9.4 9.5v2.1H6.5V15h2.9v9h3.4v-9h2.8l.5-3.4h-3.3V9.8c0-1 .3-1.3 1.2-1.3z" /></svg>'],
  instagram: ['Instagram', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.6" cy="7.4" r="1" fill="currentColor" stroke="none" /></svg>'],
  youtube: ['YouTube', '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M6.5 5.5h11a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4zM10 9v6l5.2-3z" /></svg>'],
  linkedin: ['LinkedIn', '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 9h3v10H5zM6.5 4a1.8 1.8 0 1 1 0 3.6A1.8 1.8 0 0 1 6.5 4zM11 9h2.9v1.4h.04c.4-.76 1.4-1.6 2.9-1.6 3.1 0 3.66 2 3.66 4.7V19h-3v-4.9c0-1.17-.02-2.68-1.64-2.68-1.65 0-1.9 1.28-1.9 2.6V19H11z" /></svg>'],
  bluesky: ['Bluesky', '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 9.2C10.6 6.6 8.2 4.6 5.6 4c-1 0-1.6.5-1.6 1.6 0 2 .5 5.7 3 7.6-1.9-.3-3.5.2-3.5 1.8 0 1.3 1.6 2.1 3.6 2.3-1.3.6-2 1.4-2 2.3 0 1.5 1.7 2.4 3.7 1 1.3-.9 2.4-2.4 3.2-3.9.8 1.5 1.9 3 3.2 3.9 2 1.4 3.7.5 3.7-1 0-.9-.7-1.7-2-2.3 2-.2 3.6-1 3.6-2.3 0-1.6-1.6-2.1-3.5-1.8 2.5-1.9 3-5.6 3-7.6C21.6 4.5 21 4 20 4c-2.6.6-5 2.6-6.4 5.2-.6 1-.8 1.6-1.1 2.3-.3-.7-.5-1.3-1.1-2.3z" /></svg>'],
};
// [link key, label, extra attributes]. Schedule, Donate and Privacy keep the ids
// app.js wires to in-app dialogs; their hrefs stay real as the fallback and for
// open-in-new-tab. Schedule is always present because it opens the in-app
// schedule — its href falls back to the archive root when no page is configured.
function menuGroups(p) {
  const host = new URL(p.links.website).hostname.replace(/^www\./, '');
  return {
    listen: [
      ['schedule', 'Schedule', 'id="menuSchedule" aria-haspopup="dialog" aria-controls="schedModal"'],
      ['programs', 'Programs A–Z'],
      ['discovery', 'Discover shows'],
      ['androidApp', `${p.name} Android App`],
      ['appleApp', `${p.name} Apple App`],
    ],
    station: [['about', `About ${p.name}`], ['mission', 'Mission'], ['pacifica', 'Pacifica Foundation'], ['news', 'News']],
    support: [
      ['donate', 'Donate', 'id="menuDonate" aria-haspopup="dialog" aria-controls="donateModal"'],
      ['volunteer', 'Volunteer'], ['contact', 'Contact'],
      ['privacy', 'Privacy Policy', 'id="menuPrivacy" aria-haspopup="dialog" aria-controls="donateModal"'],
      ['website', host],
    ],
  };
}
function menu(p) {
  const groups = menuGroups(p);
  const item = ([key, label, attrs]) => {
    if (key === 'discovery') return p.plugins && p.plugins.discovery
      ? `<li><a href="/discover">${ICONS.programs}<span>Discover shows</span></a></li>` : '';
    const href = p.links[key] || (key === 'schedule' ? '#schedule' : '');
    if (!href) return '';
    return `<li><a href="${escape(href)}"${attrs ? ' ' + attrs : ''} target="_blank" rel="noopener noreferrer">`
      + `${ICONS[key]}<span>${escape(label)}</span></a></li>`;
  };
  const group = (title, items) => {
    const lis = items.map(item).join('');
    return lis ? `<div class="menu-group"><h2>${escape(title)}</h2><ul>${lis}</ul></div>` : '';
  };
  const social = Object.entries(p.social || {}).filter(([key]) => SOCIAL[key]).map(([key, url]) =>
    `<a class="social-btn" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(`${p.name} on ${SOCIAL[key][0]}`)}">${SOCIAL[key][1]}</a>`).join('');
  return {
    social,
    nav: group('Listen', groups.listen) + group('Station', groups.station) + group('Support & contact', groups.support),
  };
}

function render(html, profile) {
  const p = profile && publicProfile(profile);
  if (!p) return html;
  const values = { name: p.name, label: p.label, frequency: p.frequency, city: p.city,
    logo: p.assets.logo, icon: p.assets.icon, share: p.assets.share, touchIcon: p.assets.touchIcon, website: p.links.website, archive: p.links.archive };
  const built = menu(p);
  // {{menu.*}} inserts markup built above from escaped values; {{station.*}} inserts escaped text.
  return html.replace(/\{\{menu\.(social|nav)\}\}/g, (_, key) => built[key])
    .replace(/\{\{station\.(\w+)\}\}/g, (_, key) => escape(values[key] || ''));
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
module.exports = { render, script, manifest, menu };
