#!/usr/bin/env node
// Static site generator: content/*.md + theme/ + site.json -> dist/
//
//   node build.js            production build (drafts and future posts hidden)
//   node build.js --drafts   include drafts and scheduled posts (local preview)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import {
  parseDocument, splitTags, excerpt, readingTime, markdownToText,
  normalizeDate, today, escapeHtml as esc, slugify,
} from './lib/content.js';
import { createMarkdown, rewriteRootUrls } from './lib/markdown.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const at = (...p) => path.join(ROOT, ...p);

const RESERVED = new Set(['index', 'archive', '404', 'feed', 'sitemap', 'robots', 'search', 'admin', 'posts', 'assets', 'media']);

const DEFAULTS = {
  title: 'My Blog',
  description: '',
  url: '',
  language: 'en',
  author: '',
  prompt: { command: 'cd', path: '~' },
  homePosts: 10,
  feedPosts: 20,
  nav: [],
  dock: null,
  footer: '© {year} · Powered by 🥝 Kiwi Blog',
  repo: { owner: '', name: '', branch: 'main' },
};

export async function build({ drafts = false, out = at('dist'), quiet = false } = {}) {
  const started = Date.now();
  const log = (...a) => quiet || console.log(...a);

  // ---- config ------------------------------------------------------------
  let config;
  try {
    config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(at('site.json'), 'utf8')) };
  } catch (err) {
    throw new Error(`site.json is not valid JSON: ${err.message}`);
  }
  config.prompt = { ...DEFAULTS.prompt, ...config.prompt };
  config.repo = { ...DEFAULTS.repo, ...config.repo };
  const siteUrl = String(config.url || '').replace(/\/+$/, '');
  const basePath = siteUrl ? new URL(siteUrl + '/').pathname : '/';
  const absUrl = (p) => (siteUrl ? siteUrl + p : p);
  const year = String(new Date().getFullYear());

  const dateFmt = new Intl.DateTimeFormat(config.language, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const dayFmt = new Intl.DateTimeFormat(config.language, { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const formatDate = (d, fmt = dateFmt) => (d ? fmt.format(new Date(`${d}T00:00:00Z`)) : '');

  const render = createMarkdown(Marked, {
    highlight(code, lang) {
      if (!lang || !hljs.getLanguage(lang)) return null;
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    },
  });

  // ---- content -------------------------------------------------------------
  const readDir = (dir) =>
    fs.existsSync(at(dir))
      ? fs.readdirSync(at(dir)).filter((f) => f.endsWith('.md')).sort().map((f) => ({
          slug: f.slice(0, -3),
          ...parseDocument(fs.readFileSync(at(dir, f), 'utf8')),
        }))
      : [];

  const now = today();
  const warnings = [];

  const allPosts = readDir('content/posts').map(({ slug, data, body }) => {
    if (slug !== slugify(slug)) warnings.push(`content/posts/${slug}.md: file name is not URL-friendly (expected "${slugify(slug)}.md")`);
    const date = normalizeDate(data.date);
    if (!date) warnings.push(`content/posts/${slug}.md: missing or invalid "date" (use YYYY-MM-DD)`);
    return {
      slug,
      title: String(data.title || slug),
      date,
      tags: splitTags(data.tags),
      description: String(data.description || excerpt(body)),
      draft: data.draft === true,
      scheduled: Boolean(date && date > now),
      body,
      readingTime: readingTime(body),
      url: `/posts/${slug}/`,
    };
  });

  const posts = allPosts
    .filter((p) => drafts || (!p.draft && !p.scheduled))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  for (const p of posts) Object.assign(p, render(p.body));

  const pages = readDir('content/pages')
    .map(({ slug, data, body }) => ({
      slug,
      title: String(data.title || slug),
      description: String(data.description || excerpt(body)),
      menu: data.menu === true,
      order: Number(data.order) || 0,
      draft: data.draft === true,
      body,
      url: `/${slug}.html`,
    }))
    .filter((p) => drafts || !p.draft);
  for (const p of pages) {
    if (RESERVED.has(p.slug)) throw new Error(`content/pages/${p.slug}.md: "${p.slug}" is reserved, please rename the page`);
    Object.assign(p, render(p.body));
  }

  const readRaw = (file) => (fs.existsSync(at(file)) ? render(fs.readFileSync(at(file), 'utf8')).html : '');
  const homeHtml = readRaw('content/home.md');
  const pinnedHtml = readRaw('content/pinned.md');

  const tagCounts = new Map();
  for (const p of posts) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const allTags = [...tagCounts.keys()].sort();

  // ---- output helpers ------------------------------------------------------
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const write = (rel, data) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };

  if (fs.existsSync(at('public'))) fs.cpSync(at('public'), out, { recursive: true });

  const css = fs.readFileSync(at('theme/style.css'));
  const js = fs.readFileSync(at('theme/site.js'));
  const version = crypto.createHash('sha1').update(css).update(js).digest('hex').slice(0, 8);
  write('assets/style.css', css);
  write('assets/site.js', js);

  const layout = fs.readFileSync(at('theme/layout.html'), 'utf8');

  const navItems = [
    { label: 'Home', url: '/' },
    { label: 'Archive', url: '/archive.html' },
    ...pages.filter((p) => p.menu).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map((p) => ({ label: p.title, url: p.url })),
    ...(Array.isArray(config.nav) ? config.nav : []),
  ];

  const dockHtml = config.dock && Array.isArray(config.dock.links) && config.dock.links.length
    ? `  <div class="service-dock">
    <div class="dock-content">
      ${config.dock.label ? `<span class="dock-label">${esc(config.dock.label)}</span>` : ''}
      ${config.dock.links.map((l) => `<a href="${esc(l.url)}" class="dock-item"${l.title ? ` title="${esc(l.title)}"` : ''}>${esc(l.label)}</a>`).join('\n      ')}
    </div>
  </div>`
    : '';

  const tagChips = (tags) =>
    tags.length ? `<div class="post-tags">${tags.map((t) => `<a class="tag-chip" href="/archive.html?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : '';

  const statusBadge = (p) =>
    p.draft ? ' <span class="badge badge-draft">draft</span>' : p.scheduled ? ' <span class="badge badge-draft">scheduled</span>' : '';

  const postMeta = (p) =>
    `<div class="post-meta">${p.date ? `<time datetime="${p.date}">${formatDate(p.date)}</time> · ` : ''}${p.readingTime} min read${statusBadge(p)}</div>`;

  const sidebar = (title, items) => `    <button class="post-nav-toggle" id="postNavToggle" aria-label="Toggle sidebar" aria-expanded="false" aria-controls="postNav">📑</button>
    <aside class="post-nav" id="postNav">
      <div class="post-nav-header"><span class="post-nav-title">${title}</span></div>
      <nav class="post-nav-list" id="postNavList">
        ${items.join('\n        ')}
      </nav>
    </aside>`;

  const postsSidebar = (current) =>
    sidebar('📑 Posts', posts.map((p) => `<a href="${p.url}" class="post-nav-item${p === current ? ' active' : ''}" data-target="card-${p.slug}"${p === current ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`));

  function renderPage(rel, { title, description = config.description, content, sidebarHtml = '', bodyClass = '', promptSuffix = '', urlPath, meta = [], root }) {
    const depth = rel.split('/').length - 1;
    const pageRoot = root ?? (depth ? '../'.repeat(depth) : './');
    const menu = navItems
      .map((n) => `          <li><a href="${esc(n.url)}"${n.url === urlPath ? ' class="active" aria-current="page"' : ''}>${esc(n.label)}</a></li>`)
      .join('\n');
    const footerLinks = navItems.map((n) => `<a href="${esc(n.url)}">${esc(n.label)}</a>`).join(' | ');
    const metaTags = [
      ['og:site_name', config.title],
      ['og:title', title || config.title],
      ['og:description', description],
      ...(siteUrl && urlPath ? [['og:url', absUrl(urlPath)]] : []),
      ...meta,
    ].map(([k, v]) => `  <meta property="${k}" content="${esc(v)}">`);
    metaTags.push('  <meta name="twitter:card" content="summary">');
    if (siteUrl && urlPath) metaTags.push(`  <link rel="canonical" href="${esc(absUrl(urlPath))}">`);

    const vars = {
      lang: esc(config.language),
      pageTitle: esc(title ? `${title} · ${config.title}` : config.title),
      siteTitle: esc(config.title),
      description: esc(description),
      meta: metaTags.join('\n'),
      version,
      bodyClass,
      promptCommand: esc(config.prompt.command),
      promptPath: esc(config.prompt.path + promptSuffix),
      menu,
      sidebar: sidebarHtml,
      content,
      dock: dockHtml,
      footerLinks,
      footer: String(config.footer || '').replace(/\{year\}/g, year),
    };
    const html = layout.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    write(rel, rewriteRootUrls(html, pageRoot));
  }

  // ---- home ----------------------------------------------------------------
  const card = (p) => `<article class="post-card" id="card-${p.slug}" data-tags="${esc(p.tags.join(' '))}">
  ${postMeta(p)}
  <h3 class="post-card-title"><a href="${p.url}">${esc(p.title)}</a></h3>
  <p class="post-card-excerpt">${esc(p.description)}</p>
  ${tagChips(p.tags)}
</article>`;

  const homePosts = config.homePosts > 0 ? posts.slice(0, config.homePosts) : posts;
  renderPage('index.html', {
    urlPath: '/',
    bodyClass: 'page-home',
    sidebarHtml: posts.length ? postsSidebar() : '',
    content: `${homeHtml ? `<section class="intro">\n${homeHtml}</section>` : ''}
${pinnedHtml ? `<div class="pinned-post">\n${pinnedHtml}</div>` : ''}
<section class="latest" aria-labelledby="latest-title">
  <div class="section-head">
    <h2 id="latest-title">Latest posts</h2>
    <a href="/archive.html" class="section-link">All ${posts.length} posts →</a>
  </div>
  <div class="post-list">
${homePosts.map(card).join('\n') || '<p class="empty">No posts yet.</p>'}
  </div>
</section>
<script type="application/json" id="legacySlugs">${JSON.stringify(posts.map((p) => p.slug))}</script>`,
  });

  // ---- posts ---------------------------------------------------------------
  posts.forEach((p, i) => {
    const newer = posts[i - 1];
    const older = posts[i + 1];
    const toc = p.toc.length >= 2
      ? sidebar('📑 Contents', p.toc.map((h) => `<a href="#${h.id}" class="post-nav-item toc-depth-${h.depth}" data-target="${h.id}">${esc(h.text)}</a>`))
      : postsSidebar(p);
    renderPage(`posts/${p.slug}/index.html`, {
      title: p.title,
      description: p.description,
      urlPath: p.url,
      bodyClass: 'page-post',
      promptSuffix: `/posts/${p.slug}`,
      sidebarHtml: toc,
      meta: [
        ['og:type', 'article'],
        ...(p.date ? [['article:published_time', p.date]] : []),
        ...p.tags.map((t) => ['article:tag', t]),
      ],
      content: `<article class="post" data-tags="${esc(p.tags.join(' '))}">
  <header class="post-header">
    <h1 class="post-title">${esc(p.title)}</h1>
    ${postMeta(p)}
    ${tagChips(p.tags)}
  </header>
  <div class="post-body">
${p.html}
  </div>
</article>
<nav class="post-pager" aria-label="More posts">
  ${older ? `<a class="pager-prev" href="${older.url}"><span>← Older</span><strong>${esc(older.title)}</strong></a>` : '<span></span>'}
  ${newer ? `<a class="pager-next" href="${newer.url}"><span>Newer →</span><strong>${esc(newer.title)}</strong></a>` : '<span></span>'}
</nav>`,
    });
  });

  // ---- archive -------------------------------------------------------------
  const years = new Map();
  for (const p of posts) {
    const y = p.date ? p.date.slice(0, 4) : 'Undated';
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(p);
  }
  const plural = (n) => (n === 1 ? '1 post' : `${n} posts`);
  renderPage('archive.html', {
    title: 'Archive',
    description: `All posts on ${config.title}, by year and tag.`,
    urlPath: '/archive.html',
    bodyClass: 'page-archive',
    promptSuffix: '/archive',
    content: `<div class="archive-header">
  <h1>📁 Blog Archive</h1>
  <p class="archive-description">All ${plural(posts.length)}, organized by year. Filter by tag or search the full text.</p>
  <div class="search-box">
    <input type="search" id="archiveSearch" placeholder="Search posts…" aria-label="Search posts" autocomplete="off">
  </div>
</div>
<div class="tag-filter">
  <div class="tag-filter-header"><span class="tag-filter-title">🏷️ Filter by Tag</span></div>
  <div class="tag-filter-buttons">
    <button class="tag-btn active" data-tag="all" aria-pressed="true">All</button>
    ${allTags.map((t) => `<button class="tag-btn" data-tag="${esc(t)}" aria-pressed="false">${esc(t)} <span class="tag-count">${tagCounts.get(t)}</span></button>`).join('\n    ')}
  </div>
</div>
<div class="archive-content">
${[...years].map(([y, list]) => `<div class="archive-year">
  <div class="year-header">
    <h2 class="year-title">${y}</h2>
    <span class="post-count">${plural(list.length)}</span>
  </div>
  <div class="posts-grid">
${list.map((p) => `    <a href="${p.url}" class="archive-post-link" data-slug="${p.slug}" data-tags="${esc(p.tags.join(' '))}">
      <article class="archive-post">
        <div class="post-meta">
          <span class="post-date">${p.date ? formatDate(p.date, dayFmt) : ''}</span>${statusBadge(p)}
          ${p.tags.length ? `<span class="post-tags">${p.tags.map((t) => `<span class="archive-tag">${esc(t)}</span>`).join('')}</span>` : ''}
        </div>
        <h3 class="post-title">${esc(p.title)}</h3>
        <p class="post-preview">${esc(p.description)}</p>
      </article>
    </a>`).join('\n')}
  </div>
</div>`).join('\n')}
<p class="empty archive-empty" hidden>No posts match your filter.</p>
</div>`,
  });

  write('search.json', JSON.stringify(posts.map((p) => ({
    s: p.slug,
    t: `${p.title} ${p.tags.join(' ')} ${p.description} ${markdownToText(p.body)}`.toLowerCase().replace(/\s+/g, ' '),
  }))));

  // ---- pages ---------------------------------------------------------------
  for (const p of pages) {
    renderPage(`${p.slug}.html`, {
      title: p.title,
      description: p.description,
      urlPath: p.url,
      bodyClass: `page-${p.slug}`,
      promptSuffix: `/${p.slug}`,
      content: `<article class="page">\n${p.html}</article>`,
    });
  }

  // ---- 404 (served from any depth, so links are absolute) -------------------
  renderPage('404.html', {
    title: 'Not found',
    root: basePath,
    bodyClass: 'page-404',
    promptSuffix: '/404',
    content: `<div class="not-found">
  <pre class="terminal"><code>$ cd <span id="missingPath">this-page</span>
bash: cd: no such file or directory</code></pre>
  <h1>404 · Page not found</h1>
  <p>The page you are looking for doesn't exist (anymore). Try the <a href="/">home page</a> or the <a href="/archive.html">archive</a>.</p>
</div>`,
  });

  // ---- feed, sitemap, robots ----------------------------------------------
  const xml = (s) => esc(s).replace(/&#39;/g, '&apos;');
  const rfc822 = (d) => new Date(`${d || now}T00:00:00Z`).toUTCString();
  if (siteUrl) {
    const feedPosts = posts.filter((p) => !p.draft && !p.scheduled).slice(0, config.feedPosts);
    write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${xml(config.title)}</title>
  <link>${xml(siteUrl)}/</link>
  <description>${xml(config.description)}</description>
  <language>${xml(config.language)}</language>
  <atom:link href="${xml(absUrl('/feed.xml'))}" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedPosts.map((p) => `  <item>
    <title>${xml(p.title)}</title>
    <link>${xml(absUrl(p.url))}</link>
    <guid isPermaLink="true">${xml(absUrl(p.url))}</guid>
    <pubDate>${rfc822(p.date)}</pubDate>
${p.tags.map((t) => `    <category>${xml(t)}</category>`).join('\n')}
    <description>${xml(p.description)}</description>
    <content:encoded><![CDATA[${rewriteRootUrls(p.html, `${siteUrl}/`).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
  </item>`).join('\n')}
</channel>
</rss>
`);
    const urls = [
      { loc: '/', lastmod: posts[0]?.date },
      { loc: '/archive.html', lastmod: posts[0]?.date },
      ...pages.map((p) => ({ loc: p.url })),
      ...posts.filter((p) => !p.draft && !p.scheduled).map((p) => ({ loc: p.url, lastmod: p.date })),
    ];
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(absUrl(u.loc))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
  } else {
    warnings.push('site.json: "url" is empty, so feed.xml and sitemap.xml were skipped');
  }
  write('robots.txt', `User-agent: *\nDisallow: ${basePath}admin/\n${siteUrl ? `Sitemap: ${absUrl('/sitemap.xml')}\n` : ''}`);

  // ---- admin ---------------------------------------------------------------
  fs.cpSync(at('admin'), path.join(out, 'admin'), { recursive: true });
  for (const f of ['content.js', 'markdown.js']) write(`admin/lib/${f}`, fs.readFileSync(at('lib', f)));
  write('admin/vendor/marked.esm.js', fs.readFileSync(at('node_modules/marked/lib/marked.esm.js'), 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, ''));
  write('admin/config.json', JSON.stringify({
    siteTitle: config.title,
    siteUrl,
    owner: config.repo.owner,
    repo: config.repo.name,
    branch: config.repo.branch || 'main',
    apiBase: config.repo.apiBase || 'https://api.github.com',
    version,
  }, null, 2));

  // ---- done ----------------------------------------------------------------
  for (const w of warnings) log(`⚠️  ${w}`);
  const hidden = allPosts.length - posts.length;
  log(`✅ Built ${posts.length} posts, ${pages.length} pages${hidden ? ` (${hidden} draft/scheduled hidden)` : ''} in ${Date.now() - started} ms → ${path.relative(process.cwd(), out) || '.'}`);
  return { posts, pages, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ drafts: process.argv.includes('--drafts') }).catch((err) => {
    console.error(`❌ Build failed: ${err.message}`);
    process.exit(1);
  });
}
