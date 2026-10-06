# Apex Genetics

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

| `type` | Section | Layout |
|---|---|---|
| `challenges` | Breeding challenges | article |
| `tutorials` | Tutorials | article |
| `grow-reports` | Grow reports | article |
| `breeding-reports` | Breeding reports | article |
| `plans` | Plans | article |
| `seed-stash` | Seed stash | specimen |
| `mothers` | Mother plants | specimen |
| `cuts` | Cuts | specimen |

Entries appear at `/<section>/<slug>/`. **Article** entries are laid out for reading (title, lede, meta,
then the text). **Specimen** entries (a plant, cut or seed lot) get an image panel and a spec sheet.

Optional front matter, shown on any entry that has it (all of it can also be filled in under
**Plant profile & details** in the admin):

```yaml
strain: Sample Strain
cross: Mother A × Male B
genotype: sativa-dominant
sativa: 70
growth: fast
height: compact, 60-90 cm
branching: heavy lateral
flowering: 8 weeks
tastes: [citrus, pine]
effects: [relaxed, giggly]
smell-in-veg: pine
```

- Identity: `strain`, `cross`, `generation`, `status`, `stage`, `sex`, `quantity`, `source`.
- Genotype: `genotype` takes indica, indica-dominant, balanced hybrid, sativa-dominant or sativa; `sativa`
  (or `indica`) takes an exact percentage.
- Scales, each shown as a 1–5 meter: `growth`, `height`, `branching`, `internodes`, `stretch`, `yield`,
  `resin`. The first word sets the level ("very fast", "heavy lateral", "tight", "low, about 1.5x") and the
  whole value is shown as written.
- Text: `flowering`, `leaves`, `resistance`, `phenotype`.
- Any other key becomes a row of its own: `smell-in-veg: pine` shows as "Smell in veg: Pine".
- Front matter has no comments: everything after the colon is the value.
- The genotype draws an indica–sativa spectrum, and plant entries show a leaf shaped by it: broad leaflets
  for indica, more and narrower ones for sativa. A word places it roughly; only a percentage is printed.
- Scale words are in `lib/profile.js`; values without one (`branching: Christmas tree`, `height: 120 cm`)
  are shown as text.
- Tastes and effects terms are in `lib/traits.js`. Any other word still gets a tile; add or change terms in
  `site.json`: `"traits": { "tastes": { "skunk": { "icon": "wind", "color": "#C9CFD6" } } }`.

Sections are configured in `site.json`: `label`, `short`, `singular`, `blurb`, `icon` (an icon name from
`design/icons`), `color` (the tile color) and `layout` (`article`, the default, or `specimen`).

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
- `design/icons/` + `lib/icons.js`: line icons from [Lucide](https://lucide.dev) (ISC license, see
  `design/icons/LICENSE`), vendored one SVG per icon. To add one, copy its SVG from lucide.dev into the folder.
  `.icon-tile` in `base.css` puts an icon on a colored square (`style="--tile:#hex"`); the preset's
  `tileMix` and `tileInk` tokens decide how the color is used (solid pastel with a black icon in
  `doctorschoice`, a tinted tile with a colored icon in `apex`).
- `theme/logo.svg`: the site's logo mark, drawn in `currentColor`. The build inlines it in the header and
  footer and makes `assets/favicon.svg` from it in the preset's `brand` colors.

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
