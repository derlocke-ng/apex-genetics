import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createIcons, safeColor } from '../lib/icons.js';
import { traitList, resolveTrait, TRAITS } from '../lib/traits.js';

const icons = createIcons(fileURLToPath(new URL('../design/icons', import.meta.url)));

test('icons render inline and refuse unknown or unsafe names', () => {
  assert.match(icons.svg('sprout'), /^<svg class="icon" viewBox="0 0 24 24"[^>]*aria-hidden="true"/);
  assert.equal(icons.svg('no-such-icon'), null);
  assert.equal(icons.svg('../LICENSE'), null);
  assert.equal(icons.has('LICENSE'), false);
});

test('every icon the trait vocabulary uses is vendored', () => {
  for (const [kind, terms] of Object.entries(TRAITS)) {
    for (const [term, [icon]] of Object.entries(terms)) assert.ok(icons.has(icon), `${kind}.${term} uses missing icon "${icon}"`);
  }
});

test('colors for style attributes are validated', () => {
  assert.equal(safeColor('#FFEB47', 'x'), '#FFEB47');
  assert.equal(safeColor('#fff', 'x'), '#fff');
  assert.equal(safeColor('red;background:url(x)', 'x'), 'x');
  assert.equal(safeColor('', 'x'), 'x');
});

test('trait lists parse and resolve to icon and color', () => {
  assert.deepEqual(traitList('Citrus, pine, citrus'), ['Citrus', 'pine']);
  assert.deepEqual(traitList(['relaxed', ' giggly ']), ['relaxed', 'giggly']);
  const citrus = resolveTrait('tastes', 'citrus');
  assert.deepEqual([citrus.label, citrus.icon, citrus.color], ['Citrus', 'citrus', '#FFEB47']);
  assert.equal(resolveTrait('tastes', 'citrus', { citrus: { color: '#000000' } }).color, '#000000');
  const unknown = resolveTrait('effects', 'Wobbly');
  assert.equal(unknown.icon, 'sparkles');
  assert.equal(resolveTrait('effects', 'Wobbly').color, unknown.color, 'fallback color is stable per term');
});
