// Kiwi Blog admin: write, edit and delete content straight in the GitHub repo.
// Every save is a commit; the deploy workflow rebuilds the site afterwards.

import { GitHub, bytesToBase64 } from './github.js';
import {
  parseDocument, serializeDocument, splitTags, slugify, normalizeDate, today,
  escapeHtml as h, readingTime, wordCount,
} from './lib/content.js';
import { createMarkdown, rewriteRootUrls } from './lib/markdown.js';
import { Marked } from './vendor/marked.esm.js';
import {
  sealVault, openVault, WrongPasswordError, passwordProblems, generatePassword, DEFAULT_ITERATIONS,
} from './lib/vault.js';

const PATHS = {
  posts: 'content/posts/',
  pages: 'content/pages/',
  media: 'public/media/',
  home: 'content/home.md',
  pinned: 'content/pinned.md',
  config: 'site.json',
  vault: 'admin/vault.json',
};
const RAW_LABELS = { [PATHS.home]: 'Home intro', [PATHS.pinned]: 'Pinned notice' };
const RESERVED = new Set(['index', 'archive', '404', 'feed', 'sitemap', 'robots', 'search', 'admin', 'posts', 'assets', 'media']);
const SESSION_KEY = 'kb-admin-session';
const DRAFT_PREFIX = 'kb-draft:';
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

const render = createMarkdown(Marked);
const siteBase = new URL('../', location.href).href;
const app = document.getElementById('app');

let config = {};
let vault = null; // encrypted token from vault.json, if a password is set up
let gh = null;
let user = null;
let snap = null; // { headSha, files: Map<path, {sha, size}>, truncated }
const docs = new Map(); // path -> doc
const sessionMedia = new Map(); // "/media/..." -> data URL, for uploads not deployed yet
let dirty = false;
let cleanup = [];
let deploy = null;
let deployTimer = null;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
const enc = encodeURIComponent;

function storage(kind) {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}

function toast(message, type = 'info', timeout = 4500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

function setDirty(value) {
  dirty = value;
  document.title = `${value ? '• ' : ''}Admin · ${config.siteTitle || 'Blog'}`;
}

function onCleanup(fn) {
  cleanup.push(fn);
}

function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  onCleanup(() => target.removeEventListener(type, fn, opts));
}

const sectionOf = (type) => (config.sections || []).find((x) => x.key === type) || (config.sections || [])[0] || { key: 'posts', label: 'Entries' };

const kb = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function liveUrl(doc) {
  if (doc.kind === 'post') return `${siteBase}${sectionOf(doc.data.type).key}/${doc.slug}/`;
  if (doc.kind === 'page') return `${siteBase}${doc.slug}.html`;
  return siteBase;
}

function postStatus(data) {
  if (data.draft === true) return 'draft';
  const date = normalizeDate(data.date);
  if (date && date > today()) return 'scheduled';
  return 'published';
}

// ---------------------------------------------------------------------------
// Session & data
// ---------------------------------------------------------------------------

function loadSession() {
  for (const kind of ['session', 'local']) {
    try {
      const raw = storage(kind)?.getItem(SESSION_KEY);
      if (raw) return { ...JSON.parse(raw), remember: kind === 'local' };
    } catch { /* ignore */ }
  }
  return null;
}

