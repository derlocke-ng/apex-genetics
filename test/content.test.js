import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import {
  parseDocument, serializeDocument, slugify, excerpt, splitTags, normalizeDate, markdownToText,
} from '../lib/content.js';
import { createMarkdown, rewriteRootUrls } from '../lib/markdown.js';

test('front matter round-trips through serialize/parse', () => {
  const data = {
    title: 'Life Update: Why I "Started" This Blog',
    date: '2025-10-05',
    tags: ['personal', 'with, comma', 'true'],
    description: '# not a comment',
    draft: true,
    order: 3,
  };
  const body = '## Hello\n\nSome *text*.\n';
  const parsed = parseDocument(serializeDocument(data, body));
  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.body, body);
});

test('parses block lists and quoted scalars', () => {
  const { data, body } = parseDocument('---\ntitle: \'It\'\'s fine\'\ntags:\n  - a\n  - B c\nmenu: false\n---\nBody');
  assert.deepEqual(data, { title: "It's fine", tags: ['a', 'B c'], menu: false });
  assert.equal(body, 'Body');
});

test('understands legacy Kiwi Blog headers', () => {
  const { data, body } = parseDocument('# My Post\n\n**Date:** 2026-01-15\n**Tags:** linux, Tutorial\n\nFirst paragraph.\n');
  assert.deepEqual(data, { title: 'My Post', date: '2026-01-15', tags: ['linux', 'tutorial'] });
  assert.equal(body.trim(), 'First paragraph.');
});

test('slugify handles umlauts, accents and symbols', () => {
  assert.equal(slugify('Grüße aus Köln: Straße & Café!'), 'gruesse-aus-koeln-strasse-cafe');
  assert.equal(slugify('  --Hello   World-- '), 'hello-world');
  assert.equal(slugify('🚀'), '');
});

test('excerpt uses the first real paragraph or the <!--more--> marker', () => {
  assert.equal(excerpt('Short.\n\n## Heading\n\nThis is the first paragraph that is long enough to count.'), 'This is the first paragraph that is long enough to count.');
  assert.equal(excerpt('Intro **bold** [link](/x).\n\n<!--more-->\n\nRest'), 'Intro bold link.');
  assert.equal(excerpt('```bash\nrm -rf /\n```\n\nSafe text that follows the code block, long enough.'), 'Safe text that follows the code block, long enough.');
});

test('misc helpers', () => {
  assert.deepEqual(splitTags('Linux, #homelab, linux, , Home Lab'), ['linux', 'homelab', 'home-lab']);
  assert.equal(normalizeDate('2026-1-5'), '2026-01-05');
  assert.equal(normalizeDate('yesterday'), '');
  assert.equal(markdownToText('| a | b |\n|---|---|\n| 1 | 2 |').replace(/\s+/g, ' ').trim(), 'a b 1 2');
});

test('markdown renderer: ids, custom ids, toc, code, tables, lazy images', () => {
  const render = createMarkdown(Marked, { highlight: (code, lang) => (lang === 'x' ? '<b>hl</b>' : null) });
  const { html, toc } = render('## Kiwi Network {#kiwi}\n\n## Setup\n\n### Setup\n\n```x\ncode\n```\n\n```\n<raw>\n```\n\n| a |\n|---|\n| 1 |\n\n![alt](/media/a.png)');
  assert.match(html, /<h2 id="kiwi">Kiwi Network<\/h2>/);
  assert.match(html, /<h3 id="setup-1">Setup<\/h3>/);
  assert.deepEqual(toc.map((t) => t.id), ['kiwi', 'setup', 'setup-1']);
  assert.match(html, /<pre data-lang="x"><code class="hljs language-x"><b>hl<\/b><\/code><\/pre>/);
  assert.match(html, /&lt;raw&gt;/);
  assert.match(html, /<div class="table-wrap"><table>/);
  assert.match(html, /<img src="\/media\/a.png" alt="alt" loading="lazy"/);
  // State is reset between documents.
  assert.equal(render('## Setup').toc[0].id, 'setup');
});

test('rewriteRootUrls only touches site-absolute URLs', () => {
  const html = '<a href="/a">x</a><a href="//cdn/x">y</a><img src="/m.png"><a href="https://e.com/">z</a>';
  assert.equal(
    rewriteRootUrls(html, '../../'),
    '<a href="../../a">x</a><a href="//cdn/x">y</a><img src="../../m.png"><a href="https://e.com/">z</a>',
  );
});
