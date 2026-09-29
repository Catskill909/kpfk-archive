'use strict';

/**
 * Station colour (station template slice 3, 2026-09-29). Staff pick ONE brand colour; the site
 * needs two versions of it, because the design has a dark and a light theme (public/styles.css:
 * dark #e14a2e, light #c8371e for KPFK's red). This module derives both and the text colour on
 * top, so every combination meets WCAG AA (docs/accessibility.md):
 *   - the colour against the theme's page surface: at least 3:1 (buttons, badges, focus);
 *   - text on the colour (--accent-ink): at least 4.5:1.
 * The colour is lightened (dark theme) or darkened (light theme) in small steps until both hold.
 * Delivered as /station.css, a same-origin stylesheet: the CSP forbids inline styles.
 */

const SURFACE = { dark: '#1c1615', light: '#ffffff' };      // --surface-1 of each theme
const INKS = ['#fff5f2', '#14100f'];                         // the design's light and dark text
const UI_MIN = 3, TEXT_MIN = 4.5;

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function luminance(h) {
  const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
function mix(a, b, t) { const [p, q] = [rgb(a), rgb(b)]; return hex(p.map((v, i) => v + (q[i] - v) * t)); }
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** The best of the design's two text colours on `accent`. */
function inkFor(accent) { return INKS.reduce((best, c) => (contrast(accent, c) > contrast(accent, best) ? c : best)); }

/** One theme's version: move toward white (dark theme) or black (light theme) until it passes. */
function forTheme(colour, theme) {
  const toward = theme === 'dark' ? '#ffffff' : '#000000';
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const accent = mix(colour, toward, t), ink = inkFor(accent);
    if (contrast(accent, SURFACE[theme]) >= UI_MIN && contrast(accent, ink) >= TEXT_MIN) return { accent, ink, adjusted: t > 0 };
  }
  // Unreachable for any real colour (pure white/black satisfy both), kept so a bug cannot return nothing.
  throw new Error(`no readable ${theme} version of ${colour}`);
}

/** Both themes for a brand colour: { dark: {accent, ink, adjusted}, light: {…} }. */
function derive(colour) {
  if (!isHex(colour)) throw new Error('a colour must be #rrggbb');
  const c = colour.toLowerCase();
  return { dark: forTheme(c, 'dark'), light: forTheme(c, 'light') };
}

/** The /station.css body for a station: empty (the design's own colours) when it sets none. */
function css(profile) {
  const accent = profile && profile.colors && profile.colors.accent;
  if (!accent) return '/* No station colour set: the design\'s own colours apply. */\n';
  const d = derive(accent), v = (x) => `--accent:${x.accent};--accent-ink:${x.ink};`;
  // The same four selectors as public/styles.css, loaded after it, so these win in every theme state.
  return `/* Station colour ${accent} (studio: Station & appearance). Generated; see lib/station-colors.js. */\n`
    + `:root{${v(d.dark)}}\n`
    + `@media (prefers-color-scheme: light){:root{${v(d.light)}}}\n`
    + `:root[data-theme="dark"]{${v(d.dark)}}\n`
    + `:root[data-theme="light"]{${v(d.light)}}\n`;
}

module.exports = { derive, css, contrast, isHex, SURFACE, UI_MIN, TEXT_MIN };