function saveSession(session, remember) {
  clearSession();
  try {
    storage(remember ? 'local' : 'session')?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

function clearSession() {
  for (const kind of ['session', 'local']) {
    try { storage(kind)?.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
}

async function connect(session) {
  const client = new GitHub({
    token: session.token,
    owner: session.owner || config.owner,
    repo: session.repo || config.repo,
    branch: session.branch || config.branch || 'main',
    apiBase: config.apiBase,
  });
  if (!client.owner || !client.repo) throw new Error('Repository owner and name are required.');
  const repo = await client.repository();
  if (repo.permissions && repo.permissions.push === false) {
    throw new Error(`Your GitHub account has no write access to ${client.owner}/${client.repo}.`);
  }
  gh = client;
  user = await gh.user().catch(() => null);
  await refresh();
}

function isDocPath(path) {
  if (path === PATHS.home || path === PATHS.pinned) return true;
  return [PATHS.posts, PATHS.pages].some((dir) => path.startsWith(dir) && path.endsWith('.md') && !path.slice(dir.length).includes('/'));
}

function makeDoc(path, sha, text) {
  if (RAW_LABELS[path]) return { path, sha, kind: 'raw', slug: '', label: RAW_LABELS[path], data: {}, body: text };
  const kind = path.startsWith(PATHS.posts) ? 'post' : 'page';
  const slug = path.split('/').pop().replace(/\.md$/, '');
  const { data, body } = parseDocument(text);
  return { path, sha, kind, slug, label: String(data.title || slug), data, body };
}

async function refresh() {
  snap = await gh.snapshot();
  for (const path of docs.keys()) if (!snap.files.has(path)) docs.delete(path);
  const wanted = [...snap.files.keys()].filter(isDocPath);
  await mapLimit(wanted, 8, async (path) => {
    const { sha } = snap.files.get(path);
    if (docs.get(path)?.sha === sha) return;
    docs.set(path, makeDoc(path, sha, await gh.text(sha)));
  });
}

// ---------------------------------------------------------------------------
// Deploy status
// ---------------------------------------------------------------------------

function setDeploy(next) {
  deploy = next;
  renderDeployPill();
}

function renderDeployPill() {
  const pill = document.getElementById('deployPill');
  if (!pill) return;
  pill.hidden = !deploy;
  if (!deploy) return;
  pill.className = `deploy-pill deploy-${deploy.state}`;
  pill.textContent = deploy.label;
  pill.title = deploy.title || '';
  if (deploy.url) pill.href = deploy.url;
  else pill.removeAttribute('href');
}

function runToDeploy(run) {
  if (run.status !== 'completed') return { state: 'building', label: 'Deploying…', url: run.html_url, title: run.display_title };
  if (run.conclusion === 'success') return { state: 'success', label: 'Live ✓', url: siteBase, title: `Last deploy: ${run.display_title}` };
  return { state: 'failure', label: 'Build failed ✗', url: run.html_url, title: `${run.display_title}: ${run.conclusion}` };
}

function watchDeploy(sha) {
  clearTimeout(deployTimer);
  const started = Date.now();
  setDeploy({ state: 'building', label: 'Waiting for build…' });
  const tick = async () => {
    let runs;
    try {
      runs = await gh.workflowRuns(sha);
    } catch {
      setDeploy({ state: 'unknown', label: 'Committed ✓', title: 'Deploy status needs the "Actions: Read" token permission' });
      return;
    }
    if (runs[0]) {
      setDeploy(runToDeploy(runs[0]));
      if (runs[0].status === 'completed') return;
    } else if (Date.now() - started > 120_000) {
      setDeploy({ state: 'unknown', label: 'Committed ✓', title: 'No workflow run found for this commit' });
      return;
    }
    if (Date.now() - started < 15 * 60_000) deployTimer = setTimeout(tick, 5000);
  };
  deployTimer = setTimeout(tick, 2500);
}

async function initialDeployStatus() {
  try {
    const [run] = await gh.workflowRuns();
    if (!run) return;
    if (run.status !== 'completed') watchDeploy(run.head_sha);
    else setDeploy(runToDeploy(run));
  } catch { /* token without Actions permission: no pill */ }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

let lastHash = location.hash;
let ignoreHashChange = false;

function currentRoute() {
  const [view, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { view: view || 'posts', arg: decodeURIComponent(rest.join('/')) };
}

function onHashChange() {
  if (ignoreHashChange) {
    ignoreHashChange = false;
    return;
  }
  if (dirty && !confirm('You have unsaved changes. Leave without publishing?')) {
    ignoreHashChange = true;
    location.hash = lastHash;
    return;
  }
  setDirty(false);
  lastHash = location.hash;
  route();
}

function route() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  if (!gh) return showLogin();
  const { view, arg } = currentRoute();
  if (view === 'edit') {
    const doc = docs.get(arg);
    shell(doc?.kind === 'post' ? 'posts' : 'pages');
    return viewEditor({ path: arg });
  }
  if (view === 'new') {
    shell(arg === 'page' ? 'pages' : 'posts');
    return viewEditor({ kind: arg === 'page' ? 'page' : 'post' });
  }
  shell(view);
  if (view === 'pages') return viewPages();
  if (view === 'media') return viewMedia();
  if (view === 'settings') return viewSettings();
  return viewPosts();
}

function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash) return route();
  if (replace) {
    history.replaceState(null, '', hash);
    lastHash = hash;
    return route();
  }
  location.hash = hash;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showLogin(error = '', { mode = vault ? 'password' : 'token' } = {}) {
  const owner = config.owner || '';
  const repo = config.repo || '';
  const errorBox = error ? `<div class="alert alert-error" role="alert">${h(error)}</div>` : '';

  if (mode === 'password') {
    app.innerHTML = `
    <div class="login">
      <form class="login-card" id="unlockForm">
        <div class="login-logo" aria-hidden="true">❯_</div>
        <h1>${h(config.siteTitle || 'Blog')} <span>admin</span></h1>
        <p class="hint">Enter the admin password to unlock publishing to <strong>${h(owner)}/${h(repo)}</strong>.</p>
        ${errorBox}
        <input type="text" name="username" value="admin" autocomplete="username" hidden>
        <label class="field">Password
          <input type="password" name="password" required autocomplete="current-password" spellcheck="false">
        </label>
        <label class="check"><input type="checkbox" name="remember"> Stay signed in on this device</label>
        <button class="btn btn-primary btn-block" type="submit">Unlock</button>
        <button class="btn btn-ghost btn-block btn-sm" type="button" id="useToken">Sign in with a GitHub token instead</button>
      </form>
    </div>`;
    const form = $('#unlockForm');
    form.password.focus();
    $('#useToken').addEventListener('click', () => showLogin('', { mode: 'token' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      let session;
      try {
        session = await openVault(vault, form.password.value);
      } catch (err) {
        return showLogin(err instanceof WrongPasswordError ? 'Wrong password.' : err.message);
      }
      try {
        await connect(session);
      } catch (err) {
        gh = null;
        return showLogin(err.status === 401
          ? 'Password accepted, but GitHub rejected the stored token (expired or revoked?). Sign in with a new token, then set the password again under Settings.'
          : err.message);
      }
      saveSession(session, form.remember.checked);
      toast(`Unlocked${user ? `. Hi ${user.login}!` : ''}`, 'success');
      route();
      initialDeployStatus();
    });
    return;
  }

  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="loginForm">
      <div class="login-logo" aria-hidden="true">❯_</div>
      <h1>${h(config.siteTitle || 'Blog')} <span>admin</span></h1>
      <p class="hint">Sign in with a GitHub access token. Everything you publish is committed to
        <strong>${h(owner)}/${h(repo)}</strong> and deployed automatically by GitHub Actions.</p>
      ${errorBox}
      <label class="field">Access token
        <input type="password" name="token" required autocomplete="off" placeholder="github_pat_…" spellcheck="false">
      </label>
      <label class="check"><input type="checkbox" name="remember"> Remember me on this device</label>
      <details class="advanced">
        <summary>Repository</summary>
        <div class="grid-3">
          <label class="field">Owner<input name="owner" value="${h(owner)}" spellcheck="false"></label>
          <label class="field">Repository<input name="repo" value="${h(repo)}" spellcheck="false"></label>
          <label class="field">Branch<input name="branch" value="${h(config.branch || 'main')}" spellcheck="false"></label>
        </div>
      </details>
      <button class="btn btn-primary btn-block" type="submit">Sign in</button>
      ${vault ? '<button class="btn btn-ghost btn-block btn-sm" type="button" id="usePassword">Unlock with the admin password instead</button>' : ''}
      <details class="help">
        <summary>How do I get a token?</summary>
        <ol>
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Settings → Developer settings → Fine-grained tokens</a>.</li>
          <li><em>Repository access</em>: “Only select repositories” → <code>${h(owner)}/${h(repo)}</code>.</li>
          <li><em>Permissions</em>: <strong>Contents → Read and write</strong> (required) and <strong>Actions → Read</strong> (optional, shows the deploy status).</li>
          <li>Generate the token, copy it and paste it above.</li>
        </ol>
        <p>Tip: once signed in, set an <strong>admin password</strong> under Settings. The token is then stored encrypted
          in the repository, and from then on the password alone unlocks the admin.</p>
      </details>
    </form>
  </div>`;
  const form = $('#loginForm');
  form.token.focus();
  $('#usePassword')?.addEventListener('click', () => showLogin('', { mode: 'password' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    const session = {
      token: form.token.value.trim(),
      owner: form.owner.value.trim(),
      repo: form.repo.value.trim(),
      branch: form.branch.value.trim() || 'main',
    };
    try {
      await connect(session);
      saveSession(session, form.remember.checked);
      toast(`Signed in${user ? ` as ${user.login}` : ''}`, 'success');
      route();
      initialDeployStatus();
    } catch (err) {
      gh = null;
      showLogin(err.message, { mode: 'token' });
    }
  });
}

function shell(active) {
  app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#/posts"><span class="brand-prompt">❯</span> ${h(config.siteTitle || 'Blog')} <span class="brand-sub">admin</span></a>
    <nav class="tabs" aria-label="Sections">
      ${[['posts', '📝', 'Posts'], ['pages', '📄', 'Pages'], ['media', '🖼️', 'Media'], ['settings', '⚙️', 'Settings']]
        .map(([k, icon, label]) => `<a href="#/${k}"${active === k ? ' class="active" aria-current="page"' : ''}><span aria-hidden="true">${icon}</span> <span class="tab-label">${label}</span></a>`).join('')}
    </nav>
    <div class="topbar-right">
      <a class="deploy-pill" id="deployPill" target="_blank" rel="noopener" hidden></a>
      <a class="btn btn-ghost btn-sm" href="${h(siteBase)}" target="_blank" rel="noopener">View site ↗</a>
    </div>
  </header>
  <main class="view" id="view"></main>`;
  renderDeployPill();
}

function docRow(doc, extra = '') {
  return `<li class="doc-item" data-search="${h(`${doc.label} ${doc.slug} ${(doc.data.tags || []).join(' ')}`.toLowerCase())}">
    <a class="doc-row" href="#/edit/${enc(doc.path)}">
      <span class="doc-title">${h(doc.label)}</span>
      <span class="doc-meta">${extra}</span>
    </a>
  </li>`;
}

function badges(doc) {
  const status = postStatus(doc.data);
  return status === 'published' ? '' : `<span class="badge badge-${status}">${status}</span>`;
}

function listHeader(title, count, actions) {
  return `<div class="view-head">
    <h1>${title} <span class="count">${count}</span></h1>
    <div class="view-actions">${actions}</div>
  </div>`;
}

function wireListTools() {
  $('#filter')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    $$('.doc-item').forEach((li) => { li.hidden = q && !li.dataset.search.includes(q); });
  });
  $('#reload')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await refresh();
      route();
      toast('Reloaded from GitHub');
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  });
}

function viewPosts() {
  const posts = [...docs.values()]
    .filter((d) => d.kind === 'post')
    .sort((a, b) => String(normalizeDate(b.data.date)).localeCompare(normalizeDate(a.data.date)) || a.label.localeCompare(b.label));
  $('#view').innerHTML = `
    ${listHeader('Posts', posts.length, `
      <input type="search" id="filter" placeholder="Filter…" aria-label="Filter posts">
      <button class="btn" id="reload" title="Reload from GitHub">⟳</button>
      <a class="btn btn-primary" href="#/new/post">＋ New post</a>`)}
    ${snap.truncated ? '<div class="alert">The repository is very large; some files may be missing from this list.</div>' : ''}
    <ul class="doc-list">
      ${posts.map((d) => docRow(d, `
        <time>${h(normalizeDate(d.data.date) || 'no date')}</time>
        ${badges(d)}
        ${splitTags(d.data.tags).map((t) => `<span class="tag">#${h(t)}</span>`).join('')}`)).join('')
        || '<li class="empty">No posts yet. Write your first one!</li>'}
    </ul>`;
  wireListTools();
}

function viewPages() {
  const pages = [...docs.values()].filter((d) => d.kind === 'page').sort((a, b) => a.label.localeCompare(b.label));
  const special = Object.entries(RAW_LABELS).map(([path, label]) =>
    docs.get(path) || { path, label, kind: 'raw', slug: '', data: {}, body: '' });
  $('#view').innerHTML = `
    ${listHeader('Pages', pages.length, `
      <button class="btn" id="reload" title="Reload from GitHub">⟳</button>
      <a class="btn btn-primary" href="#/new/page">＋ New page</a>`)}
    <h2 class="list-title">Home page</h2>
    <ul class="doc-list">
      ${special.map((d) => docRow(d, `<code>${h(d.path)}</code>${docs.has(d.path) ? '' : ' <span class="badge">empty</span>'}`)).join('')}
    </ul>
    <h2 class="list-title">Pages</h2>
    <ul class="doc-list">
      ${pages.map((d) => docRow(d, `<code>/${h(d.slug)}.html</code>${d.data.menu === true ? ' <span class="badge badge-menu">in menu</span>' : ''}${d.data.draft === true ? ' <span class="badge badge-draft">draft</span>' : ''}`)).join('')
        || '<li class="empty">No pages yet.</li>'}
    </ul>`;
  wireListTools();
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function previewDocument(kind) {
  const light = (() => {
    try {
      const saved = localStorage.getItem('apex-light');
      return saved === null ? config.defaultMode === 'light' : saved === 'true';
    } catch { return config.defaultMode === 'light'; }
  })();
  const header = kind === 'post'
    ? '<header class="preview-header"><h1 id="pvTitle"></h1><div class="entry-meta" id="pvMeta"></div><div class="chips" id="pvTags"></div></header>'
    : '';
  return `<!DOCTYPE html><html class="${light ? 'light' : 'dark'}"><head><meta charset="utf-8">
<base href="${h(siteBase)}">
<link rel="stylesheet" href="${h(config.fontsUrl || '')}">
<link rel="stylesheet" href="assets/style.css?v=${h(config.version || '')}">
<style>body{display:block;min-height:0}.preview-wrap{padding:1rem}main{margin:0 auto}</style>
</head><body class="page-${kind === 'post' ? 'post' : 'page'}"><div class="preview-wrap"><main>
<article class="${kind === 'post' ? 'entry' : 'page'}">${header}<div class="prose" id="pvBody"></div></article>
</main></div></body></html>`;
}

async function optimizeImage(file) {
  const fallbackExt = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || file.type.split('/')[1] || 'bin').toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return { blob: file, ext: fallbackExt };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 300_000) {
      bitmap.close();
      return { blob: file, ext: fallbackExt };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return { blob: file, ext: fallbackExt };
    return { blob, ext: 'webp' };
  } catch {
    return { blob: file, ext: fallbackExt };
  }
}

