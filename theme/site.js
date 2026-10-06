// Apex Genetics front-end: theme, menu, library filtering, small niceties.
// No dependencies; everything degrades gracefully without JavaScript.

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ---- Dark / light mode ----------------------------------------------------
  function initTheme() {
    const btn = $('#themeToggle');
    const meta = $('meta[name="theme-color"]');
    const apply = (light) => {
      document.documentElement.classList.toggle('light', light);
      if (meta) meta.setAttribute('content', light ? meta.dataset.light : meta.dataset.dark);
      if (btn) btn.textContent = light ? '🌙' : '☀️';
    };
    apply(store.get('apex-light') === 'true');
    btn?.addEventListener('click', () => {
      const light = !document.documentElement.classList.contains('light');
      apply(light);
      store.set('apex-light', String(light));
    });
  }

  // ---- Mobile menu ----------------------------------------------------------
  function initMenu() {
    const toggle = $('.menu-toggle');
    const nav = $('#mainNav');
    if (!toggle || !nav) return;
    const set = (open) => {
      nav.classList.toggle('active', open);
      toggle.textContent = open ? '✕' : '☰';
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      set(!nav.classList.contains('active'));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.site-header')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') set(false);
    });
  }

  // ---- Library: section filter + full-text search ----------------------------
  function initArchive() {
    const buttons = $$('.tag-btn');
    const links = $$('.archive-post-link');
    if (!buttons.length || !links.length) return;
    const search = $('#archiveSearch');
    const empty = $('.archive-empty');
    const params = new URLSearchParams(location.search);
    let tag = params.get('tag') || 'all';
    let query = params.get('q') || '';
    let index = null;
    let loading = null;

    if (!buttons.some((b) => b.dataset.tag === tag)) tag = 'all';
    if (search) search.value = query;

    const loadIndex = () => {
      loading ??= fetch('search.json')
        .then((r) => r.json())
        .then((rows) => { index = new Map(rows.map((r) => [r.s, r.t])); })
        .catch(() => { index = new Map(); });
      return loading;
    };

    const apply = () => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      let visibleTotal = 0;
      buttons.forEach((b) => {
        const on = b.dataset.tag === tag;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      links.forEach((link) => {
        const tags = (link.dataset.tags || '').split(' ');
        const text = index?.get(link.dataset.slug) ?? link.textContent.toLowerCase();
        const show = (tag === 'all' || tags.includes(tag)) && words.every((w) => text.includes(w));
        link.classList.toggle('tag-hidden', !show);
        if (show) visibleTotal++;
      });
      $$('.archive-year').forEach((year) => {
        const n = $$('.archive-post-link:not(.tag-hidden)', year).length;
        const count = $('.post-count', year);
        if (count) count.textContent = n === 1 ? '1 entry' : `${n} entries`;
        year.classList.toggle('tag-hidden', n === 0);
      });
      if (empty) empty.hidden = visibleTotal > 0;

      const url = new URL(location.href);
      tag === 'all' ? url.searchParams.delete('tag') : url.searchParams.set('tag', tag);
      query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
      history.replaceState(null, '', url);
    };

    buttons.forEach((b) => b.addEventListener('click', () => {
      tag = b.dataset.tag;
      apply();
    }));
    search?.addEventListener('focus', loadIndex, { once: true });
    search?.addEventListener('input', () => {
      query = search.value.trim();
      if (index) apply();
      else loadIndex().then(apply);
    });
    if (query) loadIndex().then(apply);
    else apply();
  }

  // ---- Code blocks: copy button ----------------------------------------------
  function initCodeBlocks() {
    $$('main pre > code').forEach((code) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.innerText);
          btn.textContent = 'copied ✓';
        } catch {
          btn.textContent = 'failed';
        }
        setTimeout(() => { btn.textContent = 'copy'; }, 1600);
      });
      code.parentElement.appendChild(btn);
    });
  }

  // ---- Heading anchors -------------------------------------------------------
  function initHeadingAnchors() {
    $$('.prose :is(h2,h3,h4)[id]').forEach((h) => {
      const a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = `#${h.id}`;
      a.setAttribute('aria-label', 'Link to this section');
      a.textContent = '#';
      h.appendChild(a);
    });
  }

  function init404() {
    const el = $('#missingPath');
    if (el) el.textContent = decodeURIComponent(location.pathname);
  }

  const start = () => {
    for (const fn of [initTheme, initMenu, initArchive, initCodeBlocks, initHeadingAnchors, init404]) {
      try { fn(); } catch (err) { console.error(err); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
