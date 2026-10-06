// Vocabulary for the optional `tastes:` and `effects:` front matter. Each term maps to a
// line icon (design/icons) and a tile color. The first five colors are sampled from the
// taste/effect tiles on doctorschoice.farm; the rest extend the same pastel range.
// site.json can add or override terms: "traits": { "tastes": { "skunk": { "icon": "wind", "color": "#C9CFD6" } } }

export const PALETTE = {
  lemon: '#FFEB47', tangerine: '#FFAE78', peach: '#FFBC8C', marigold: '#FFD24F', periwinkle: '#A9B3EC',
  blossom: '#FFB3C8', lilac: '#D5B3F0', sky: '#9ED3F5', mint: '#9FE3C0', fern: '#BFE39A',
  sand: '#E8D5A6', coral: '#FF9E8F', cocoa: '#D9B79A', stone: '#C9CFD6', lagoon: '#8FDDE0',
};

const P = PALETTE;
export const TRAITS = {
  tastes: {
    citrus: ['citrus', P.lemon], lemon: ['citrus', P.lemon], lime: ['citrus', P.fern], orange: ['citrus', P.tangerine],
    grapefruit: ['citrus', P.coral], sour: ['citrus', P.lagoon],
    fruity: ['apple', P.tangerine], apple: ['apple', P.fern], apricot: ['apple', P.peach], peach: ['apple', P.peach],
    berry: ['cherry', P.blossom], berries: ['cherry', P.blossom], blueberry: ['cherry', P.periwinkle],
    strawberry: ['cherry', P.coral], cherry: ['cherry', P.coral], grape: ['grape', P.lilac], banana: ['banana', P.lemon],
    tropical: ['tree-palm', P.lagoon], mango: ['tree-palm', P.marigold], pineapple: ['tree-palm', P.lemon],
    sweet: ['candy', P.blossom], candy: ['candy', P.blossom], vanilla: ['ice-cream-cone', P.sand],
    cream: ['ice-cream-cone', P.sand], creamy: ['ice-cream-cone', P.sand], chocolate: ['cookie', P.cocoa],
    cookies: ['cookie', P.cocoa], coffee: ['coffee', P.cocoa], honey: ['hexagon', P.marigold], nutty: ['nut', P.cocoa],
    pine: ['tree-pine', P.mint], woody: ['trees', P.sand], earthy: ['mountain', P.cocoa], herbal: ['leaf', P.fern],
    mint: ['leafy-green', P.mint], menthol: ['leafy-green', P.mint], floral: ['flower', P.lilac],
    lavender: ['flower-2', P.lilac], rose: ['flower', P.blossom], spicy: ['flame', P.coral], pepper: ['flame', P.coral],
    peppery: ['flame', P.coral], diesel: ['fuel', P.stone], fuel: ['fuel', P.stone], gas: ['fuel', P.stone],
    gassy: ['fuel', P.stone], skunk: ['wind', P.stone], skunky: ['wind', P.stone], cheese: ['pizza', P.marigold],
    cheesy: ['pizza', P.marigold], hash: ['cloud', P.stone], kush: ['cloud', P.stone], incense: ['cloud', P.stone],
    smoky: ['cloud', P.stone], bread: ['wheat', P.sand], wine: ['wine', P.lilac],
  },
  effects: {
    relaxed: ['waves', P.periwinkle], relaxing: ['waves', P.periwinkle], giggly: ['laugh', P.marigold],
    happy: ['smile', P.marigold], euphoric: ['sparkles', P.blossom], uplifted: ['sun', P.lemon], uplifting: ['sun', P.lemon],
    creative: ['palette', P.lilac], energetic: ['zap', P.tangerine], energizing: ['zap', P.tangerine],
    focused: ['target', P.lagoon], calm: ['feather', P.mint], sleepy: ['moon', P.periwinkle], hungry: ['utensils', P.peach],
    talkative: ['message-circle', P.sky], social: ['message-circle', P.sky], tingly: ['sparkle', P.coral],
    aroused: ['heart', P.blossom], 'body-high': ['sofa', P.periwinkle], couchlock: ['sofa', P.periwinkle],
    'clear-headed': ['eye', P.sky], motivated: ['rocket', P.tangerine], cerebral: ['brain', P.lilac],
    inspired: ['lightbulb', P.lemon],
  },
};

export const TRAIT_KINDS = { tastes: 'Tastes like', effects: 'Effects' };
const FALLBACK_ICON = { tastes: 'utensils', effects: 'sparkles' };
const SWATCHES = Object.values(PALETTE);

/** Front matter list (YAML list or comma string) -> unique trimmed terms, as written. */
export function traitList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  return list.map((t) => String(t).trim()).filter((t) => {
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve a term to { key, label, icon, color }: site.json overrides first, then the
 * defaults above, then a generic icon and a palette color that is stable per term.
 */
export function resolveTrait(kind, term, overrides = {}) {
  const key = term.toLowerCase().replace(/\s+/g, '-');
  const own = (overrides && overrides[key]) || {};
  const known = (TRAITS[kind] || {})[key] || [];
  const hash = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    key,
    label: term.charAt(0).toUpperCase() + term.slice(1),
    icon: own.icon || known[0] || FALLBACK_ICON[kind] || 'sparkles',
    color: own.color || known[1] || SWATCHES[hash % SWATCHES.length],
  };
}

/** The terms offered as one-click suggestions in the admin. */
export const SUGGESTED = {
  tastes: ['citrus', 'fruity', 'berry', 'grape', 'tropical', 'sweet', 'vanilla', 'coffee', 'pine', 'earthy', 'woody',
    'herbal', 'floral', 'spicy', 'diesel', 'skunk', 'cheese', 'hash'],
  effects: ['relaxed', 'happy', 'giggly', 'euphoric', 'uplifted', 'creative', 'energetic', 'focused', 'calm', 'sleepy',
    'hungry', 'talkative'],
};