async function prepareUpload(file) {
  const { blob, ext } = await optimizeImage(file);
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  const stem = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const name = `${stem}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const year = new Date().getFullYear();
  return {
    url: `/media/${year}/${name}`,
    repoPath: `${PATHS.media}${year}/${name}`,
    base64,
    dataUrl: `data:${blob.type || MIME[ext] || 'application/octet-stream'};base64,${base64}`,
    size: blob.size,
    originalSize: file.size,
    alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
  };
}

function viewEditor({ path, kind }) {
  const view = $('#view');
  let doc = path ? docs.get(path) : null;
  if (path && !doc && RAW_LABELS[path]) doc = { path, sha: null, kind: 'raw', slug: '', label: RAW_LABELS[path], data: {}, body: '' };
  if (path && !doc) {
    view.innerHTML = '<div class="alert alert-error">This file does not exist (anymore). <a href="#/posts">Back to posts</a></div>';
    return;
  }
  kind = doc ? doc.kind : kind;
  const isNew = !doc;
  const isRaw = kind === 'raw';
  const noun = isRaw ? doc.label : kind;
  const backHref = kind === 'post' ? '#/posts' : '#/pages';
  const draftKey = DRAFT_PREFIX + (doc ? doc.path : `new-${kind}`);
  const uploads = new Map();
  const data = doc ? { ...doc.data } : kind === 'post' ? { title: '', date: today(), type: sectionOf().key, tags: [] } : { title: '', menu: false };
  const allTags = [...new Set([...docs.values()].filter((d) => d.kind === 'post').flatMap((d) => splitTags(d.data.tags)))].sort();
  let slugTouched = !isNew;

  view.innerHTML = `
  <form class="editor" id="editor" autocomplete="off" novalidate>
    <div class="editor-head">
      <a class="back" href="${backHref}">← ${kind === 'post' ? 'Posts' : 'Pages'}</a>
      <h1>${isNew ? `New ${kind}` : isRaw ? h(doc.label) : `Edit ${kind}`}</h1>
      <div class="editor-links">
        ${!isNew && doc.sha ? `<a class="btn btn-ghost btn-sm" href="${h(liveUrl(doc))}" target="_blank" rel="noopener">View live ↗</a>` : ''}
        ${!isNew && doc.sha && gh.webUrl ? `<a class="btn btn-ghost btn-sm" href="${h(`${gh.webUrl}/commits/${gh.branch}/${doc.path}`)}" target="_blank" rel="noopener">History ↗</a>` : ''}
      </div>
    </div>
    <div class="alert" id="restoreBanner" hidden></div>
    ${isRaw ? `<p class="hint">${doc.path === PATHS.pinned ? 'Shown highlighted at the top of the home page. Leave empty to hide it.' : 'Introduction shown at the top of the home page.'}</p>` : `
    <div class="meta-grid">
      <label class="field field-title">Title<input name="title" required placeholder="${kind === 'post' ? 'An interesting title' : 'About me'}"></label>
      <label class="field">Slug <small>(URL: ${kind === 'post' ? '/<b id="sectionPreview"></b>/<b id="slugPreview"></b>/' : '/<b id="slugPreview"></b>.html'})</small><input name="slug" required pattern="[a-z0-9-]+" spellcheck="false"></label>
      ${kind === 'post' ? `
      <label class="field">Section<select name="type">${(config.sections || []).map((x) => `<option value="${h(x.key)}">${h(x.label)}</option>`).join('')}</select></label>
      <label class="field">Date<input name="date" type="date" required></label>
      <label class="field field-wide">Tags <small>(comma separated)</small><input name="tags" placeholder="indoor, f1, keeper" spellcheck="false">
        ${allTags.length ? `<span class="tag-suggestions">${allTags.map((t) => `<button type="button" class="tag" data-tag="${h(t)}">#${h(t)}</button>`).join('')}</span>` : ''}
      </label>` : `
      <label class="check"><input type="checkbox" name="menu"> Show in menu</label>
      <label class="field field-narrow">Menu order<input name="order" type="number" step="1" placeholder="0"></label>`}
      <label class="field field-wide">Description <small>(optional, used for previews &amp; search engines)</small><input name="description" maxlength="300"></label>
      <label class="check"><input type="checkbox" name="draft"> Draft <small>(not published)</small></label>
    </div>`}
    <div class="md-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button type="button" data-cmd="h2" title="Heading">H2</button>
      <button type="button" data-cmd="h3" title="Sub-heading">H3</button>
      <button type="button" data-cmd="link" title="Link (Ctrl+K)">🔗</button>
      <button type="button" data-cmd="quote" title="Quote">❝</button>
      <button type="button" data-cmd="ul" title="Bulleted list">•≡</button>
      <button type="button" data-cmd="ol" title="Numbered list">1.</button>
      <button type="button" data-cmd="code" title="Inline code">&lt;/&gt;</button>
      <button type="button" data-cmd="codeblock" title="Code block">{ }</button>
      <button type="button" data-cmd="table" title="Table">▦</button>
      <label class="tool-file" title="Insert image (or paste / drop one)">🖼️<input type="file" accept="image/*" multiple hidden id="imageInput"></label>
      ${kind === 'post' ? '<button type="button" data-cmd="more" title="Excerpt break: text above is shown on the home page">✂ more</button>' : ''}
      <span class="spacer"></span>
      <span class="pane-switch" role="tablist">
        <button type="button" data-pane="write" class="active">Write</button>
        <button type="button" data-pane="preview">Preview</button>
      </span>
    </div>
    <div class="panes" data-show="write">
      <textarea id="body" class="md-input" spellcheck="true" placeholder="Write in Markdown… paste or drop images here."></textarea>
      <iframe id="preview" class="md-preview" sandbox="allow-same-origin" title="Preview"></iframe>
    </div>
    <div class="editor-status"><span id="stats"></span><span id="autosave"></span></div>
    <div class="commit-bar">
      <input name="message" placeholder="Commit message (optional)" aria-label="Commit message">
      ${!isNew && !isRaw ? '<button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>' : ''}
      <button type="submit" class="btn btn-primary" id="saveBtn">Publish</button>
    </div>
  </form>`;

  const form = $('#editor');
  const ta = $('#body');
  const iframe = $('#preview');
  const saveBtn = $('#saveBtn');
  const field = (name) => form.elements.namedItem(name);

  // ---- populate ----
  const fill = (d, body, slug) => {
    if (!isRaw) {
      field('title').value = d.title || '';
      field('slug').value = slug ?? '';
      field('description').value = d.description || '';
      field('draft').checked = d.draft === true;
      if (kind === 'post') {
        field('date').value = normalizeDate(d.date);
        field('type').value = sectionOf(d.type).key;
        field('tags').value = splitTags(d.tags).join(', ');
      } else {
        field('menu').checked = d.menu === true;
        field('order').value = d.order ?? '';
      }
    }
    ta.value = body;
  };
  fill(data, doc ? doc.body : '', doc?.slug ?? '');

  const collect = () => {
    if (isRaw) return { data: {}, body: ta.value, slug: '' };
    const next = { ...data };
    next.title = field('title').value.trim();
    if (kind === 'post') {
      next.date = field('date').value;
      next.type = field('type').value || undefined;
      next.tags = splitTags(field('tags').value);
    } else {
      next.menu = field('menu').checked;
      const order = field('order').value.trim();
      next.order = order === '' ? undefined : Number(order);
    }
    next.description = field('description').value.trim() || undefined;
    next.draft = field('draft').checked ? true : undefined;
    const ordered = {};
    for (const k of ['title', 'date', 'type', 'tags', 'description', 'menu', 'order', 'draft', ...Object.keys(next)]) {
      if (next[k] !== undefined && !(k in ordered)) ordered[k] = next[k];
    }
    return { data: ordered, body: ta.value, slug: slugify(field('slug').value) };
  };
  const fingerprint = () => JSON.stringify(collect());
  let initial = fingerprint();

  // ---- preview ----
  let previewReady = false;
  let previewQueued = false;
  const updatePreview = () => {
    previewQueued = false;
    const pdoc = iframe.contentDocument;
    if (!previewReady || !pdoc?.getElementById('pvBody')) return;
    const { data: d, body } = collect();
    let { html } = render(body);
    for (const [url, dataUrl] of sessionMedia) html = html.split(`"${url}"`).join(`"${dataUrl}"`);
    for (const [url, u] of uploads) html = html.split(`"${url}"`).join(`"${u.dataUrl}"`);
    pdoc.getElementById('pvBody').innerHTML = rewriteRootUrls(html, siteBase);
    if (kind === 'post') {
      pdoc.getElementById('pvTitle').textContent = d.title || 'Untitled';
      pdoc.getElementById('pvMeta').textContent = `${d.date || ''} · ${readingTime(body)} min read${d.draft ? ' · draft' : ''}`;
      pdoc.getElementById('pvTags').innerHTML = (d.tags || []).map((t) => `<span class="chip">${h(t)}</span>`).join('');
    }
  };
  const schedulePreview = () => {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(updatePreview);
  };
  iframe.addEventListener('load', () => {
    previewReady = true;
    updatePreview();
  });
  iframe.srcdoc = previewDocument(kind);

  ta.addEventListener('scroll', () => {
    const win = iframe.contentWindow;
    const el = win?.document?.documentElement;
    if (!el) return;
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    win.scrollTo(0, ratio * (el.scrollHeight - el.clientHeight));
  }, { passive: true });

  // ---- status, dirty tracking & local autosave ----
  let autosaveTimer = null;
  const updateStatus = () => {
    const body = ta.value;
    $('#stats').textContent = `${wordCount(body)} words · ${readingTime(body)} min read${uploads.size ? ` · ${uploads.size} image(s) to upload` : ''}`;
    if (!isRaw && kind === 'post') $('#sectionPreview').textContent = field('type').value;
    if (!isRaw) $('#slugPreview').textContent = slugify(field('slug').value) || '…';
    if (!isRaw) saveBtn.textContent = field('draft').checked ? 'Save draft' : 'Publish';
  };
  const onChange = () => {
    const changed = fingerprint() !== initial || uploads.size > 0;
    setDirty(changed);
    updateStatus();
    schedulePreview();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        if (changed) {
          localStorage.setItem(draftKey, JSON.stringify({ ...collect(), baseSha: doc?.sha || null, at: Date.now() }));
          $('#autosave').textContent = `Draft kept in this browser · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
          localStorage.removeItem(draftKey);
          $('#autosave').textContent = '';
        }
      } catch { /* storage full or disabled */ }
    }, 600);
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  updateStatus();

  // ---- restore a local draft ----
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (saved && JSON.stringify({ data: saved.data, body: saved.body, slug: saved.slug }) !== initial) {
      const banner = $('#restoreBanner');
      const stale = doc && saved.baseSha && saved.baseSha !== doc.sha;
      banner.hidden = false;
      banner.innerHTML = `You have unpublished changes from ${h(new Date(saved.at).toLocaleString())}${stale ? ' (the file has changed on GitHub since)' : ''}.
        <button type="button" class="btn btn-sm btn-primary" data-restore>Restore</button>
        <button type="button" class="btn btn-sm" data-discard>Discard</button>`;
      banner.addEventListener('click', (e) => {
        if (e.target.matches('[data-restore]')) {
          fill(saved.data, saved.body, saved.slug);
          slugTouched = true;
          onChange();
        } else if (!e.target.matches('[data-discard]')) {
          return;
        } else {
          localStorage.removeItem(draftKey);
        }
        banner.hidden = true;
      });
    }
  } catch { /* ignore corrupt drafts */ }

  // ---- slug follows the title until edited by hand ----
  if (!isRaw) {
    field('title').addEventListener('input', () => {
      if (!slugTouched) field('slug').value = slugify(field('title').value);
    });
    field('slug').addEventListener('input', () => { slugTouched = true; });
    field('slug').addEventListener('blur', () => {
      field('slug').value = slugify(field('slug').value);
      onChange();
    });
    form.addEventListener('click', (e) => {
      const tag = e.target.closest('[data-tag]');
      if (!tag) return;
      const tags = splitTags(field('tags').value);
      if (!tags.includes(tag.dataset.tag)) field('tags').value = [...tags, tag.dataset.tag].join(', ');
      onChange();
    });
  }

  // ---- markdown toolbar ----
  const replaceRange = (start, end, text) => {
    ta.focus();
    ta.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, start, end, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const wrap = (before, after, placeholder) => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    replaceRange(s, e, before + sel + after);
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
  };
  const prefixLines = (prefix) => {
    const { value } = ta;
    const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = value.indexOf('\n', ta.selectionEnd);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split('\n');
    const out = lines.map((line, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + line.replace(/^(#{1,6} |> |- |\d+\. )/, '')).join('\n');
    replaceRange(start, end, out);
  };
  const insertBlock = (text) => {
    const { selectionStart: s, value } = ta;
    const before = s === 0 || value[s - 1] === '\n' ? (s > 1 && value[s - 2] !== '\n' ? '\n' : '') : '\n\n';
    replaceRange(s, ta.selectionEnd, `${before}${text}\n`);
  };
  const commands = {
    bold: () => wrap('**', '**', 'bold text'),
    italic: () => wrap('_', '_', 'italic text'),
    code: () => wrap('`', '`', 'code'),
    h2: () => prefixLines('## '),
    h3: () => prefixLines('### '),
    quote: () => prefixLines('> '),
    ul: () => prefixLines('- '),
    ol: () => prefixLines((i) => `${i + 1}. `),
    link: () => {
      const url = prompt('Link URL', 'https://');
      if (url) wrap('[', `](${url})`, 'link text');
    },
    codeblock: () => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      insertBlock(`\`\`\`bash\n${sel || 'echo "hello"'}\n\`\`\``);
    },
    table: () => insertBlock('| Column | Column |\n|--------|--------|\n| Cell   | Cell   |'),
    more: () => insertBlock('<!--more-->'),
  };
  form.querySelector('.md-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmd]');
    if (btn) commands[btn.dataset.cmd]();
    const pane = e.target.closest('[data-pane]');
    if (pane) {
      $('.panes').dataset.show = pane.dataset.pane;
      $$('[data-pane]').forEach((b) => b.classList.toggle('active', b === pane));
      if (pane.dataset.pane === 'preview') updatePreview();
    }
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const cmd = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
    if (cmd) {
      e.preventDefault();
      commands[cmd]();
    }
  });
  listen(document, 'keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  listen(window, 'beforeunload', () => clearTimeout(autosaveTimer));

  // ---- images: picker, paste, drag & drop ----
  const addImages = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    for (const file of images) {
      try {
        const u = await prepareUpload(file);
        uploads.set(u.url, u);
        const s = ta.selectionStart;
        replaceRange(s, ta.selectionEnd, `![${u.alt}](${u.url})`);
        toast(`Image ready (${kb(u.size)}${u.size < u.originalSize ? `, optimized from ${kb(u.originalSize)}` : ''}). It is uploaded when you publish.`, 'success');
      } catch (err) {
        toast(`Could not add ${file.name}: ${err.message}`, 'error');
      }
    }
    onChange();
  };
  $('#imageInput').addEventListener('change', (e) => {
    addImages(e.target.files);
    e.target.value = '';
  });
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      addImages(files);
    }
  });
  ta.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) {
      e.preventDefault();
      ta.classList.add('drop');
    }
  });
  ta.addEventListener('dragleave', () => ta.classList.remove('drop'));
  ta.addEventListener('drop', (e) => {
    ta.classList.remove('drop');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    addImages(e.dataTransfer.files);
  });

  // ---- save ----
  const invalid = (message, input) => {
    toast(message, 'error');
    input?.focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: d, body, slug } = collect();
    if (!isRaw) {
      if (!d.title) return invalid('Please enter a title.', field('title'));
      if (!slug) return invalid('Please enter a slug (a-z, 0-9 and dashes).', field('slug'));
      if (kind === 'post' && !normalizeDate(d.date)) return invalid('Please pick a date.', field('date'));
      if (kind === 'page' && RESERVED.has(slug)) return invalid(`“${slug}” is a reserved name, please pick another slug.`, field('slug'));
    }
    const newPath = isRaw ? doc.path : `${kind === 'post' ? PATHS.posts : PATHS.pages}${slug}.md`;
    saveBtn.disabled = true;
    const label = saveBtn.textContent;
    saveBtn.textContent = 'Publishing…';
    try {
      snap = await gh.snapshot();
      if (doc?.sha) {
        const remote = snap.files.get(doc.path);
        if (!remote && !confirm('This file was deleted on GitHub after you opened it. Create it again?')) return;
        if (remote && remote.sha !== doc.sha && !confirm('This file was changed on GitHub after you opened it. Overwrite those changes?')) return;
      }
      if (newPath !== doc?.path && snap.files.has(newPath)) return invalid(`A ${kind} with the slug “${slug}” already exists.`, field('slug'));

      const text = isRaw ? body.replace(/\s*$/, '\n').replace(/^\n$/, '') : serializeDocument(d, body);
      const changes = [{ path: newPath, content: text }];
      if (doc?.sha && newPath !== doc.path && snap.files.has(doc.path)) changes.push({ path: doc.path, delete: true });
      for (const [url, u] of uploads) if (text.includes(url)) changes.push({ path: u.repoPath, base64: u.base64 });
      const verb = isNew || !doc.sha ? 'Add' : newPath !== doc.path ? 'Rename' : 'Update';
      const message = field('message').value.trim() || `${verb} ${isRaw ? noun.toLowerCase() : `${kind} “${d.title}”`}`;

      const sha = await gh.commit(message, changes);
      for (const [url, u] of uploads) sessionMedia.set(url, u.dataUrl);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setDirty(false);
      toast(`Saved: ${message}`, 'success');
      watchDeploy(sha);
      await refresh();
      navigate(`#/edit/${enc(newPath)}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error', 8000);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = label;
    }
  });

  // ---- delete ----
  $('#deleteBtn')?.addEventListener('click', async (e) => {
    if (!confirm(`Delete “${doc.label}”?\n\nThe file is removed from the site (it stays in the git history).`)) return;
    e.target.disabled = true;
    try {
      const sha = await gh.commit(`Delete ${kind} “${doc.label}”`, [{ path: doc.path, delete: true }]);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setDirty(false);
      toast(`Deleted “${doc.label}”`, 'success');
      watchDeploy(sha);
      await refresh();
      navigate(backHref, { replace: true });
    } catch (err) {
      toast(err.message, 'error', 8000);
      e.target.disabled = false;
    }
  });

  if (isNew) field('title')?.focus();
  else ta.focus();
}

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

function viewMedia() {
  const files = [...snap.files].filter(([p]) => p.startsWith(PATHS.media)).sort((a, b) => b[0].localeCompare(a[0]));
  const urlOf = (path) => `/${path.slice('public/'.length)}`;
  $('#view').innerHTML = `
    ${listHeader('Media', files.length, `
      <button class="btn" id="reload" title="Reload from GitHub">⟳</button>
      <label class="btn btn-primary">⇪ Upload<input type="file" accept="image/*,application/pdf" multiple hidden id="mediaInput"></label>`)}
    <p class="hint">Images are resized to at most 1920 px and converted to WebP when that makes them smaller. Tip: you can also paste or drop images straight into the editor.</p>
    <div class="media-grid">
      ${files.map(([path, f]) => `
      <figure class="media-item" data-path="${h(path)}">
        <div class="thumb" data-sha="${f.sha}" data-size="${f.size}" data-ext="${h(path.split('.').pop().toLowerCase())}"><span>${h(path.split('.').pop().toUpperCase())}</span></div>
        <figcaption title="${h(urlOf(path))}">${h(path.split('/').pop())}<small>${kb(f.size)}</small></figcaption>
        <div class="media-actions">
          <button type="button" class="btn btn-sm" data-copy="${h(urlOf(path))}">Copy markdown</button>
          <button type="button" class="btn btn-sm btn-danger" data-delete="${h(path)}" aria-label="Delete">🗑</button>
        </div>
      </figure>`).join('') || '<p class="empty">No media yet.</p>'}
    </div>`;
  wireListTools();

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      const { sha, size, ext } = entry.target.dataset;
      if (!MIME[ext] || Number(size) > 3_000_000) continue;
      gh.blobBase64(sha).then((b64) => {
        entry.target.innerHTML = `<img alt="" src="data:${MIME[ext]};base64,${b64.replace(/\s/g, '')}">`;
      }).catch(() => {});
    }
  }, { rootMargin: '200px' });
  $$('.thumb').forEach((t) => io.observe(t));
  onCleanup(() => io.disconnect());

  $('.media-grid').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    const del = e.target.closest('[data-delete]');
    if (copy) {
      const url = copy.dataset.copy;
      const md = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url) ? `![](${url})` : `[${url.split('/').pop()}](${url})`;
      try {
        await navigator.clipboard.writeText(md);
        toast(`Copied ${md}`, 'success');
      } catch {
        prompt('Copy this:', md);
      }
    }
    if (del) {
      const path = del.dataset.delete;
      const url = urlOf(path);
      const usedIn = [...docs.values()].filter((d) => d.body.includes(url)).map((d) => d.label);
      const warning = usedIn.length ? `\n\n⚠️ It is still used in: ${usedIn.join(', ')}` : '';
      if (!confirm(`Delete ${path.split('/').pop()}?${warning}`)) return;
      del.disabled = true;
      try {
        const sha = await gh.commit(`Delete media ${path.split('/').pop()}`, [{ path, delete: true }]);
        watchDeploy(sha);
        await refresh();
        route();
        toast('Deleted', 'success');
      } catch (err) {
        toast(err.message, 'error');
        del.disabled = false;
      }
    }
  });

  $('#mediaInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    toast(`Uploading ${files.length} file(s)…`);
    try {
      const prepared = await Promise.all(files.map(async (file) => {
        if (file.type.startsWith('image/')) return prepareUpload(file);
        const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
        const ext = file.name.split('.').pop().toLowerCase();
        const name = `${slugify(file.name.replace(/\.[^.]+$/, '')) || 'file'}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        return { repoPath: `${PATHS.media}${new Date().getFullYear()}/${name}`, base64 };
      }));
      const sha = await gh.commit(
        prepared.length === 1 ? `Upload ${prepared[0].repoPath.split('/').pop()}` : `Upload ${prepared.length} media files`,
        prepared.map((u) => ({ path: u.repoPath, base64: u.base64 })),
      );
      for (const u of prepared) if (u.url) sessionMedia.set(u.url, u.dataUrl);
      watchDeploy(sha);
      await refresh();
      route();
      toast('Upload complete. Use “Copy markdown” to embed a file in a post.', 'success');
    } catch (err) {
      toast(err.message, 'error', 8000);
    }
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function viewSettings() {
  const view = $('#view');
  view.innerHTML = '<div class="boot">Loading settings…</div>';
  const entry = snap.files.get(PATHS.config);
  let text = '';
  try {
    text = entry ? await gh.text(entry.sha) : '{\n}\n';
  } catch (err) {
    view.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }
  const session = loadSession() || {};
  view.innerHTML = `
    <div class="view-head"><h1>Settings</h1></div>
    <section class="card">
      <h2>Site configuration <code>site.json</code></h2>
      <p class="hint">Title, description, URL, the project dock, footer and menu links. Root-relative links like <code>/projects.html</code> work wherever the site is hosted.</p>
      <textarea id="siteJson" class="code-input" spellcheck="false" rows="22" aria-label="site.json"></textarea>
      <div class="row">
        <span id="jsonStatus" class="json-status"></span>
        <button type="button" class="btn btn-primary" id="saveJson">Save settings</button>
      </div>
    </section>
    <section class="card">
      <h2>Admin password</h2>
      <p class="hint" id="vaultState"></p>
      <p class="hint">Saving a password encrypts your current GitHub token (AES-256-GCM, key derived with
        ${DEFAULT_ITERATIONS.toLocaleString('en')} rounds of PBKDF2) and commits it as <code>${PATHS.vault}</code>.
        After that, the password alone unlocks this admin on any device.</p>
      <div class="alert">The encrypted file is public, so anyone can try to guess the password offline, without any rate limit.
        Use a <strong>long, unique</strong> password (the generator makes a ~140-bit one) and keep it in a password manager.
        It cannot be recovered. If you forget it, sign in with a token and set a new one.</div>
      <form id="vaultForm" class="grid-2" autocomplete="off">
        <input type="text" name="username" value="admin" autocomplete="username" hidden>
        <label class="field">New password<input type="password" name="newPassword" autocomplete="new-password" spellcheck="false"></label>
        <label class="field">Repeat password<input type="password" name="repeatPassword" autocomplete="new-password" spellcheck="false"></label>
      </form>
      <div class="row">
        <span id="pwStatus" class="json-status"></span>
        <span class="btn-group">
          <button type="button" class="btn" id="genPw">Generate</button>
          <button type="button" class="btn btn-primary" id="savePw">Save password</button>
        </span>
      </div>
      <button type="button" class="btn btn-danger btn-sm" id="removeVault" hidden>Remove password unlock</button>
    </section>
    <section class="card">
      <h2>Session</h2>
      <dl class="facts">
        <dt>Signed in as</dt><dd>${user ? `<a href="${h(user.html_url)}" target="_blank" rel="noopener">${h(user.login)}</a>` : 'unknown'}</dd>
        <dt>Repository</dt><dd>${gh.webUrl ? `<a href="${h(gh.webUrl)}" target="_blank" rel="noopener">${h(gh.owner)}/${h(gh.repo)}</a>` : `${h(gh.owner)}/${h(gh.repo)}`} (branch <code>${h(gh.branch)}</code>)</dd>
        <dt>Token stored</dt><dd>${session.remember ? 'on this device (until you sign out)' : 'in this tab only'}</dd>
      </dl>
      <button type="button" class="btn" id="logout">Sign out</button>
    </section>`;
  const ta = $('#siteJson');
  const status = $('#jsonStatus');
  ta.value = text;
  const validate = () => {
    try {
      const parsed = JSON.parse(ta.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be a JSON object');
      status.textContent = '✓ Valid JSON';
      status.className = 'json-status ok';
      return true;
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
      status.className = 'json-status error';
      return false;
    }
  };
  validate();
  ta.addEventListener('input', () => {
    validate();
    setDirty(ta.value !== text);
  });
  $('#saveJson').addEventListener('click', async (e) => {
    if (!validate()) return toast('Please fix the JSON first.', 'error');
    e.target.disabled = true;
    try {
      snap = await gh.snapshot();
      const remote = snap.files.get(PATHS.config);
      if (entry && remote && remote.sha !== entry.sha && !confirm('site.json was changed on GitHub meanwhile. Overwrite?')) return;
      const sha = await gh.commit('Update site settings', [{ path: PATHS.config, content: ta.value.replace(/\s*$/, '\n') }]);
      setDirty(false);
      watchDeploy(sha);
      await refresh();
      toast('Settings saved', 'success');
      route();
    } catch (err) {
      toast(err.message, 'error', 8000);
    } finally {
      e.target.disabled = false;
    }
  });
  wireVaultSettings();
  $('#logout').addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    clearSession();
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('kb-blob:')) localStorage.removeItem(key);
    } catch { /* ignore */ }
    gh = null;
    user = null;
    docs.clear();
    clearTimeout(deployTimer);
    deploy = null;
    setDirty(false);
    history.replaceState(null, '', location.pathname);
    showLogin();
  });
}

