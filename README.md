# 🖥️ derlocke.net Blog

A personal blog built on **Kiwi Blog 2**, a small, fast static blog generator with a
browser-based admin panel. It's made for free hosting on GitHub Pages.

**Live:** [derlocke.net](https://derlocke.net) · **Admin:** [derlocke.net/admin/](https://derlocke.net/admin/)

## ✨ Features

**For readers**
- ⚡ **Fast:** plain static HTML, one CSS file (~7 KB gzipped) and ~3 KB (gzipped) of vanilla JS. No framework, no tracking.
- 📄 **One page per post** with clean URLs (`/posts/my-post/`), table of contents, reading time and older/newer links
- 🔍 **Archive with full-text search** and tag filtering (shareable: `archive.html?tag=linux&q=wireguard`)
- 🎨 **Syntax highlighting** (at build time), copy buttons on code blocks, heading anchors
- 🌙 **Dark mode by default**, light mode toggle (no flash on load)
- 📡 **RSS feed**, sitemap, Open Graph tags, canonical URLs, terminal-style 404 page
- 📱 Responsive and accessible (skip link, keyboard focus, reduced-motion support)

**For you (the author)**
- 🔐 **Admin panel at `/admin/`**, unlocked with a single password: write, edit, rename and delete posts and pages, then publish with one click
- 👀 **Live preview** that looks exactly like the site, with a split view on desktop and tabs on mobile
- 🖼️ **Image upload**: paste, drop or pick images. They're resized and converted to WebP automatically.
- 💾 **Drafts & scheduled posts**: `draft: true`, or a future date that goes live on the daily rebuild
- 🛟 **Safe editing**: unsaved work is kept locally, you're warned before overwriting changes made elsewhere, and every save is a git commit with full history
- 🚦 **Deploy status** shows when your change is live
- 🧪 Tests run before every deploy, so a broken build never goes live

## 🧠 How it works

```
 you ──▶ /admin/ ──(GitHub API, your token)──▶ commit to main
                                                    │
                       GitHub Actions: npm test + npm run build
                                                    │
                                   GitHub Pages ◀── dist/
```

GitHub Pages only serves static files, so the admin panel talks **directly to the GitHub API
from your browser**. Saving a post creates a commit. That triggers the existing deploy workflow,
which rebuilds the site in about a minute. There's no server, no database and nothing to pay for.

Anyone can open `/admin/`, but it's useless without the admin password, which unlocks an encrypted
GitHub token, or a GitHub token with write access to this repository.

## 🔐 Setting up the admin

1. **Pages must deploy from Actions:** in the repo, go to *Settings → Pages → Build and deployment → Source* and pick **GitHub Actions**.
2. **Create a token:** go to [GitHub → Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
   - *Repository access:* **Only select repositories** → `derlocke-ng/derlocke-blog`
   - *Permissions:* **Contents → Read and write** (required) and **Actions → Read** (optional, for the deploy status)
   - Pick an expiry date you're comfortable with. You can create a new token any time.
3. **Set an admin password**, using either method:
   - **In the browser:** open `https://derlocke.net/admin/`, choose *Sign in with a GitHub token*, paste the token, then go to **Settings → Admin password** and save a password.
   - **On your computer:** run `npm run vault`, paste the token, choose a password, then commit and push `admin/vault.json`.

From then on, `/admin/` only asks for the **password**, on any device.

### How the password unlock works

Your token is encrypted **in your browser** (or by `npm run vault`) with AES-256-GCM. The key is
derived from your password with 1,000,000 rounds of PBKDF2-SHA256. Only the encrypted result is
committed to the repo as `admin/vault.json`, and the plain token is never stored there. Entering
the password decrypts the token locally, and it is only ever sent to `api.github.com`.

⚠️ **The encrypted file is public**, so anyone can download it and try to guess the password
offline, where no rate limit applies. The password is the *only* protection:

- Use a **long, unique** password. The *Generate* button makes a random ~140-bit one; keep it in a password manager.
  Short or reused passwords are rejected, but "strong enough for the checker" is not the same as strong.
- Keep the token **scoped to this one repository** with only the permissions above, and give it an **expiry**.
  Then even a leaked token can only touch this blog, and only until it expires. Revoke it on GitHub if in doubt.
- If you forget the password, sign in with a token and save a new password. When the token expires,
  sign in with a new token and save the password again; this re-encrypts the new token.

Unless you tick *Stay signed in*, the unlocked token only lives in that browser tab. Sign out from **Settings**.

> Because the admin runs on the same origin as the blog, don't add untrusted third-party
> `<script>`s to the theme.

## 🚀 Local development

Requires **Node.js 20+**. You only need it to preview locally; the live site builds on GitHub.

```bash
npm install
npm run dev      # http://localhost:8000, rebuilds and reloads on every change, shows drafts
npm run build    # production build into dist/
npm test         # unit tests + build + broken-link check
npm run vault    # encrypt your GitHub token with an admin password -> admin/vault.json
```

## ✍️ Writing posts

Use the admin, or add a Markdown file to `content/posts/`. The file name is the URL slug:

```markdown
---
title: Self-Hosting a WireGuard VPN
date: 2025-09-15
tags: [networking, homelab, tutorial]
description: Optional summary for the home page, search engines and RSS.
draft: false
---

Your post in **Markdown**: lists, tables, `code`, fenced code blocks with syntax
highlighting, images, blockquotes…

<!--more-->

Everything above `<!--more-->` (optional) becomes the excerpt.
```

| Field | Meaning |
|---|---|
| `title` | Post title (required) |
| `date` | `YYYY-MM-DD`. A future date means the post is *scheduled*: it's published by the daily rebuild on that day. |
| `tags` | List of tags, shown as chips and filters in the archive |
| `description` | Optional summary. Defaults to the first paragraph. |
| `draft` | `true` keeps the post off the live site. It's still visible in `npm run dev`. |

Old Kiwi Blog posts (`# Title` / `**Date:**` / `**Tags:**` header) still work.

**Links and images:** write site-absolute paths like `/posts/other-post/`, `/archive.html` or
`/media/2026/photo.webp`. They're rewritten so they work however the site is hosted.
`## Heading {#custom-id}` sets an explicit anchor id.

## 📄 Pages, home & settings

| What | Where |
|---|---|
| Static pages (`/projects.html`, …) | `content/pages/*.md`. Front matter: `title`, `menu: true`, `order: 1`, `description`, `draft` |
| Home page intro | `content/home.md` |
| Pinned notice on the home page | `content/pinned.md` (empty = hidden) |
| Images & files | `public/media/` → served at `/media/…` |
| Anything served as-is (`CNAME`, `bg.jpg`, favicons…) | `public/` |
| Site title, URL, prompt, project dock, footer, extra menu links | `site.json` |

All of these can be edited from the admin. `site.json` looks like this:

```jsonc
{
  "title": "derlocke.net",
  "description": "…",
  "url": "https://derlocke.net",          // used for RSS, sitemap & canonical links
  "language": "en",
  "prompt": { "command": "cd", "path": "/var/home/derlocke" },
  "homePosts": 10,                          // posts listed on the home page (0 = all)
  "nav": [],                                // extra menu links: { "label": "…", "url": "…" }
  "dock": { "label": "Projects:", "links": [{ "label": "🥝 Kiwi", "url": "/projects.html#kiwi-network" }] },
  "footer": "© {year} derlocke.net · …",   // HTML allowed
  "repo": { "owner": "derlocke-ng", "name": "derlocke-blog", "branch": "main" }
}
```

## 📁 Structure

```
├── content/
│   ├── posts/*.md        blog posts
│   ├── pages/*.md        static pages
│   ├── home.md           home page intro
│   └── pinned.md         pinned notice
├── public/               copied to the site root (CNAME, bg.jpg, media/)
├── theme/
│   ├── layout.html       page shell (header, menu, dock, footer)
│   ├── style.css         all styling
│   └── site.js           front-end behaviour
├── admin/                the admin panel (vanilla JS, no build step)
├── lib/                  markdown, front matter & vault code shared by build and admin
├── scripts/vault.js      creates admin/vault.json (npm run vault)
├── build.js              the generator (~400 lines)
├── dev.js                local preview server
├── test/                 node:test suites (run in CI before deploying)
└── site.json             site configuration
```

Runtime dependencies: none. Build dependencies: [`marked`](https://marked.js.org) and
[`highlight.js`](https://highlightjs.org).

## 🎨 Customization

- **Look & feel:** `theme/style.css`. Colours are CSS variables at the top.
- **Markup:** `theme/layout.html` holds the page shell. Post, archive and card markup live in `build.js`.
- **Background:** replace `public/bg.jpg`.
- **Custom domain:** `public/CNAME`, plus *Settings → Pages → Custom domain*.

## 📜 License

MIT License. Based on [Kiwi Blog](https://github.com/derlocke-ng/kiwi-blog).

---

Made with 🖥️ and too much coffee.
