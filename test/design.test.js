import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, PRESETS } from '../lib/design.js';

test('every preset produces variables, fonts and theme colors', () => {
  for (const preset of Object.keys(PRESETS)) {
    const d = createDesign({ preset });
    assert.match(d.css, /:root\{--bg:/);
    assert.match(d.css, /:root\.light\{--bg:/);
    assert.match(d.css, /--font-display:/);
    assert.match(d.fontsUrl, /^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
    assert.ok(d.themeColor.dark && d.themeColor.light);
  }
});

test('tokens and fonts can be overridden', () => {
  const d = createDesign({ tokens: { accent: '#ff0000' }, fonts: { display: { family: 'Lora', weights: '600' } } });
  assert.match(d.css, /--accent:#ff0000;/);
  assert.match(d.fontsUrl, /family=Lora:wght@600/);
});

test('unknown presets and unsafe values are rejected', () => {
  assert.throws(() => createDesign({ preset: 'nope' }), /unknown preset/);
  assert.throws(() => createDesign({ tokens: { accent: 'red;}body{display:none' } }), /unsafe/);
});
