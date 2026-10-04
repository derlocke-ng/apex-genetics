// derlocke.net front-end: theme, menu, sidebar, archive filtering, small niceties.
// No dependencies; everything degrades gracefully without JavaScript.

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ---- Legacy links: index.html#post-slug -> posts/post-slug/ ---------------
  function redirectLegacyHash() {
    const slugs = $('#legacySlugs');
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!slugs || !hash || document.getElementById(hash)) return;
    try {
      if (JSON.parse(slugs.textContent).includes(hash)) location.replace(`posts/${hash}/`);
    } catch { /* ignore */ }
  }

  // ---- Dark / light mode ----------------------------------------------------
  function initTheme() {
    const btn = $('#darkModeToggle');
    const meta = $('meta[name="theme-color"]');
    const apply = (dark) => {
      document.documentElement.classList.toggle('light', !dark);
      if (meta) meta.setAttribute('content', dark ? '#1a1a1a' : '#f5f5f5');
      if (btn) {
        btn.textContent = dark ? '☀️' : '🌙';
        btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
      }
    };
    apply(store.get('derlocke-darkMode') !== 'false');
    btn?.addEventListener('click', () => {
      const dark = document.documentElement.classList.contains('light');
      apply(dark);
      store.set('derlocke-darkMode', String(dark));
    });
  }

  // ---- Dropdown menu --------------------------------------------------------
  function initMenu() {
    const toggle = $('.menu-toggle');
    const dropdown = $('.menu-dropdown');
    if (!toggle || !dropdown) return;
    const set = (open) => {
      dropdown.classList.toggle('active', open);
      toggle.textContent = open ? '✕' : '☰';
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      set(!dropdown.classList.contains('active'));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-container')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') set(false);
    });
  }

  // ---- Sidebar: mobile toggle + scroll spy ------------------------------------
  function initSidebar() {
    const nav = $('#postNav');
    const list = $('#postNavList');
    const toggle = $('#postNavToggle');
    if (!nav || !list) return;

    const mobile = () => window.matchMedia('(max-width: 1200px)').matches;
    const setOpen = (open) => {
      nav.classList.toggle('open', open);
      if (toggle) {
        toggle.textContent = open ? '✕' : '📑';
        toggle.setAttribute('aria-expanded', String(open));
      }
    };
    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!nav.classList.contains('open'));
    });
    document.addEventListener('click', (e) => {
      if (mobile() && !e.target.closest('.post-nav')) setOpen(false);
    });

    list.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', link.getAttribute('href'));
      if (mobile()) setOpen(false);
    });

    const items = $$('.post-nav-item[data-target]', list).filter((a) => document.getElementById(a.dataset.target));
    if (!items.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(items.map((a) => [a.dataset.target, a]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const active = byId.get(entry.target.id);
        if (!active) continue;
        items.forEach((a) => a.classList.toggle('active', a === active));
        const box = list.getBoundingClientRect();
        const r = active.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) active.scrollIntoView({ block: 'nearest' });
      }
    }, { rootMargin: '-80px 0px -60% 0px' });
    byId.forEach((_, id) => observer.observe(document.getElementById(id)));
  }

  // ---- Archive: tag filter + full-text search --------------------------------
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
        if (count) count.textContent = n === 1 ? '1 post' : `${n} posts`;
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

  // ---- Code blocks: language label + copy button -------------------------------
  function initCodeBlocks() {
    $$('main pre > code').forEach((code) => {
      const pre = code.parentElement;
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
      pre.appendChild(btn);
    });
  }

  // ---- Heading anchors -------------------------------------------------------
  function initHeadingAnchors() {
    $$('.post-body :is(h2,h3,h4)[id], .page :is(h2,h3,h4)[id]').forEach((h) => {
      const a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = `#${h.id}`;
      a.setAttribute('aria-label', 'Link to this section');
      a.textContent = '#';
      h.appendChild(a);
    });
  }

  // ---- Reading progress (posts only) ------------------------------------------
  function initProgress() {
    const bar = $('.scroll-progress');
    if (!bar || !document.body.classList.contains('page-post')) return;
    let ticking = false;
    const update = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, el.scrollTop / max) : 0})`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function init404() {
    const el = $('#missingPath');
    if (el) el.textContent = decodeURIComponent(location.pathname);
  }

  redirectLegacyHash();
  const start = () => {
    for (const fn of [initTheme, initMenu, initSidebar, initArchive, initCodeBlocks, initHeadingAnchors, initProgress, init404]) {
      try { fn(); } catch (err) { console.error(err); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
