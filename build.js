#!/usr/bin/env node
// Static site generator: content/*.md + design/ + theme/ + site.json -> dist/
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
import { createDesign } from './lib/design.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const at = (...p) => path.join(ROOT, ...p);

const RESERVED = new Set(['index', 'archive', '404', 'feed', 'sitemap', 'robots', 'search', 'admin', 'posts', 'assets', 'media']);

// Optional front matter shown as a "spec sheet" on an entry page.
const FACTS = [
  ['strain', 'Strain'], ['cross', 'Cross'], ['generation', 'Generation'], ['status', 'Status'],
  ['stage', 'Stage'], ['sex', 'Sex'], ['quantity', 'Quantity'], ['source', 'Source'],
  ['phenotype', 'Phenotype'], ['flowering', 'Flowering'], ['yield', 'Yield'],
];

const DEFAULTS = {
  title: 'My Site',
  description: '',
  url: '',
  language: 'en',
  author: '',
  design: { preset: 'apex' },
  hero: { eyebrow: '', title: '', text: '', cta: [] },
  sections: [{ key: 'entries', label: 'Entries', short: 'Entries', singular: 'Entry', icon: '🌱', blurb: '' }],
  homePosts: 6,
  feedPosts: 20,
  nav: [],
  footer: '© {year}',
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
  config.design = { ...DEFAULTS.design, ...config.design };
  config.hero = { ...DEFAULTS.hero, ...config.hero };
  const sections = (Array.isArray(config.sections) && config.sections.length ? config.sections : DEFAULTS.sections)
    .map((x) => ({ short: x.label, singular: x.label, icon: '🌱', blurb: '', ...x }));
  const sectionByKey = new Map(sections.map((x) => [x.key, x]));
  for (const x of sections) {
    if (x.key !== slugify(x.key) || RESERVED.has(x.key)) throw new Error(`site.json: section key "${x.key}" must be a URL-friendly name that is not reserved`);
  }
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
    const type = String(data.type || '');
    const section = sectionByKey.get(type) || sections[0];
    if (!sectionByKey.has(type)) warnings.push(`content/posts/${slug}.md: "type" is "${type}", expected one of ${sections.map((x) => x.key).join(', ')}; filed under ${section.key}`);
    return {
      slug,
      title: String(data.title || slug),
      date,
      tags: splitTags(data.tags),
      description: String(data.description || excerpt(body)),
      draft: data.draft === true,
      scheduled: Boolean(date && date > now),
      type,
      section,
      cross: data.cross ? String(data.cross) : '',
      facts: FACTS.filter(([k]) => data[k] !== undefined && data[k] !== '').map(([k, label]) => [label, String(data[k])]),
      status: data.status ? String(data.status) : '',
      body,
      readingTime: readingTime(body),
      url: `/${section.key}/${slug}/`,
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

  const postsBySection = new Map(sections.map((x) => [x.key, posts.filter((p) => p.section === x)]));
  const entryTags = (p) => [p.section.key, ...p.tags];

  // ---- output helpers ------------------------------------------------------
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const write = (rel, data) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };

  if (fs.existsSync(at('public'))) fs.cpSync(at('public'), out, { recursive: true });

  const design = createDesign(config.design);
  const css = `${design.css}${fs.readFileSync(at('design/base.css'), 'utf8')}\n${fs.readFileSync(at('theme/style.css'), 'utf8')}`;
  const js = fs.readFileSync(at('theme/site.js'));
  const version = crypto.createHash('sha1').update(css).update(js).digest('hex').slice(0, 8);
  write('assets/style.css', css);
  write('assets/site.js', js);

  const layout = fs.readFileSync(at('theme/layout.html'), 'utf8');

  const navItems = [
    ...sections.map((x) => ({ label: x.short, url: `/${x.key}/` })),
    ...pages.filter((p) => p.menu).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map((p) => ({ label: p.title, url: p.url })),
    ...(Array.isArray(config.nav) ? config.nav : []),
  ];

  const chips = (p, kind = true) => [
    ...(kind ? [`<span class="chip chip-accent">${esc(p.section.singular)}</span>`] : []),
    ...(p.status ? [`<span class="chip chip-ok">${esc(p.status)}</span>`] : []),
    ...p.tags.map((t) => `<span class="chip">${esc(t)}</span>`),
  ].join('');

  const statusBadge = (p) =>
    p.draft ? ' <span class="chip">draft</span>' : p.scheduled ? ' <span class="chip">scheduled</span>' : '';

  const entryMeta = (p) =>
    `<div class="entry-meta">${p.date ? `<time datetime="${p.date}">${formatDate(p.date)}</time> · ` : ''}${p.readingTime} min read${statusBadge(p)}</div>`;

  function renderPage(rel, { title, description = config.description, content, bodyClass = '', urlPath, meta = [], root }) {
    const depth = rel.split('/').length - 1;
    const pageRoot = root ?? (depth ? '../'.repeat(depth) : './');
    const isActive = (n) => urlPath && (n.url === urlPath || (n.url.endsWith('/') && urlPath.startsWith(n.url)));
    const menu = navItems
      .map((n) => `          <li><a href="${esc(n.url)}"${isActive(n) ? ' class="active" aria-current="page"' : ''}>${esc(n.label)}</a></li>`)
      .join('\n');
    const col = (title, items) => `<div class="footer-col"><h2>${esc(title)}</h2>${items.map((n) => `<a href="${esc(n.url)}">${esc(n.label)}</a>`).join('')}</div>`;
    const extraNav = navItems.filter((n) => !sections.some((x) => n.url === `/${x.key}/`));
    const footerLinks = [
      col('Explore', sections.map((x) => ({ label: x.short, url: `/${x.key}/` }))),
      col('Site', [{ label: 'Library', url: '/archive.html' }, ...extraNav]),
      col('Follow', [{ label: 'RSS feed', url: '/feed.xml' }]),
    ].join('');
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
      defaultMode: design.defaultMode,
      pageTitle: esc(title ? `${title} · ${config.title}` : config.title),
      siteTitle: esc(config.title),
      description: esc(description),
      meta: metaTags.join('\n'),
      fontsUrl: esc(design.fontsUrl),
      themeColor: esc(design.themeColor.dark),
      themeColorLight: esc(design.themeColor.light),
      version,
      bodyClass,
      brandIcon: esc(config.brandIcon || '🌿'),
      menu,
      content,
      footerLinks,
      footer: String(config.footer || '').replace(/\{year\}/g, year),
    };
    const html = layout.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    write(rel, rewriteRootUrls(html, pageRoot));
  }

  // ---- cards -----------------------------------------------------------------
  const card = (p) => `<a class="card entry-card" href="${p.url}" data-tags="${esc(entryTags(p).join(' '))}">
  <div class="card-thumb"><span class="card-icon" aria-hidden="true">${esc(p.section.icon)}</span><span class="card-kind">${esc(p.section.singular)}</span></div>
  <div class="card-body">
    <h3>${esc(p.title)}</h3>
    <div class="chips">${chips(p, false)}</div>
    ${p.cross ? `<p class="card-cross">${esc(p.cross)}</p>` : `<p class="card-text">${esc(p.description)}</p>`}
    ${entryMeta(p)}
    <span class="view-btn">View ${esc(p.section.singular.toLowerCase())}</span>
  </div>
</a>`;

  // ---- home ----------------------------------------------------------------
  const homePosts = config.homePosts > 0 ? posts.slice(0, config.homePosts) : posts;
  const hero = config.hero;
  renderPage('index.html', {
    urlPath: '/',
    bodyClass: 'page-home',
    content: `<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      ${hero.eyebrow ? `<p class="eyebrow">${esc(hero.eyebrow)}</p>` : ''}
      <h1>${esc(hero.title || config.title)}</h1>
      ${hero.text ? `<p class="hero-text">${esc(hero.text)}</p>` : ''}
      <div class="hero-cta">
        ${(hero.cta || []).map((b, i) => `<a class="btn${i ? ' btn-ghost' : ''}" href="${esc(b.url)}">${esc(b.label)}</a>`).join('\n        ')}
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <span class="hero-art-icon">${esc(config.brandIcon || '🌿')}</span>
      <span class="hero-art-count">${posts.length}</span>
      <span class="hero-art-label">entries in the library</span>
    </div>
  </div>
</section>
${hero.banner ? `<div class="promo-banner"><div class="container"><p>${esc(hero.banner)}</p></div></div>` : ''}
${pinnedHtml ? `<div class="container"><aside class="pinned">\n${pinnedHtml}</aside></div>` : ''}
<section class="block container" aria-labelledby="sections-title">
  <div class="section-head section-head-center">
    <div><p class="eyebrow eyebrow-plain">${esc(config.title)}</p>
    <h2 id="sections-title">The breeding program</h2></div>
  </div>
  <div class="tile-grid">
${sections.map((x) => `    <a class="card tile" href="/${x.key}/">
      <span class="tile-icon" aria-hidden="true">${esc(x.icon)}</span>
      <h3>${esc(x.label)}</h3>
      <p>${esc(x.blurb)}</p>
      <span class="tile-count">${postsBySection.get(x.key).length} ${postsBySection.get(x.key).length === 1 ? 'entry' : 'entries'} →</span>
    </a>`).join('\n')}
  </div>
</section>
<section class="block container" aria-labelledby="latest-title">
  <div class="section-head section-head-rule">
    <div><p class="eyebrow eyebrow-marker">Live breeding journal</p><h2 id="latest-title">Latest updates</h2></div>
    <a href="/archive.html" class="btn btn-ghost">Browse the library →</a>
  </div>
  <div class="card-grid">
${homePosts.map(card).join('\n') || '<p class="empty">Nothing here yet.</p>'}
  </div>
</section>
${homeHtml ? `<section class="block container about"><div class="prose">\n${homeHtml}</div></section>` : ''}`,
  });

  // ---- sections ------------------------------------------------------------
  for (const x of sections) {
    const list = postsBySection.get(x.key);
    renderPage(`${x.key}/index.html`, {
      title: x.label,
      description: x.blurb || config.description,
      urlPath: `/${x.key}/`,
      bodyClass: 'page-section',
      content: `<header class="page-hero">
  <div class="container">
    <p class="eyebrow">${esc(x.icon)} ${esc(config.title)}</p>
    <h1>${esc(x.label)}</h1>
    ${x.blurb ? `<p class="hero-text">${esc(x.blurb)}</p>` : ''}
  </div>
</header>
<div class="container block">
  <div class="card-grid">
${list.map(card).join('\n') || `<p class="empty">No ${esc(x.label.toLowerCase())} yet. Check back soon.</p>`}
  </div>
</div>`,
    });
  }

  // ---- entries ---------------------------------------------------------------
  posts.forEach((p) => {
    const siblings = postsBySection.get(p.section.key);
    const toc = p.toc.length >= 3
      ? `<details class="toc card"><summary>On this page</summary><nav>${p.toc.map((h) => `<a href="#${h.id}" class="toc-depth-${h.depth}">${esc(h.text)}</a>`).join('')}</nav></details>`
      : '';
    const related = siblings.filter((x) => x !== p).slice(0, 3);
    const metaRows = [
      ['Category', `<a href="/${p.section.key}/">${esc(p.section.label)}</a>`],
      ...(p.tags.length ? [['Tags', p.tags.map((t) => esc(t)).join(', ')]] : []),
      ...(p.date ? [['Published', `<time datetime="${p.date}">${formatDate(p.date)}</time>`]] : []),
      ['Reading time', `${p.readingTime} min`],
    ];
    renderPage(`${p.section.key}/${p.slug}/index.html`, {
      title: p.title,
      description: p.description,
      urlPath: p.url,
      bodyClass: 'page-entry',
      meta: [
        ['og:type', 'article'],
        ...(p.date ? [['article:published_time', p.date]] : []),
        ...p.tags.map((t) => ['article:tag', t]),
      ],
      content: `<nav class="breadcrumb container" aria-label="Breadcrumb">
  <a href="/">Home</a><span aria-hidden="true">/</span><a href="/${p.section.key}/">${esc(p.section.label)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.title)}</span>
</nav>
<article class="entry">
  <div class="container product">
    <div class="product-media">
      <div class="specimen">
        <span class="specimen-icon" aria-hidden="true">${esc(p.section.icon)}</span>
        <span class="specimen-kind">${esc(p.section.singular)}</span>
        ${p.facts.length ? `<span class="specimen-name">${esc(p.facts[0][1])}</span>` : ''}
        ${p.status ? `<span class="specimen-status">${esc(p.status)}</span>` : ''}
      </div>
    </div>
    <div class="product-summary">
      <p class="eyebrow eyebrow-marker"><a href="/${p.section.key}/">${esc(p.section.label)}</a></p>
      <h1>${esc(p.title)}</h1>
      <div class="chips">${chips(p, false)}</div>
      ${p.cross ? `<p class="product-cross">${esc(p.cross)}</p>` : ''}
      <p class="product-lede">${esc(p.description)}</p>
${p.facts.length ? `      <dl class="spec">\n${p.facts.map(([k, v]) => `        <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}\n      </dl>` : ''}
      <div class="product-actions">
        <a class="btn" href="#details">Read the details</a>
        <a class="btn btn-ghost" href="/${p.section.key}/">All ${esc(p.section.short.toLowerCase())}</a>
      </div>
      <dl class="product-meta">
${metaRows.map(([k, v]) => `        <div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n')}
      </dl>
    </div>
  </div>
  <div class="container block entry-layout" id="details">
    <h2 class="tab-title">Description</h2>
    ${toc}
    <div class="prose entry-body">
${p.html}
    </div>
  </div>
</article>
${related.length ? `<section class="block container related" aria-labelledby="related-title">
  <div class="section-head section-head-rule"><h2 id="related-title">More ${esc(p.section.short.toLowerCase())}</h2></div>
  <div class="card-grid">
${related.map(card).join('\n')}
  </div>
</section>` : ''}`,
    });
  });

  // ---- library (all entries, filter + search) ----------------------------------
  const years = new Map();
  for (const p of posts) {
    const y = p.date ? p.date.slice(0, 4) : 'Undated';
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(p);
  }
  const plural = (n) => (n === 1 ? '1 entry' : `${n} entries`);
  renderPage('archive.html', {
    title: 'Library',
    description: `Every challenge, tutorial, report, plan and plant on ${config.title}.`,
    urlPath: '/archive.html',
    bodyClass: 'page-archive',
    content: `<header class="page-hero">
  <div class="container">
    <p class="eyebrow">📚 Library</p>
    <h1>Everything in one place</h1>
    <p class="hero-text">${plural(posts.length)}. Filter by section or search the full text.</p>
    <div class="search-box"><input type="search" id="archiveSearch" placeholder="Search strains, crosses, tutorials…" aria-label="Search" autocomplete="off"></div>
  </div>
</header>
<div class="container block">
  <div class="tag-filter-buttons">
    <button class="tag-btn active" data-tag="all" aria-pressed="true">All</button>
    ${sections.map((x) => `<button class="tag-btn" data-tag="${esc(x.key)}" aria-pressed="false">${esc(x.icon)} ${esc(x.short)} <span class="tag-count">${postsBySection.get(x.key).length}</span></button>`).join('\n    ')}
  </div>
  <div class="archive-content">
${[...years].map(([y, list]) => `<div class="archive-year">
  <div class="year-header"><h2 class="year-title">${y}</h2><span class="post-count">${plural(list.length)}</span></div>
  <div class="card-grid">
${list.map((p) => card(p).replace('class="card entry-card"', `class="card entry-card archive-post-link" data-slug="${p.section.key}/${p.slug}"`)).join('\n')}
  </div>
</div>`).join('\n')}
<p class="empty archive-empty" hidden>Nothing matches your filter.</p>
  </div>
</div>`,
  });

  write('search.json', JSON.stringify(posts.map((p) => ({
    s: `${p.section.key}/${p.slug}`,
    t: `${p.title} ${p.section.label} ${p.tags.join(' ')} ${p.facts.map(([, v]) => v).join(' ')} ${p.description} ${markdownToText(p.body)}`.toLowerCase().replace(/\s+/g, ' '),
  }))));

  // ---- pages ---------------------------------------------------------------
  for (const p of pages) {
    renderPage(`${p.slug}.html`, {
      title: p.title,
      description: p.description,
      urlPath: p.url,
      bodyClass: `page-${p.slug}`,
      content: `<div class="container block"><article class="prose page">\n${p.html}</article></div>`,
    });
  }

  // ---- 404 (served from any depth, so links are absolute) -------------------
  renderPage('404.html', {
    title: 'Not found',
    root: basePath,
    bodyClass: 'page-404',
    content: `<div class="container block not-found">
  <p class="eyebrow">404</p>
  <h1>This plant didn't make it</h1>
  <p>We couldn't find <code id="missingPath">that page</code>. Head back to the <a href="/">home page</a> or browse the <a href="/archive.html">library</a>.</p>
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
      ...sections.map((x) => ({ loc: `/${x.key}/` })),
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
  for (const f of ['content.js', 'markdown.js', 'vault.js']) write(`admin/lib/${f}`, fs.readFileSync(at('lib', f)));
  write('admin/vendor/marked.esm.js', fs.readFileSync(at('node_modules/marked/lib/marked.esm.js'), 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, ''));
  write('admin/config.json', JSON.stringify({
    siteTitle: config.title,
    siteUrl,
    fontsUrl: design.fontsUrl,
    defaultMode: design.defaultMode,
    sections: sections.map(({ key, label, icon }) => ({ key, label, icon })),
    owner: config.repo.owner,
    repo: config.repo.name,
    branch: config.repo.branch || 'main',
    apiBase: config.repo.apiBase || 'https://api.github.com',
    version,
    // Password-encrypted token (see `npm run vault`); null if not set up.
    vault: fs.existsSync(at('admin/vault.json')) ? JSON.parse(fs.readFileSync(at('admin/vault.json'), 'utf8')) : null,
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
