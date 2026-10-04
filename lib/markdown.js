// Markdown rendering shared by the build (Node) and the admin preview (browser).
// The caller passes in marked's `Marked` class so this file has no imports
// that differ between the two environments.

import { slugify, escapeHtml } from './content.js';

const CUSTOM_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

/**
 * @param {typeof import('marked').Marked} Marked
 * @param {{ highlight?: (code: string, lang: string) => string | null }} [options]
 *   `highlight` returns highlighted HTML, or null to fall back to escaped text.
 * @returns {(md: string) => { html: string, toc: {id: string, text: string, depth: number}[] }}
 */
export function createMarkdown(Marked, { highlight } = {}) {
  let state = { ids: new Map(), toc: [] };

  const uniqueId = (base) => {
    const id = base || 'section';
    const n = state.ids.get(id) || 0;
    state.ids.set(id, n + 1);
    return n ? `${id}-${n}` : id;
  };

  const marked = new Marked({
    gfm: true,
    hooks: {
      preprocess(md) {
        state = { ids: new Map(), toc: [] };
        return md;
      },
    },
    walkTokens(token) {
      // Pandoc-style explicit heading ids: "## Kiwi Network {#kiwi-network}"
      if (token.type !== 'heading') return;
      const m = token.text.match(CUSTOM_ID);
      if (!m) return;
      token.customId = m[1];
      token.text = token.text.replace(CUSTOM_ID, '');
      const last = token.tokens && token.tokens[token.tokens.length - 1];
      if (last && last.type === 'text') {
        last.text = last.text.replace(CUSTOM_ID, '');
        last.raw = last.raw.replace(CUSTOM_ID, '');
      }
    },
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        const text = inner.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
        const id = uniqueId(token.customId || slugify(text));
        if (token.depth === 2 || token.depth === 3) state.toc.push({ id, text, depth: token.depth });
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        const highlighted = highlight ? highlight(text, language) : null;
        const body = highlighted ?? escapeHtml(text);
        const attr = language ? ` data-lang="${escapeHtml(language)}"` : '';
        const cls = language ? ` class="hljs language-${escapeHtml(language)}"` : ' class="hljs"';
        return `<pre${attr}><code${cls}>${body.replace(/\n$/, '')}</code></pre>\n`;
      },
      image({ href, title, text }) {
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t} loading="lazy" decoding="async">`;
      },
    },
  });

  return function render(md) {
    const html = marked
      .parse(String(md ?? ''))
      .replace(/<table>/g, '<div class="table-wrap"><table>')
      .replace(/<\/table>/g, '</table></div>');
    return { html, toc: state.toc };
  };
}

/**
 * Rewrite site-absolute URLs (href="/x", src="/x") so they work wherever the
 * site is hosted: relative for normal pages, absolute for feeds and 404s.
 */
export function rewriteRootUrls(html, root) {
  return html.replace(/(\s(?:href|src|poster)=["'])\/(?!\/)/g, `$1${root}`);
}
