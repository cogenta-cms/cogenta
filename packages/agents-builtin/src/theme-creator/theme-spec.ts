/**
 * The structure and composition of a Cogenta theme, as one standing
 * specification handed to the model in the system prompt's own
 * `<specification>` section (`assembleContext`, `@cogenta/agents`).
 *
 * **Why this file exists.** Every fact below already existed — scattered
 * across `theme.write_sandbox_file`'s tool `description`, a 311-line
 * `identity.md` no admin flow ever loads, and the contract D docs. A live
 * report ("I attach a screenshot and what comes back is nowhere near it")
 * traced back to that scattering: a tool description is read as API
 * reference for one call, not as standing knowledge about what is being
 * built, and the writer agent's actual system prompt was a one-sentence role
 * plus ten bullets. The tool description keeps only what belongs to the
 * tool (its arguments and what it rejects); everything about what a theme
 * *is* lives here.
 *
 * **The palette rule reversed, deliberately.** The previous brief told the
 * model "colour/font/spacing VALUES are not invented here — reference
 * --cogenta-*". Those custom properties are generated exclusively from the
 * *site's* skin (`theme-wiring.ts`'s `computeEffectiveStyles`), so a theme
 * asked to reproduce a specific design was structurally repainted in
 * whatever palette the site already had — the single largest cause of "far
 * from the screenshot", and no amount of layout accuracy could compensate.
 * A theme's own stylesheet is emitted *after* the skin stylesheet
 * (`joinStyles`, `theme-render.ts`), so a theme can and should carry its own
 * design palette. The namespaced pattern below keeps the site's brand colours
 * reachable rather than simply overwriting `--cogenta-*` at `:root`, which
 * would silently disable the operator's own colour controls.
 */
