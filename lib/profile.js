// Plant profile: optional front matter that describes a plant. Every field is a flat
// `key: value` line, so it works the same in Markdown files and in the admin.
//
//   genotype: sativa-dominant     indica, indica-dominant, balanced hybrid, sativa-dominant,
//   sativa: 70                    sativa, or "70% sativa"; a percentage places it exactly
//   growth: fast                  scale traits: the leading word sets a level from 1 to 5
//   height: compact, 60-90 cm     and the whole value is shown as written
//   branching: heavy lateral
//   smell-in-veg: pine            any other key is shown as a row of its own

// Identity of the plant or lot: [key, label, icon].
export const PLANT_FACTS = [
  ['strain', 'Strain', 'tag'], ['generation', 'Generation', 'layers'], ['status', 'Status', 'activity'],
  ['stage', 'Stage', 'hourglass'], ['sex', 'Sex', 'venus-and-mars'], ['quantity', 'Quantity', 'hash'],
  ['source', 'Source', 'map-pin'],
];

// How the plant grows: [key, label, icon, scale]; traits without a scale are plain text.
export const PLANT_TRAITS = [
  ['growth', 'Growth speed', 'gauge', 'speed'],
  ['height', 'Height', 'ruler', 'size'],
  ['branching', 'Branching', 'git-fork', 'amount'],
  ['internodes', 'Internodes', 'move-vertical', 'spacing'],
  ['stretch', 'Stretch', 'chevrons-up', 'amount'],
  ['yield', 'Yield', 'scale', 'amount'],
  ['resin', 'Resin', 'droplets', 'amount'],
  ['flowering', 'Flowering', 'sun', null],
  ['leaves', 'Leaves', 'leaf', null],
  ['resistance', 'Resistance', 'shield-check', null],
  ['phenotype', 'Phenotype', 'fingerprint', null],
];

// Words for each level of a scale, lowest first ("|" separates synonyms).
export const SCALES = {
  speed: ['very slow', 'slow', 'medium|moderate|average|normal', 'fast|quick|vigorous', 'very fast|very vigorous|explosive'],
  size: ['very short|very compact|dwarf|micro|tiny', 'short|compact|small|low', 'medium|average|mid|moderate',
    'tall|large|big|high', 'very tall|very large|huge|giant'],
  amount: ['very low|very light|very sparse|minimal|none', 'low|light|sparse|little|few', 'medium|moderate|average|some|normal',
    'high|heavy|strong|lots|good|dense', 'very high|very heavy|very strong|extreme|massive|bushy'],
  spacing: ['very tight|very short|very close', 'tight|short|close|compact', 'medium|average|moderate', 'long|wide|open',
    'very long|very wide|very open'],
};

// Genotype words and where they sit on the indica (0) to sativa (100) line; longest phrases first.
const GENOTYPES = [
  ['pure indica', 0], ['landrace indica', 5], ['indica-dominant', 30], ['indica dominant', 30], ['mostly indica', 25],
  ['pure sativa', 100], ['landrace sativa', 95], ['sativa-dominant', 70], ['sativa dominant', 70], ['mostly sativa', 75],
  ['balanced hybrid', 50], ['hybrid', 50], ['balanced', 50], ['indica', 10], ['sativa', 90],
];

// Keys the site uses itself, or that hold other content; never shown as extra rows.
const RESERVED = new Set([
  'title', 'date', 'type', 'tags', 'description', 'draft', 'slug', 'menu', 'order', 'layout', 'cross',
  'genotype', 'sativa', 'indica', 'tastes', 'effects', 'image', 'cover', 'thumbnail', 'excerpt', 'summary',
  'author', 'updated', 'lastmod', 'lang', 'permalink', 'canonical', 'pinned', 'featured',
  ...PLANT_FACTS.map(([k]) => k), ...PLANT_TRAITS.map(([k]) => k),
]);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const text = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '')).trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Level 1-5 for a scale trait: "4", "4/5" or a leading scale word; null if nothing matches. */
export function scaleLevel(scale, value) {
  const v = text(value).toLowerCase();
  const digit = v.match(/^([1-5])(?:\s*\/\s*5)?$/);
  if (digit) return Number(digit[1]);
  let level = null;
  let longest = 0;
  (SCALES[scale] || []).forEach((words, i) => {
    for (const w of words.split('|')) {
      if (w.length > longest && new RegExp(`^${escapeRe(w)}(?![a-z])`).test(v)) {
        level = i + 1;
        longest = w.length;
      }
    }
  });
  return level;
}

