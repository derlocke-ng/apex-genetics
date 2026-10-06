// A cannabis leaf drawn for a genotype: indica (0) has fewer, broad leaflets, sativa (100)
// more and narrower ones. Each leaflet is a lens with a thin neck, widest just past the
// middle, all meeting at one hub.

const lerp = (a, b, t) => a + (b - a) * t;
const f = (n) => n.toFixed(2);

function leaflet(bx, by, angle, L, hw) {
  const a = (angle * Math.PI) / 180;
  const [ux, uy, nx, ny] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  const P = (t, s) => `${f(bx + ux * t * L + nx * s * hw)} ${f(by + uy * t * L + ny * s * hw)}`;
  const w = 0.55;
  return `M${P(0, 0)}C${P(0.22, 0.22)} ${P(w - 0.22, 1)} ${P(w, 1)}C${P(w + 0.2, 1)} ${P(0.93, 0.22)} ${P(1, 0)}`
    + `C${P(0.93, -0.22)} ${P(w + 0.2, -1)} ${P(w, -1)}C${P(w - 0.22, -1)} ${P(0.22, -0.22)} ${P(0, 0)}Z`;
}

/** SVG path data (viewBox "4 2 56 58") for a leaf at `sativa` percent. */
export function leafPath(sativa = 50) {
  const t = Math.min(1, Math.max(0, Number(sativa) / 100));
  const [bx, by] = [32, 41];
  // Indica: five broad leaflets; hybrid: seven; sativa: nine narrow ones. Widths stay under the
  // gap between neighbouring axes at their widest point, so leaflets never touch.
  const fan = t < 0.3 ? [[0, 1, 1], [36, 0.86, 0.92], [72, 0.55, 0.7]]
    : t <= 0.65 ? [[0, 1, 1], [28, 0.9, 0.93], [56, 0.69, 0.8], [84, 0.41, 0.55]]
      : [[0, 1, 1], [22, 0.93, 0.95], [44, 0.8, 0.88], [66, 0.6, 0.75], [88, 0.34, 0.55]];
  const L = lerp(29, 34, t);
  const hw = lerp(3.9, 1.8, t);
  const d = [];
  for (const [angle, len, width] of fan) {
    for (const side of angle ? [1, -1] : [1]) d.push(leaflet(bx, by, angle * side, L * len, hw * width));
  }
  const r = 1.7;
  d.push(`M${f(bx - r)} ${f(by)}A${r} ${r} 0 1 0 ${f(bx + r)} ${f(by)}A${r} ${r} 0 1 0 ${f(bx - r)} ${f(by)}Z`);
  d.push(`M${f(bx - 0.95)} ${f(by)}L${f(bx - 0.5)} ${f(by + 16)}L${f(bx + 0.5)} ${f(by + 16)}L${f(bx + 0.95)} ${f(by)}Z`);
  return d.join('');
}

/** Inline SVG of the leaf, filled with currentColor. */
export const leafSvg = (sativa, cls = 'icon leaf-glyph') =>
  `<svg class="${cls}" viewBox="4 2 56 58" fill="currentColor" aria-hidden="true" focusable="false"><path d="${leafPath(sativa)}"/></svg>`;
