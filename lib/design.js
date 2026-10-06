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
//   design.defaultMode // 'dark' | 'light' | 'system': what visitors see before they toggle
//   design.fontFiles  // self-hosted font files (relative to the stylesheet), for preloading
//   design.skin       // preset name; append design/skins/<skin>.css after the site CSS if it exists
//
// Color tokens: bg, surface, surface2, border, text, muted, accent, accent2,
// accentInk, plus optional ok (status), band (alternate section background),
// marker (small squares/dots), placeholder (media panels), tileMix / tileInk
// (icon tiles: how much of a tile's color fills it, and the icon color; the
// icon takes the tile's color when tileInk is unset) and hd* (header, hero
// and footer bars). `brand` ({ bg, fg, radius }) colors the favicon tile. base.css falls back sensibly when an optional token
// is missing. Font roles: display, body, label (eyebrows, chips, meta), mono.

export const PRESETS = {
  // Apex Genetics brand kit ("Hex Leaf"): ink, paper and brand green on a soft green-grey
  // ground, Archivo (self-hosted, variable width) for everything, wide and heavy for headlines.
  // Light-first and dark when the visitor's OS is. Pairs with design/skins/apex.css.
  // On dark, links use a lighter step of the brand green (the kit's #2F7350 is too dark for text).
  apex: {
    defaultMode: 'system',
    fonts: {
      display: { family: 'Archivo', src: 'fonts/Archivo-Variable.woff2', weights: '100 900', stretch: '62% 125%', fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      body: { family: 'Archivo', src: 'fonts/Archivo-Variable.woff2', weights: '100 900', stretch: '62% 125%', fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      label: { family: 'Archivo', src: 'fonts/Archivo-Variable.woff2', weights: '100 900', stretch: '62% 125%', fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      mono: { family: 'IBM Plex Mono', weights: '400;500', fallback: 'ui-monospace, monospace' },
    },
    light: {
      bg: '#E9EBE6', surface: '#F7F8F5', surface2: '#DCE7DF', border: '#D3D8D1', band: '#F2F3EF',
      text: '#121714', muted: '#5B625D', accent: '#1F5A3A', accent2: '#163F29', accentInk: '#F2F3EF',
      ok: '#1F5A3A', marker: '#1F5A3A', placeholder: '#E1E5DE', tileMix: '58%', tileInk: '#121714',
    },
    dark: {
      bg: '#0C100E', surface: '#121714', surface2: '#1A211D', border: '#2A312D', band: '#101512',
      text: '#F2F3EF', muted: '#A3AAA5', accent: '#5E9E7A', accent2: '#7DB394', accentInk: '#0C100E',
      ok: '#7DB394', marker: '#5E9E7A', placeholder: '#161C18', tileMix: '16%',
    },
    brand: { bg: '#1F5A3A', fg: '#F2F3EF', radius: '14', mark: 'outline' },
    radius: '14px',
    pill: '6px',
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
      marker: '#ff0000', placeholder: '#2a2a2a', tileMix: '100%', tileInk: '#000000',
      hdBg: '#000000', hdText: '#ffffff', hdMuted: '#c8c8c8', hdBorder: '#2a2a2a',
    },
    light: {
      bg: '#ffffff', surface: '#ffffff', surface2: '#e6e6e6', border: '#c8c8c8', band: '#f8f5ef',
      text: '#000000', muted: '#2a2a2a', accent: '#c00712', accent2: '#ff0000', accentInk: '#ffffff', ok: '#c00712',
      marker: '#ff0000', placeholder: '#e6e6e6', tileMix: '100%', tileInk: '#000000',
      hdBg: '#000000', hdText: '#ffffff', hdMuted: '#c8c8c8', hdBorder: '#2a2a2a',
    },
    brand: { bg: '#ff0000', fg: '#ffffff', radius: '0', mark: 'solid' },
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
    brand: { bg: '#1a1a1a', fg: '#6c9fd1', radius: '10' },
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
  for (const role of Object.keys(base.fonts)) {
    const own = base.fonts[role];
    const override = (options.fonts || {})[role] || {};
    // A different family starts fresh (keeping only the fallback stack), so it can't inherit
    // the preset's self-hosted file.
    fonts[role] = override.family && override.family !== own.family
      ? { weights: '400', fallback: own.fallback, ...override }
      : { ...own, ...override };
  }

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

  // 'system' follows the visitor's OS setting; the stylesheet is then light-first like 'light'.
  const defaultMode = ['light', 'system'].includes(base.defaultMode) ? base.defaultMode : 'dark';
  const firstMode = defaultMode === 'dark' ? 'dark' : 'light';
  const otherMode = firstMode === 'light' ? 'dark' : 'light';
  const first = firstMode === 'light' ? light : dark;
  const other = firstMode === 'light' ? dark : light;

  // Self-hosted fonts ({ family, src, weights: '100 900', stretch: '62% 125%' }; src is
  // relative to the stylesheet) get an @font-face; the rest come from Google Fonts.
  const hosted = new Map();
  for (const f of Object.values(fonts)) if (f.src) hosted.set(f.family, f);
  const fontFaces = [...hosted.values()].map((f) => `@font-face{font-family:"${safe(f.family)}";src:url("${safe(f.src)}") format("woff2");`
    + `font-weight:${safe(f.weights || '400')};${f.stretch ? `font-stretch:${safe(f.stretch)};` : ''}font-style:normal;font-display:swap}\n`).join('');

  const css = fontFaces
    + `:root{${vars(first)}${fontVars}--radius:${radius};--max-width:${maxWidth};--pill:${pill};--caps:${caps};color-scheme:${firstMode}}\n`
    + `:root.${otherMode}{${vars(other)}color-scheme:${otherMode}}\n`;

  // Roles may share a family (e.g. body and label): request the union of their weights.
  const families = new Map();
  for (const f of Object.values(fonts)) {
    if (f.src) continue;
    const w = families.get(f.family) || new Set();
    for (const x of String(f.weights || '400').split(';')) w.add(x.trim());
    families.set(f.family, w);
  }
  const fontsUrl = families.size ? 'https://fonts.googleapis.com/css2?'
    + [...families].map(([fam, w]) => `family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@${[...w].sort((a, b) => a - b).join(';')}`).join('&')
    + '&display=swap' : '';

  const skin = options.preset || 'apex';
  const brand = { bg: dark.bg, fg: dark.accent, radius: '12', ...base.brand, ...options.brand };
  for (const k of Object.keys(brand)) brand[k] = safe(brand[k]);
  return { css, fontsUrl, themeColor: { dark: dark.hdBg || dark.bg, light: light.hdBg || light.bg }, defaultMode, fonts, dark, light, skin, brand,
    fontFiles: [...hosted.values()].map((f) => f.src) };
}