/**
 * { sativa: 0-100 | null, label, exact } from genotype / sativa / indica, or null when none is set.
 * `exact` is true when a percentage was given; a genotype word only places it approximately.
 */
export function genotypeOf(data) {
  const pct = (x) => {
    const m = text(x).match(/^(\d{1,3})\s*%?$/);
    return m && Number(m[1]) <= 100 ? Number(m[1]) : null;
  };
  const word = text(data.genotype);
  let sativa = pct(data.sativa);
  if (sativa === null && pct(data.indica) !== null) sativa = 100 - pct(data.indica);
  let exact = sativa !== null;
  if (sativa === null && word) {
    const m = word.toLowerCase().match(/(\d{1,3})\s*%\s*(sativa|indica)/);
    if (m && Number(m[1]) <= 100) [sativa, exact] = [m[2] === 'sativa' ? Number(m[1]) : 100 - Number(m[1]), true];
    else sativa = (GENOTYPES.find(([w]) => new RegExp(`^${escapeRe(w)}(?![a-z])`).test(word.toLowerCase())) || [])[1] ?? null;
  }
  if (sativa === null && !word) return null;
  const label = word ? cap(word)
    : sativa < 15 ? 'Indica' : sativa < 40 ? 'Indica-dominant' : sativa <= 60 ? 'Balanced hybrid' : sativa < 86 ? 'Sativa-dominant' : 'Sativa';
  return { sativa, label, exact };
}

/**
 * Everything describing the plant, ready to render:
 * facts and extra rows as [label, value, icon]; traits as { label, value, icon, level }.
 */
export function profileOf(data) {
  const facts = PLANT_FACTS.filter(([k]) => text(data[k])).map(([k, label, icon]) => [label, text(data[k]), icon]);
  const traits = PLANT_TRAITS.filter(([k]) => text(data[k])).map(([k, label, icon, scale]) => ({
    key: k, label, icon, value: cap(text(data[k])), level: scale ? scaleLevel(scale, data[k]) : null,
  }));
  const extra = extraKeys(data).map((k) => [cap(k.replace(/[-_]+/g, ' ')), cap(text(data[k])), 'circle-dot']);
  return { facts, cross: text(data.cross), genotype: genotypeOf(data), traits, extra };
}

/** Front matter keys shown as extra rows: everything the site and the fields above don't use. */
export const extraKeys = (data) => Object.keys(data).filter((k) => !isReserved(k) && !k.startsWith('_') && text(data[k]));
export const isReserved = (key) => RESERVED.has(String(key).toLowerCase());

/** Suggested words per field (offered by the admin; any other wording works too). */
export const SUGGESTIONS = {
  genotype: ['indica', 'indica-dominant', 'balanced hybrid', 'sativa-dominant', 'sativa'],
  sex: ['female', 'male', 'hermaphrodite', 'unknown'],
  status: ['active', 'retired', 'in stock', 'rooted', 'testing', 'in progress', 'planned', 'done'],
  stage: ['germination', 'seedling', 'vegetative', 'flowering', 'harvested', 'curing'],
  ...Object.fromEntries(PLANT_TRAITS.filter(([, , , scale]) => scale).map(([k, , , scale]) => [k, SCALES[scale].map((w) => w.split('|')[0])])),
};