export const COGENTA_THEME_SPECIFICATION = `
A Cogenta theme is a small ES module package that turns a page's stored
content into HTML, plus the CSS that makes that HTML look like a design. It
runs server-side, per request. It has no build step: files are loaded with a
plain \`import()\`, so there is no JSX, no TypeScript compilation, no bundler.

## The files

A complete theme is three things. None is optional if the theme is meant to
look like anything.

1. \`theme.config.{js,mjs,ts}\` — the contract D manifest.
2. \`theme.render.{js,mjs,ts}\` — \`renderPage\` and \`renderChrome\`.
3. At least one \`.css\` file — any name, any number. Every \`.css\` at the
   theme root is picked up automatically and concatenated in filename order.

\`.tsx\` and \`.jsx\` are refused: nothing transforms JSX here. Write
\`h(tag, attrs, ...children)\` calls instead, whichever extension you choose.

## theme.config.*

\`export default defineTheme({...})\` from '@cogenta/theme-kit', with exactly
these fields:

- \`name\`: string
- \`version\`: exact semver, e.g. '1.0.0'
- \`engine\`: a semver RANGE, e.g. '^1.0.0' — never prose
- \`blocks\`: a semver RANGE too, e.g. '^1.0.0' — the block-vocabulary
  version, NEVER a list of block names
- \`implements\`: string[] — the block \`_type\` names \`renderPage\` really
  handles, e.g. ['hero','collectionList','prose']
- \`collections\`: string[] or '*'
- \`runtime\`: exactly one of 'static' | 'server' | 'edge'
- \`tokens\`: a STRING path, e.g. './theme.tokens.json' — never inline data

## theme.render.*

A real ES module exporting two functions, both building markup with \`h()\`
from '@cogenta/theme-kit'. \`h(tag, attrs, ...children)\` returns an
HtmlElement tree; the pipeline calls \`serialize()\` on what you return, and
it understands only that tree or a plain string.

\`renderChrome(input)\` returns \`{ header, footer }\` as HTML **strings**.
\`input\` is \`{ site: {name,url,locales,defaultLocale}, locale, homeHref,
headerNav: [{label,href}], footerNav, brandingHtml, tagline?, social?,
footerNote?, headerAction? }\`.

\`renderPage(page, ctx, entries)\`:
- \`page\`: \`{ title, blocks: Array<{_key, _type, ...fields}> }\` — the real
  saved contract B blocks.
- \`ctx\`: \`{ site, locale, url, t(key,vals), image(mediaId,opts),
  link(target), content: {entry,byPath,list} }\`.
- \`entries\`: fetched \`collectionList\` results, keyed by \`block._key\`.

Design freedom is total, like a WordPress theme: fetch whatever you need
through \`ctx.content\`, place it anywhere, invent your own block types. A
page's \`blocks\` list is one available data source, never a required
structure. The shared vocabulary (hero, prose, mediaFigure, featureGrid, cta,
gallery, quote, faq, stats, logos, collectionList, embed, testimonial,
pricingTable, accordion, statCounter, logoStrip) exists so content already
composed with those still shows something — implementing all of them is never
required. But a block type you do not specifically style must still render
plainly rather than vanish: never drop content a page actually has.

There is no access to token VALUES from render code. \`ctx.theme.tokens\` does
not exist. Render code emits semantic HTML with class names; CSS does the
rest.

## The CSS, and where colour actually comes from

This is where a design succeeds or fails. Markup structure alone renders as
unstyled text, every time.

Two stylesheets reach the page, in this order: the **site skin** first, then
**this theme's CSS**. Later wins at equal specificity, so a theme can define
its own design language and does not merely decorate the site's.

The site skin publishes these custom properties on \`:root\`:
\`--cogenta-color-bg/fg/accent/accent-fg/muted/muted-fg/border\`,
\`--cogenta-font-sans/serif/mono\`,
\`--cogenta-font-size-xs/sm/md/lg/xl/2xl/3xl\`, \`--cogenta-space-unit\`,
\`--cogenta-radius-sm/md/lg\`, \`--cogenta-shadow-sm/md\`.

**Own your palette.** When the request describes or shows a specific design,
that design's colours, type and spacing are the point — reproducing them is
the job. Define them as your own namespaced custom properties, derived from
what the request actually shows, and build every rule on those:

\`\`\`css
:root {
  --t-bg: #0e1013;
  --t-surface: #171a1f;
  --t-fg: #f2f4f7;
  --t-muted-fg: #98a1ad;
  --t-accent: #3ddc84;
  --t-accent-fg: #06210f;
  --t-border: #262b33;
  --t-radius: 14px;
  --t-display: "Fraunces", Georgia, serif;
  --t-body: "Inter", system-ui, sans-serif;
  --t-step: 8px;
}
\`\`\`

Prefix them with something short and specific to the theme. Do **not**
redefine \`--cogenta-*\` at \`:root\`: those are the operator's own colour
controls in the Appearance screen, and overwriting them silently disables
that feature. When a value should follow the site's brand instead of the
design, read the site variable directly, or use it as the fallback:
\`color: var(--cogenta-color-accent, var(--t-accent));\`.

Literal colours are allowed and expected in a theme's own stylesheet.
**Gradients are not** — flat, structured surfaces only, no
\`linear-gradient\`/\`radial-gradient\` anywhere. Use flat fills, borders and
spacing to build hierarchy.

Google Fonts may be pulled with an \`@import\` at the very top of a CSS file;
always give a real fallback stack.

## Light and dark

Themes are expected to work in both. The site stamps \`data-theme="dark"\` or
\`data-theme="light"\` on the root element when a visitor chooses explicitly,
and stamps nothing on the default "system" setting — where only
\`prefers-color-scheme\` separates them. Define the complete palette on bare
\`:root\`, then redefine only the tokens in two more blocks:

\`\`\`css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --t-bg: #0e1013; --t-fg: #f2f4f7; }
}
:root[data-theme="dark"] { --t-bg: #0e1013; --t-fg: #f2f4f7; }
:root[data-theme="light"] { --t-bg: #ffffff; --t-fg: #14171c; }
\`\`\`

Never give a colour its only definition inside a media or \`[data-theme]\`
block — it then never applies in the unstamped state, and the page renders
one theme's text on the other theme's background.

A theme that deliberately commits to a single look may skip those blocks, but
must still paint background and text colours explicitly.

## Two things the page always has

The host page template injects both on every page, whatever the theme, so
every theme must account for them:

1. **A "Skip to content" link**, \`.cg-skip-link\`, placed before your header
   markup (WCAG 2.4.1). Style it off-screen until focus — never
   \`display: none\`, which removes it from the tab order and defeats its
   purpose. Without a rule for it, it renders as a plain visible link at the
   very top of every page:

\`\`\`css
.cg-skip-link { position: absolute; left: 1rem; top: -4rem; z-index: 50;
  padding: .6em 1.1em; background: var(--t-accent); color: var(--t-accent-fg);
  border-radius: 999px; text-decoration: none; transition: top 160ms ease; }
.cg-skip-link:focus-visible { top: 1rem; }
\`\`\`

2. **The light/dark toggle script.** The host injects the script; a theme only
   ever places the button, via \`renderThemeToggle()\` from
   '@cogenta/theme-kit', inside its own \`renderChrome\` markup. Never inject
   the script yourself, and never write client JavaScript of your own —
   themes are zero-JS apart from that one host-provided toggle.

## A theme displays the site's content. It never contains content.

This is the rule that separates a theme from a mockup, and breaking it
produces something that looks finished and is unusable.

Everything a visitor reads — article titles, excerpts, dates, menu labels,
page copy — comes from the site's database at render time, through the page
you were handed and through \`ctx.content\`. A theme that hardcodes three
article cards in \`renderPage\` produces a site whose owner cannot edit those
articles from the admin, cannot translate them, cannot add a fourth, and
cannot delete the one that is wrong. It is not a shortcut; it is a site that
does not work.

Concretely, and without exception:

- **Never invent posts, titles, excerpts, author names, dates or prices.** If
  a list should show articles, fetch them:
  \`const posts = await ctx.content.list({ collection: 'article', limit: 6 })\`
  and render what comes back — however many that is, including none.
- **Never write \`href="#"\`.** A link goes where the content says it goes:
  \`ctx.link({ collection: entry.collection, id: entry.id })\` for an entry,
  \`input.headerNav\`/\`input.footerNav\` in \`renderChrome\` for navigation.
  A \`#\` is a dead link shipped to a real visitor.
- **Never hardcode display text.** Labels a theme itself owns ("Read more",
  "Next") go through \`ctx.t('readMore', { default: 'Read more' })\`, so a
  site in another language is not stuck with English baked into its layout.
- **An empty list renders as an empty state**, not as invented filler. A site
  with no articles yet must show that honestly.

A design shows three cards; the theme's job is a card *component* and a grid
that renders however many entries exist. Design the container, never the
contents.

**The preview you get back is sample data.** \`theme.preview_sandbox\` renders
your theme against a fixed demo page so you can see structure and styling —
those titles and excerpts are scaffolding for the preview, not content to
copy into your code. If you find yourself typing a title you saw in a
preview, that is the mistake this section exists to prevent.

## Images

A photograph the request calls for is a real \`url()\` or \`<img>\`, resolved
through \`ctx.image(mediaId)\` for uploaded media or pointing at a real asset
path. A flat colour block standing in for a photo the brief asked for is a
failure to deliver the design, not a simplification.

## What "matching a design" means here

Colour is the easiest half and the least of it. When a reference is given,
reproduce, in this order of importance: the **layout skeleton** (how the page
divides into regions, what is full-bleed vs contained, the grid and column
counts), the **spacing rhythm and density**, the **typographic scale and
pairing** (display vs body face, weights, letter-spacing, how large the
biggest thing actually is relative to body text), the **shape language**
(corner radius, borders, elevation, how flat or how carved), and only then
the palette. A theme with the right palette and the wrong skeleton does not
resemble the reference; the reverse mostly does.
`.trim()
