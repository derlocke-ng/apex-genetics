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
  for (const p of result.posts) assert.ok(fs.existsSync(path.join(out, 'posts', p.slug, 'index.html')), `missing post ${p.slug}`);
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
