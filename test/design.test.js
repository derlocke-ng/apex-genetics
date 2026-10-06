import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDesign, PRESETS } from '../lib/design.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('every preset produces variables, fonts and theme colors', () => {
  for (const preset of Object.keys(PRESETS)) {
    const d = createDesign({ preset });
    assert.match(d.css, /:root\{--bg:/);
    assert.match(d.css, /:root\.(light|dark)\{--bg:/);
    assert.match(d.css, /--font-display:/);
    assert.match(d.css, /--font-label:/);
    assert.equal(d.skin, preset);
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

test('the doctorschoice preset is light-first with always-black header tokens', () => {
  const d = createDesign({ preset: 'doctorschoice' });
  assert.equal(d.defaultMode, 'light');
  assert.match(d.css, /^:root\{--bg:#ffffff;/);
  assert.match(d.css, /:root\.dark\{--bg:#000000;/);
  assert.match(d.css, /--hd-bg:#000000;/);
  assert.match(d.css, /--marker:#ff0000;/);
  assert.equal(d.themeColor.light, '#000000', 'browser chrome matches the black header');
  assert.ok(fs.existsSync(new URL('../design/skins/doctorschoice.css', import.meta.url)), 'doctorschoice ships its skin');
  assert.equal(createDesign({ preset: 'apex' }).defaultMode, 'dark');
});

test('font roles that share a family request the union of their weights', () => {
  const d = createDesign({ preset: 'doctorschoice' });
  assert.match(d.fontsUrl, /family=Montserrat:wght@500;600;700;800&/);
  assert.equal((d.fontsUrl.match(/family=Montserrat/g) || []).length, 1);
});

test('shared stylesheets take every color from the tokens', () => {
  // Hard-coded colors in these files break every preset but the one they were written for.
  for (const f of ['design/base.css', 'theme/style.css']) {
    assert.deepEqual(read(f).match(/#[0-9a-f]{3,8}\b/gi), null, `${f} hard-codes a color`);
  }
});
