# 🌿 Apex Genetics

A personal cannabis breeding website: breeding **challenges**, **tutorials**, **grow reports**,
**breeding reports**, **plans**, the **seed stash**, **mother plants** and **cuts**.
Forked from [derlocke-blog](https://github.com/derlocke-ng/derlocke-blog) (the Kiwi Blog static
generator and browser admin) and redesigned as a website rather than a blog. Static HTML, no
framework, hosted on GitHub Pages.

> Two looks ship with the site; pick one with `design.preset` in `site.json`:
>
> - **`apex`** (default): deep forest green and warm ivory with champagne-gold accents, Fraunces headings and
>   Inter text. Hairline borders, quiet surfaces, gold only for small accents. Light mode is a cream paper.
> - **`doctorschoice`**: modelled on [doctorschoice.farm](https://doctorschoice.farm/). A 122px black header that
>   scrolls away, with white bold caps links and a 4px `#FF0000` bar on hover; black hero and footer with white
>   copy; a white page with black text (`#2A2A2A` for secondary text); `#FF0000` square markers and primary
>   buttons (`#C00712` on hover and for red text); `#E6E6E6` media panels, `#F8F5EF` bands, `#C8C8C8` only for
>   attributes on black; bold uppercase Montserrat, 2px outlines and hovers that fill black. Only the look is
>   reproduced, none of that site's logos, photos or text.
>
> Every entry page is laid out like a doctorschoice.farm product page: specimen panel (edge to edge on phones),
> then breadcrumb, title, lede, spec rows, the cross, tags, actions and date, and the description below a
> full-width divider, followed by related entries.

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
  light mode, the Google Fonts URL, the `theme-color` values and the preset's `skin` name. Presets: `apex`,
  `doctorschoice` (light page) and `terminal`. Besides the core palette there are optional tokens: `band`
  (alternate section background), `marker` (small squares and dots), `placeholder` (media panels), `ok`
  (status) and `hd*` (header, hero and footer bars). Font roles: `display`, `body`, `label` (eyebrows, chips,
  meta) and `mono`.
- `design/base.css`: neutral components (header, footer, buttons, cards, chips, prose, code) that only use those variables.
- `design/skins/<preset>.css` (optional): preset-specific restyling, loaded last. `doctorschoice` has one;
  `apex` is simply the neutral look.

`design/base.css` and `theme/style.css` must not hard-code colors (a test enforces it), so every preset renders
correctly from its tokens. Put anything that only makes sense for one preset into that preset's skin.

To reuse it, copy those files into the other project, prepend `createDesign(...).css` to `base.css`
in its build step (see `build.js`), put `design.fontsUrl` into the layout, add site-specific CSS
afterwards (`theme/style.css` here) and append `design/skins/${design.skin}.css` if it exists. Override colors or fonts per site via `site.json`:

```json
"design": { "preset": "terminal", "tokens": { "accent": "#6c9fd1" }, "fonts": { "display": { "family": "Lora", "weights": "600" } } }
```

## Admin

`/admin/` lets you write and publish entries from the browser (every save is a git commit). Run
`npm run vault` to encrypt a fine-grained GitHub token for this repository behind a password; it writes
`admin/vault.json`.

## License

MIT
