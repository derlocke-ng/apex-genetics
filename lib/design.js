// Design template: one function turns a preset (plus optional overrides) into
// the CSS custom properties, font URL and theme colors a site needs.
// Zero dependencies and no site-specific code, so it can be copied unchanged
// into another project (e.g. derlocke-blog) together with design/base.css.
//
//   import { createDesign } from './lib/design.js';
//   const design = createDesign({ preset: 'apex', tokens: { accent: '#e0b84f' } });
//   design.css       // ":root{...} :root.light{...}" (or :root.dark for light-first presets); prepend to design/base.css
//   design.fontsUrl  // Google Fonts stylesheet URL
//   design.themeColor // { dark, light } for <meta name="theme-color">
//   design.defaultMode // 'dark' | 'light': what visitors see before they toggle
//   design.skin       // preset name; append design/skins/<skin>.css after the site CSS if it exists
//
// Color tokens: bg, surface, surface2, border, text, muted, accent, accent2,
// accentInk, plus optional ok (status), band (alternate section background),
// marker (small squares/dots), placeholder (media panels) and hd* (header,
// hero and footer bars). base.css falls back sensibly when an optional token
// is missing. Font roles: display, body, label (eyebrows, chips, meta), mono.

export const PRESETS = {
  // Cannabis-breeding site: deep forest green, warm ivory, champagne gold.
  // Quiet surfaces and hairlines; gold is kept for small accents.
  apex: {
    fonts: {
      display: { family: 'Fraunces', weights: '400;500;600', fallback: 'Georgia, serif' },
      body: { family: 'Inter', weights: '400;500;600', fallback: 'system-ui, sans-serif' },
      label: { family: 'Inter', weights: '500;600', fallback: 'system-ui, sans-serif' },
      mono: { family: 'JetBrains Mono', weights: '400;500', fallback: 'ui-monospace, monospace' },
    },
    dark: {
      bg: '#0c1310', surface: '#111a15', surface2: '#17221c', border: '#223028', band: '#0f1813',
      text: '#ece7da', muted: '#94a397', accent: '#d6b56d', accent2: '#e6cd93', accentInk: '#12190f',
      ok: '#9cc98f', marker: '#d6b56d', placeholder: '#16201a',
    },
    light: {
      bg: '#f7f4ec', surface: '#fffdf8', surface2: '#efeadd', border: '#e0d8c5', band: '#f1ece0',
      text: '#17221b', muted: '#5d6a61', accent: '#8a6a1c', accent2: '#6c5212', accentInk: '#fffdf8',
      ok: '#2f6b3a', marker: '#b08a2e', placeholder: '#ebe5d6',
    },
    radius: '14px',
    maxWidth: '1180px',
  },
  // Doctor's Choice (doctorschoice.farm) look: black bars, white page, red
  // markers, bold uppercase Montserrat, 2px outlines, square corners.
  // Pairs with design/skins/doctorschoice.css.
  doctorschoice: {
    defaultMode: 'light',
    fonts: {
      display: { family: 'Montserrat', weights: '700;800', fallback: 'Arial, sans-serif' },
      body: { family: 'Montserrat', weights: '500;600;700;800', fallback: 'Arial, sans-serif' },
      label: { family: 'Montserrat', weights: '600;700', fallback: 'Arial, sans-serif' },
      mono: { family: 'IBM Plex Mono', weights: '400;500', fallback: 'ui-monospace, monospace' },
    },
    dark: {
      bg: '#000000', surface: '#000000', surface2: '#2a2a2a', border: '#2a2a2a', band: '#141414',
      text: '#ffffff', muted: '#c8c8c8', accent: '#ff0000', accent2: '#ff4d4d', accentInk: '#ffffff', ok: '#ff0000',
      marker: '#ff0000', placeholder: '#2a2a2a',
      hdBg: '#000000', hdText: '#ffffff', hdMuted: '#c8c8c8', hdBorder: '#2a2a2a',
    },
    light: {
      bg: '#ffffff', surface: '#ffffff', surface2: '#e6e6e6', border: '#c8c8c8', band: '#f8f5ef',
      text: '#000000', muted: '#2a2a2a', accent: '#c00712', accent2: '#ff0000', accentInk: '#ffffff', ok: '#c00712',
      marker: '#ff0000', placeholder: '#e6e6e6',
      hdBg: '#000000', hdText: '#ffffff', hdMuted: '#c8c8c8', hdBorder: '#2a2a2a',
    },
    radius: '0px',
    pill: '0px',
    caps: 'uppercase',
    maxWidth: '1280px',
  },
  // Dark terminal look (what derlocke-blog used before the shared design).
  terminal: {
    fonts: {
      display: { family: 'JetBrains Mono', weights: '500;700', fallback: 'ui-monospace, monospace' },
      body: { family: 'Cantarell', weights: '400;700', fallback: 'system-ui, sans-serif' },
      label: { family: 'JetBrains Mono', weights: '500', fallback: 'ui-monospace, monospace' },
      mono: { family: 'JetBrains Mono', weights: '400;500;700', fallback: 'ui-monospace, monospace' },
    },
    dark: {
      bg: '#1a1a1a', surface: '#242424', surface2: '#2e2e2e', border: '#3d3d3d',
      text: '#dcdcdc', muted: '#9a9a9a', accent: '#6c9fd1', accent2: '#d9b84e', accentInk: '#101010',
    },
    light: {
      bg: '#f5f5f5', surface: '#ffffff', surface2: '#ececec', border: '#d0d0d0',
      text: '#222222', muted: '#666666', accent: '#2f6aa5', accent2: '#8a6d10', accentInk: '#ffffff',
    },
    radius: '8px',
    maxWidth: '980px',
  },
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const SAFE = /^[^;{}<>\\]*$/;
const KEY = /^[a-zA-Z0-9]+$/;
const safe = (v) => {
  const s = String(v);
  if (!SAFE.test(s)) throw new Error(`design: unsafe value "${s}"`);
  return s;
};

/**
 * @param {{ preset?: keyof PRESETS, tokens?: object, light?: object, fonts?: object, radius?: string, pill?: string, caps?: string, maxWidth?: string }} [options]
 *   `tokens` overrides dark-mode colors, `light` light-mode colors, `fonts` the
 *   font roles (display/body/mono) as { family, weights, fallback }.
 */
export function createDesign(options = {}) {
  const base = PRESETS[options.preset || 'apex'];
  if (!base) throw new Error(`design: unknown preset "${options.preset}" (available: ${Object.keys(PRESETS).join(', ')})`);
  const dark = { ...base.dark, ...options.tokens };
  const light = { ...base.light, ...options.light };
  const fonts = {};
  for (const role of Object.keys(base.fonts)) fonts[role] = { ...base.fonts[role], ...(options.fonts || {})[role] };

  const vars = (colors) => Object.entries(colors).map(([k, v]) => {
    if (!KEY.test(k)) throw new Error(`design: unsafe token name "${k}"`);
    return `--${kebab(k)}:${safe(v).replace(/\/\*|url\(|@import/gi, '')};`;
  }).join('');
  const fontVars = Object.entries(fonts)
    .map(([role, f]) => `--font-${role}:"${safe(f.family)}",${safe(f.fallback)};`)
    .join('');
  const radius = safe(options.radius || base.radius);
  const maxWidth = safe(options.maxWidth || base.maxWidth);
  const pill = safe(options.pill || base.pill || '999px');
  const caps = safe(options.caps || base.caps || 'none');

  const defaultMode = base.defaultMode === 'light' ? 'light' : 'dark';
  const first = defaultMode === 'light' ? light : dark;
  const other = defaultMode === 'light' ? dark : light;
  const css = `:root{${vars(first)}${fontVars}--radius:${radius};--max-width:${maxWidth};--pill:${pill};--caps:${caps};color-scheme:${defaultMode}}\n`
    + `:root.${defaultMode === 'light' ? 'dark' : 'light'}{${vars(other)}color-scheme:${defaultMode === 'light' ? 'dark' : 'light'}}\n`;

  // Roles may share a family (e.g. body and label): request the union of their weights.
  const families = new Map();
  for (const f of Object.values(fonts)) {
    const w = families.get(f.family) || new Set();
    for (const x of String(f.weights || '400').split(';')) w.add(x.trim());
    families.set(f.family, w);
  }
  const fontsUrl = 'https://fonts.googleapis.com/css2?'
    + [...families].map(([fam, w]) => `family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@${[...w].sort((a, b) => a - b).join(';')}`).join('&')
    + '&display=swap';

  const skin = options.preset || 'apex';
  return { css, fontsUrl, themeColor: { dark: dark.hdBg || dark.bg, light: light.hdBg || light.bg }, defaultMode, fonts, dark, light, skin };
}
