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

export const PRESETS = {
  // Cannabis-breeding site: deep forest green, warm cream, brushed gold.
  apex: {
    fonts: {
      display: { family: 'Fraunces', weights: '500;600;700', fallback: 'Georgia, serif' },
      body: { family: 'Inter', weights: '400;500;600', fallback: 'system-ui, sans-serif' },
      mono: { family: 'JetBrains Mono', weights: '400;500', fallback: 'ui-monospace, monospace' },
    },
    dark: {
      bg: '#0b1710', surface: '#12251a', surface2: '#183123', border: '#26402f',
      text: '#ece6d3', muted: '#9bb0a0', accent: '#d2ad52', accent2: '#7fc16a', accentInk: '#14200f',
    },
    light: {
      bg: '#f6f1e4', surface: '#fffdf6', surface2: '#efe8d4', border: '#d9d0b4',
      text: '#1b2a20', muted: '#5b6b5f', accent: '#8a6a14', accent2: '#2f7a3a', accentInk: '#fffdf6',
    },
    radius: '14px',
    maxWidth: '1120px',
  },
  // Doctor's Choice (doctorschoice.farm) look: black bars, signal red, white
  // page, bold uppercase Montserrat, thin outlined boxes, mono tags.
  doctorschoice: {
    defaultMode: 'light',
    fonts: {
      display: { family: 'Montserrat', weights: '600;700;800', fallback: 'Arial, sans-serif' },
      body: { family: 'Montserrat', weights: '400;500;600;700;800', fallback: 'Arial, sans-serif' },
      mono: { family: 'IBM Plex Mono', weights: '400;500;600', fallback: 'ui-monospace, monospace' },
    },
    dark: {
      bg: '#0a0a0a', surface: '#141414', surface2: '#212121', border: '#2a2a2a',
      text: '#f2f2f2', muted: '#a8a8a8', accent: '#ff3340', accent2: '#ff6670', accentInk: '#ffffff', ok: '#3fc263',
      hdBg: '#000000', hdText: '#ffffff', hdMuted: '#c8c8c8', hdBorder: '#2a2a2a',
    },
    light: {
      bg: '#f9f9f9', surface: '#ffffff', surface2: '#efefef', border: '#c8c8c8',
      text: '#212121', muted: '#6b6b6b', accent: '#c00712', accent2: '#8f0510', accentInk: '#ffffff', ok: '#1e8a38',
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

  const families = new Map();
  for (const f of Object.values(fonts)) {
    const w = String(f.weights || '400').split(';').sort().join(';');
    families.set(f.family, w);
  }
  const fontsUrl = 'https://fonts.googleapis.com/css2?'
    + [...families].map(([fam, w]) => `family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@${w}`).join('&')
    + '&display=swap';

  return { css, fontsUrl, themeColor: { dark: dark.bg, light: light.bg }, defaultMode, fonts, dark, light };
}
