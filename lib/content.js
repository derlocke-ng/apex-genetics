// Shared content helpers. Runs unchanged in Node (build) and the browser (admin),
// so the admin editor reads and writes posts exactly the way the build does.

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// ---------------------------------------------------------------------------
// Front matter (a small, predictable YAML subset)
// ---------------------------------------------------------------------------

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return splitInlineList(v.slice(1, -1)).map(parseScalar).filter((x) => x !== '');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function splitInlineList(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

export function parseFrontMatter(src) {
  const data = {};
  let listKey = null;
  for (const line of src.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && listKey) {
      data[listKey].push(parseScalar(item[1]));
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (value.trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(value);
      listKey = null;
    }
  }
  // An empty block list ("tags:" with nothing under it) means "no value".
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length === 0 && k !== 'tags') data[k] = '';
  }
  return data;
}

function needsQuotes(s) {
  return (
    s === '' ||
    s !== s.trim() ||
    /^[\[\]{}"'>|*&!%@`#,?:-]/.test(s) ||
    /:\s|\s#|[\n\r\t]/.test(s) ||
    /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(s)
  );
}

function formatScalar(v, inList = false) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v ?? '');
  if (needsQuotes(s) || (inList && /[,\[\]]/.test(s))) return JSON.stringify(s);
  return s;
}

export function stringifyFrontMatter(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((x) => formatScalar(x, true)).join(', ')}]`);
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Split a markdown file into { data, body }.
 * Understands YAML front matter and, for older Kiwi Blog posts, the legacy
 * "# Title / **Date:** / **Tags:**" header.
 */
export function parseDocument(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const fm = src.match(FRONT_MATTER);
  if (fm) {
    const data = parseFrontMatter(fm[1]);
    if (typeof data.tags === 'string') data.tags = splitTags(data.tags);
    return { data, body: src.slice(fm[0].length).replace(/^\s*\n/, '') };
  }
  return parseLegacy(src);
}

function parseLegacy(src) {
  const lines = src.split(/\r?\n/);
  const data = {};
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const h1 = lines[i] && lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
  if (!h1) return { data, body: src };
  data.title = h1[1];
  i++;
  // Consume the metadata block directly under the title.
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const date = line.match(/^\*\*Date:\*\*\s*(.+)$/i);
    const tags = line.match(/^\*\*Tags:\*\*\s*(.+)$/i);
    if (date) data.date = date[1].trim();
    else if (tags) data.tags = splitTags(tags[1]);
    else break;
  }
  return { data, body: lines.slice(i).join('\n') };
}

export function serializeDocument(data, body) {
  const clean = String(body ?? '').replace(/^\s*\n/, '').replace(/\s*$/, '\n');
  return `${stringifyFrontMatter(data)}\n${clean}`;
}

export function splitTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const tag = String(t).trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const TRANSLIT = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', ø: 'o', å: 'a', œ: 'oe', þ: 'th', ð: 'd' };

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[äöüßæøåœþð]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Rough plain-text version of markdown, for excerpts, search and word counts. */
export function markdownToText(md) {
  return String(md ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~\n]*?\S)\1/g, '$2')
    .replace(/\{#[\w-]+\}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

export function truncate(text, max = 180) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Text before a `<!--more-->` marker, else the first paragraph. */
export function excerpt(body, max = 180) {
  const src = String(body ?? '');
  const more = src.search(/<!--\s*more\s*-->/i);
  if (more !== -1) return truncate(markdownToText(src.slice(0, more)), max * 2);
  const paragraphs = markdownToText(src).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const first = paragraphs.find((p) => p.length > 40) || paragraphs[0] || '';
  return truncate(first, max);
}

export function wordCount(body) {
  const text = markdownToText(body);
  return text ? text.split(/\s+/).length : 0;
}

export function readingTime(body) {
  return Math.max(1, Math.round(wordCount(body) / 220));
}

/** Normalise a date-ish value to "YYYY-MM-DD" (or "" if unusable). */
export function normalizeDate(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
