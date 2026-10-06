import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../build.js';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-build-'));
const result = await build({ out, quiet: true });
test.after(() => fs.rmSync(out, { recursive: true, force: true }));

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'admin' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

test('builds the expected files', () => {
  for (const f of ['index.html', 'archive.html', '404.html', 'feed.xml', 'sitemap.xml', 'robots.txt', 'search.json',
    'assets/style.css', 'assets/site.js', 'admin/index.html', 'admin/app.js', 'admin/config.json',
    'admin/lib/content.js', 'admin/lib/markdown.js', 'admin/vendor/marked.esm.js']) {
    assert.ok(fs.existsSync(path.join(out, f)), `missing ${f}`);
  }
  for (const p of result.posts) assert.ok(fs.existsSync(path.join(out, p.section.key, p.slug, 'index.html')), `missing post ${p.slug}`);
  for (const p of result.pages) assert.ok(fs.existsSync(path.join(out, `${p.slug}.html`)), `missing page ${p.slug}`);
});

test('drafts are not published', () => {
  for (const p of result.posts) assert.equal(p.draft, false, `${p.slug} is a draft`);
});

test('every internal link and asset resolves', () => {
  const broken = [];
  for (const file of htmlFiles(out)) {
    if (path.basename(file) === '404.html') continue; // uses absolute URLs on purpose
    const html = fs.readFileSync(file, 'utf8');
    for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (/^([a-z]+:|\/\/|#)/i.test(url)) continue;
      const [rel, hash] = url.split('#');
      let target = path.resolve(path.dirname(file), decodeURIComponent(rel.split('?')[0]));
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) {
        broken.push(`${path.relative(out, file)} -> ${url}`);
        continue;
      }
      if (hash && target.endsWith('.html') && !fs.readFileSync(target, 'utf8').includes(`id="${hash}"`)) {
        broken.push(`${path.relative(out, file)} -> ${url} (missing #${hash})`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('feed is well-formed enough and uses absolute URLs', () => {
  const feed = fs.readFileSync(path.join(out, 'feed.xml'), 'utf8');
  assert.match(feed, /^<\?xml/);
  assert.equal((feed.match(/<item>/g) || []).length, result.posts.length);
  assert.doesNotMatch(feed, /(?:href|src)="\/(?!\/)/);
});

test('entries use the layout of their section', () => {
  const read = (rel) => fs.readFileSync(path.join(out, rel), 'utf8');
  const mother = read('mothers/mother-a/index.html');
  assert.match(mother, /class="entry entry-specimen"/);
  assert.match(mother, /class="trait"><span class="icon-tile" style="--tile:#FFEB47"/, 'citrus taste tile');
  const challenge = read('challenges/compact-mold-resistant-hybrid/index.html');
  assert.match(challenge, /class="entry entry-article"/);
  assert.doesNotMatch(challenge, /class="specimen"/);
  assert.doesNotMatch(read('index.html'), /View challenge/, 'article cards read, they do not "view"');
});

test('the logo and favicon replace the emoji', () => {
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /<span class="brand-mark"[^>]*><svg class="logo"/);
  assert.match(home, /<link rel="icon" href="[^"]*assets\/favicon\.svg/);
  assert.match(fs.readFileSync(path.join(out, 'assets/favicon.svg'), 'utf8'), /^<svg[^>]*><rect /);
});

test('the plant profile renders: spectrum, meters, free rows', () => {
  const read = (rel) => fs.readFileSync(path.join(out, rel), 'utf8');
  const mother = read('mothers/mother-a/index.html');
  assert.match(mother, /<p class="label">Plant profile<\/p>/);
  assert.match(mother, /class="spectrum-marker" style="left:35%"/);
  assert.match(mother, /65% indica · 35% sativa/);
  assert.match(mother, /aria-label="4 of 5"><i class="on"><\/i><i class="on"><\/i><i class="on"><\/i><i class="on"><\/i><i><\/i><\/span><span class="trait-value">Fast/);
  assert.match(mother, /<span>Smell in veg<\/span><\/dt><dd>Pine and lemon peel/);
  assert.doesNotMatch(read('seed-stash/f1-lot-001/index.html'), /% indica/, 'a genotype word does not invent percentages');
  assert.match(read('grow-reports/sample-grow-run-1/index.html'), /<p class="label">Details<\/p>/);
});
