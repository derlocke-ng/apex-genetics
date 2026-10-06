# 🌿 Apex Genetics

A personal cannabis breeding website: breeding **challenges**, **tutorials**, **grow reports**,
**breeding reports**, **plans**, the **seed stash**, **mother plants** and **cuts**.
Forked from [derlocke-blog](https://github.com/derlocke-ng/derlocke-blog) (the Kiwi Blog static
generator and browser admin) and redesigned as a website rather than a blog. Static HTML, no
framework, hosted on GitHub Pages.

> The design follows a dark forest-green / cream / gold palette with Fraunces, Inter and JetBrains Mono.
> It is an interpretation, not a copy, of the look of doctorschoice.farm (that site could not be
> fetched while building this). Tweak it in `site.json` under `design`.

## Content

Everything lives in `content/posts/*.md` (edit it in the admin at `/admin/` or by hand). The front matter
`type:` picks the section:

| `type` | Section |
|---|---|
| `challenges` | Breeding challenges |
| `tutorials` | Tutorials |
| `grow-reports` | Grow reports |
| `breeding-reports` | Breeding reports |
| `plans` | Plans |
| `seed-stash` | Seed stash |
| `mothers` | Mother plants |
| `cuts` | Cuts |

Optional spec-sheet fields shown on an entry: `strain`, `cross`, `generation`, `status`, `stage`, `sex`,
`quantity`, `source`, `phenotype`, `flowering`, `yield`. Sections themselves (labels, icons, blurbs) are
configured in `site.json`. Entries appear at `/<section>/<slug>/`.

Other files: `content/home.md` (about block), `content/pinned.md` (highlight on the home page),
`content/pages/*.md` (extra pages such as About).

## Commands

```
npm ci
npm run dev      # local preview with live rebuild
npm run build    # build to dist/
npm test
npm run vault    # set up the admin password (see below)
```

## Shared design template

The look is a reusable template, so [derlocke-blog](https://github.com/derlocke-ng/derlocke-blog) can use it too:

- `lib/design.js`: `createDesign({ preset, tokens, light, fonts })` returns the CSS variables for dark and
  light mode, the Google Fonts URL and the `theme-color` values. Presets: `apex` and `terminal`.
- `design/base.css`: neutral components (header, footer, buttons, cards, chips, prose, code) that only use those variables.

To reuse it, copy those two files into the other project, prepend `createDesign(...).css` to `base.css`
in its build step (see `build.js`), put `design.fontsUrl` into the layout, and add site-specific CSS
afterwards (`theme/style.css` here). Override colors or fonts per site via `site.json`:

```json
"design": { "preset": "terminal", "tokens": { "accent": "#6c9fd1" }, "fonts": { "display": { "family": "Lora", "weights": "600" } } }
```

## Admin

`/admin/` lets you write and publish entries from the browser (every save is a git commit). Run
`npm run vault` to encrypt a fine-grained GitHub token for this repository behind a password; it writes
`admin/vault.json`.

## License

MIT