function wireVaultSettings() {
  const form = $('#vaultForm');
  const status = $('#pwStatus');
  const stored = snap.files.get(PATHS.vault);
  $('#vaultState').innerHTML = stored
    ? `✅ Password unlock is <strong>enabled</strong>${vault?.created ? ` (set ${h(vault.created)})` : ''}. Saving a new password replaces it.`
    : 'Password unlock is <strong>not set up</strong> yet.';
  $('#removeVault').hidden = !stored;

  const check = () => {
    const pw = form.newPassword.value;
    const problems = pw ? passwordProblems(pw) : [];
    if (!pw) status.textContent = '';
    else if (problems.length) status.textContent = `✗ Too weak: ${problems.join('; ')}`;
    else if (form.repeatPassword.value && form.repeatPassword.value !== pw) status.textContent = '✗ The passwords do not match';
    else status.textContent = form.repeatPassword.value ? '✓ Strong enough' : '✓ Strong enough. Now repeat it.';
    status.className = `json-status ${status.textContent.startsWith('✓') ? 'ok' : 'error'}`;
    return pw && !problems.length && pw === form.repeatPassword.value;
  };
  form.addEventListener('input', check);

  $('#genPw').addEventListener('click', () => {
    const pw = generatePassword();
    form.newPassword.value = pw;
    form.repeatPassword.value = pw;
    form.newPassword.type = 'text';
    form.newPassword.select();
    check();
    toast('Password generated. Copy it into your password manager before saving!', 'info', 8000);
  });

  $('#savePw').addEventListener('click', async (e) => {
    if (!check()) {
      toast(form.newPassword.value ? status.textContent.replace(/^✗ /, '') : 'Please enter a password.', 'error');
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Encrypting…';
    try {
      const sealed = await sealVault({ token: gh.token, owner: gh.owner, repo: gh.repo, branch: gh.branch }, form.newPassword.value);
      const sha = await gh.commit(stored ? 'Change admin password' : 'Set up admin password', [
        { path: PATHS.vault, content: `${JSON.stringify(sealed, null, 2)}\n` },
      ]);
      vault = sealed;
      watchDeploy(sha);
      await refresh();
      toast('Admin password saved. It works on other devices once the deploy is live.', 'success', 8000);
      route();
    } catch (err) {
      toast(err.message, 'error', 8000);
      e.target.disabled = false;
      e.target.textContent = 'Save password';
    }
  });

  $('#removeVault').addEventListener('click', async (e) => {
    if (!confirm('Remove password unlock? You will need a GitHub token to sign in again.')) return;
    e.target.disabled = true;
    try {
      const sha = await gh.commit('Remove admin password', [{ path: PATHS.vault, delete: true }]);
      vault = null;
      watchDeploy(sha);
      await refresh();
      toast('Password unlock removed', 'success');
      route();
    } catch (err) {
      toast(err.message, 'error', 8000);
      e.target.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  try {
    config = await (await fetch('config.json', { cache: 'no-store' })).json();
  } catch {
    config = {};
  }
  vault = config.vault || null;
  setDirty(false);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const session = loadSession();
  if (!session?.token) return showLogin();
  try {
    await connect(session);
  } catch (err) {
    gh = null;
    if (err.status === 401) clearSession();
    return showLogin(err.message);
  }
  route();
  initialDeployStatus();
}

boot();
