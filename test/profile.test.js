import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleLevel, genotypeOf, profileOf, extraKeys, isReserved } from '../lib/profile.js';
import { leafPath } from '../lib/leaf.js';

test('scale traits read the leading word, longest phrase first', () => {
  assert.equal(scaleLevel('speed', 'fast'), 4);
  assert.equal(scaleLevel('speed', 'Very fast, done in 60 days'), 5);
  assert.equal(scaleLevel('size', 'compact, 60-90 cm'), 2);
  assert.equal(scaleLevel('amount', 'heavy lateral'), 4);
  assert.equal(scaleLevel('amount', '4/5'), 4);
  assert.equal(scaleLevel('size', 'tallish'), null, 'no match inside a longer word');
  assert.equal(scaleLevel('amount', 'Christmas tree'), null);
  assert.equal(scaleLevel('size', '120 cm'), null);
});

test('genotype from words or percentages', () => {
  assert.deepEqual(genotypeOf({ genotype: 'sativa-dominant' }), { sativa: 70, label: 'Sativa-dominant', exact: false });
  assert.deepEqual(genotypeOf({ sativa: 70 }), { sativa: 70, label: 'Sativa-dominant', exact: true });
  assert.equal(genotypeOf({ indica: '80%' }).sativa, 20);
  assert.deepEqual(genotypeOf({ genotype: '60% sativa' }), { sativa: 60, label: '60% sativa', exact: true });
  assert.deepEqual(genotypeOf({ genotype: 'ruderalis cross' }), { sativa: null, label: 'Ruderalis cross', exact: false });
  assert.equal(genotypeOf({}), null);
});

test('profile: facts, scale traits and any other key as an extra row', () => {
  const p = profileOf({
    title: 'Mother A', type: 'mothers', tags: ['x'], draft: false, strain: 'Sample', growth: 'fast',
    flowering: '8 weeks', 'smell-in-veg': 'pine', light_cycle: '18/6', _private: 'no', tastes: ['citrus'],
  });
  assert.deepEqual(p.facts, [['Strain', 'Sample', 'tag']]);
  assert.deepEqual(p.traits.map((t) => [t.label, t.value, t.level]), [['Growth speed', 'Fast', 4], ['Flowering', '8 weeks', null]]);
  assert.deepEqual(p.extra.map(([label, value]) => [label, value]), [['Smell in veg', 'Pine'], ['Light cycle', '18/6']]);
  assert.deepEqual(extraKeys({ title: 'x', growth: 'fast', 'smell-in-veg': 'pine' }), ['smell-in-veg']);
  assert.equal(isReserved('Title'), true);
});

test('leaf shape follows the genotype: 5 leaflets indica, 7 hybrid, 9 sativa', () => {
  const leaflets = (sativa) => (leafPath(sativa).match(/M/g) || []).length - 2; // minus hub and stem
  assert.equal(leaflets(0), 5);
  assert.equal(leaflets(50), 7);
  assert.equal(leaflets(100), 9);
});
