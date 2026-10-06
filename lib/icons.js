// Line icons for the design system. The SVGs in design/icons are from Lucide (ISC,
// see design/icons/LICENSE), vendored one file per icon so the build needs no icon
// package. To add one, copy any 24x24 stroke icon from lucide.dev into that folder.
//
//   const icons = createIcons('design/icons');
//   icons.svg('sprout')   // inline <svg> using currentColor, or null if unknown
//   icons.has('sprout')   // true

import fs from 'node:fs';
import path from 'node:path';

const NAME = /^[a-z0-9-]+$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function createIcons(dir) {
  const cache = new Map();
  const body = (name) => {
    const key = String(name ?? '');
    if (!NAME.test(key)) return null;
    if (!cache.has(key)) {
      const file = path.join(dir, `${key}.svg`);
      const match = fs.existsSync(file) && fs.readFileSync(file, 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      cache.set(key, match ? match[1].trim() : null);
    }
    return cache.get(key);
  };
  const svg = (name, cls = 'icon') => {
    const inner = body(name);
    return inner == null
      ? null
      : `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  };
  return { has: (name) => body(name) != null, svg };
}

/** A #rgb / #rrggbb color, or the fallback (colors end up in style attributes). */
export const safeColor = (value, fallback) => (HEX.test(String(value ?? '').trim()) ? String(value).trim() : fallback);
