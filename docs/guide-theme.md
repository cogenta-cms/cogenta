# Writing a Cogenta theme

This guide is for a developer who wants to write a theme by hand — no AI
generator involved — and drop it into a site's own project. It is
independent documentation, on the model of [`docs/guide-plugin.md`](guide-plugin.md):
a theme built this way needs nothing from Cogenta's AI theme creator, and
everything below works identically whether a human or an agent produced the
files.

If you are looking for the AI-assisted path (the "Generate a theme" admin
screen), that is documented elsewhere; this guide covers the underlying
mechanism it writes into, not the assistant itself.

## What this guide covers, and what it doesn't yet

Fiche 73 (`docs/plans/73-themes-locaux-bac-a-sable-ia.md`) is building, in
order: (1) a theme dropped into a site's own `themes/` folder becoming
activable — **done, this guide documents it** — then (2) an isolated
sandbox with a live preview, (3) a deploy pipeline with a loud validation
screen, (4) timestamped version backups, (5) an AI generation tool writing
into that sandbox, and (6) zip export/import. None of (2)–(6) exist yet.
Today, a theme dropped into `themes/` is picked up **silently** — a
malformed one is simply left out of the theme gallery rather than shown a
reason why (task 5's job, not this one). Test your theme by actually
opening the site rather than trusting a "success" message that does not
exist yet.

## Why it works this way

A theme is code that runs inside `cogenta serve`'s own process — not a
sandboxed subprocess, not a worker. That is a real constraint, not an
oversight: full execution isolation (time and memory limits, a hard
boundary against reading `process.env` or the database directly) is
`@cogenta/plugins`' `worker_threads`/`vm` machinery, and adapting it to
produce a serializable render tree is fiche 73's biggest open technical
question, still unresolved. Until it lands, a theme's protection is a
**static scan**, not a runtime sandbox — see
[ADR-0034](adr-0034-draft.md) ("un thème peut venir d'un dossier local au
projet") for the decision this rests on, and the honest caveat it names in
its own "point de vigilance": *this is real protection against the most
obvious attack class, not execution isolation*.

Concretely, before your `theme.render.*` file is ever `import()`ed,
`verifyTheme` (`@cogenta/render`) statically inspects its imports and
refuses — never warns — a theme that reaches for:

- a Node builtin that touches the filesystem, a process, or the network:
  `node:fs`, `node:child_process`, `node:net`, `node:http`, `node:https`,
  `node:dgram`, `node:worker_threads`, `node:vm`, `node:process`;
- `@cogenta/core` or `@cogenta/schema` directly (the database and secrets
  live behind those, and a theme has no legitimate reason to import them —
  see R5 below);
- any database driver package;
- CommonJS `require`, a dynamic `import()` the scanner cannot statically
  read, or a `package.json` alias trick (`imports`/`dependencies`) meant to
  smuggle a forbidden specifier past the scan.

This is the same rule a theme published as an npm package has always had to
pass at install time (ADR-0004, ADR-0016). A theme dropped into `themes/`
now has to pass it too — it just happens once, at boot, instead of once, at
`npm install`.

**R5** is the rule this whole design serves: *"Le code de thème ne touche
jamais la base ni les secrets. Il ne dispose que du `RenderContext` et d'un
client HTTP à jeton restreint."* Everything your theme is handed —
`RenderContext`, `PageContent`, `ChromeInput` — is already-resolved data.
There is no path from inside a theme back to the database, and the scan
above exists to keep it that way even against a theme that tries.

## The manifest

Every theme — npm-packaged or local — declares itself with a
`theme.config.{js,mjs,ts}` file exporting `defineTheme({...})`
(`@cogenta/theme-kit`, re-exporting `@cogenta/render`'s own, already-
validated definition — contract D, unchanged by any of this):

```ts
import { defineTheme } from '@cogenta/theme-kit'

export default defineTheme({
  name: 'my-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^2.0.0',
  implements: [
    'hero', 'prose', 'mediaFigure', 'featureGrid', 'cta', 'gallery',
    'quote', 'faq', 'stats', 'logos', 'collectionList', 'embed',
    'testimonial', 'pricingTable', 'accordion', 'statCounter', 'logoStrip',
  ],
  collections: '*',
  runtime: 'server',
  tokens: './theme.tokens.json',
  description: 'A theme dropped straight into themes/, no npm package.',
  author: 'You',
})
```

`implements` must cover contract B's full seventeen-block vocabulary
(`blocks@2.0`) — a theme that omits one fails `verifyTheme`'s own
`THEME_BLOCK_MISSING` check and is left out of the gallery, same rule an
npm-packaged theme has always had to meet. If your layout genuinely has
nothing distinct to say for a block (say, `logoStrip`), implement it
plainly rather than skip it — a block a theme drops is content an editor
loses the moment they switch to it.

`tokens` names a `theme.tokens.json` beside the manifest — the same colour
token file every theme already reads via `@cogenta/render`'s `renderSkin`.
Nothing about that changes for a local theme.

## The render module: `theme.render.{js,mjs,ts}`

This is the new file, required beside the manifest, that a filesystem
theme adds. It exports the same shape `ThemeModule` has always required:

```ts
renderPage(page, ctx, entries?, registry?): HtmlElement
renderChrome(input): ChromeResult
// optional:
renderTermArchive?(input): HtmlElement
```

### `renderPage`

```ts
import { h, type HtmlElement, type PageContent, type RenderContext, type FetchedEntries } from '@cogenta/theme-kit'

export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
): HtmlElement {
  return h(
    'main',
    { class: 'my-main' },
    h('h1', {}, page.title),
    page.blocks.map((block) => renderBlock(block, ctx, entries)),
  )
}
```

- `page.blocks` is `readonly VocabularyBlock[]` (contract B) — write an
  **exhaustive** `switch` over `block._type` so a future eighteenth block
  fails to compile until you handle it, the same discipline
  `@cogenta/theme-canonical`'s own `render-block.ts` follows. A block your
  theme does not implement directly but that carries a `fallback` can be
  resolved through `resolveBlockForRender` (`@cogenta/theme-kit`) rather
  than dropped — the anti-lock-in half of contract B (fiche 43).
- `ctx: RenderContext` is the **only** door to data: `ctx.content`
  (read-only entry/list access), `ctx.image()` (responsive image variants),
  `ctx.link()` (locale-aware URLs), `ctx.t()` (translation). There is no
  database handle, no secret, nothing else — R5, structurally, not by
  convention.
- `entries` holds whatever a `collectionList` block on the page already
  fetched, keyed by the block's `_key` — fetched **before** any markup is
  built, so your renderer never awaits mid-render.
- Stamp `data-block-key` on each block's root element with `withBlockKey`
  (`@cogenta/theme-kit`) — this is what lets the visual page builder (L16)
  map a clicked element in its iframe back to the block that produced it.
  Every built-in theme does this on every render, not only in a "builder
  mode".
- A page has exactly one `<h1>`. `pageHasOwnHeading(page.blocks)` is `true`
  when a `hero` is present (a hero renders its own `h1`) — write your own
  title heading only when it's `false`.

### `renderChrome`

```ts
import type { ChromeInput, ChromeResult } from '@cogenta/theme-kit'

export function renderChrome(input: ChromeInput): ChromeResult {
  return {
    header: `<header>...</header>`,
    footer: `<footer>${input.brandingHtml}</footer>`,
  }
}
```

Your theme owns its own `<header>`/`<footer>` markup entirely — `cogenta
serve` only ever hands you resolved data (`headerNav`, `footerNav`,
`brand`, `tagline`, `social`, `footerNote`, `headerAction`) and one
pre-escaped fragment, `brandingHtml`, that you place somewhere in your
footer but must never alter or drop — it is Cogenta's own credit or its
white-label replacement, a site-wide setting no theme reinterprets.
`@cogenta/theme-kit` ships `renderBrandMark`/`renderSocialLinks` helpers so
you are not redrawing the logo `<picture>` fallback or five platforms'
worth of icon glyphs from scratch.

Every string field you compose into HTML by hand (not through `h()`) is
yours to escape — `escapeText`/`escapeAttribute` (`@cogenta/theme-kit`).
Contract B and this whole render path assume a theme never stores raw HTML
in a block (R3); the same rule applies to how a theme writes its *own*
markup here.

## Where the file goes, and how `cogenta serve` finds it

```
<projectRoot>/
  themes/
    my-theme/
      theme.config.mjs
      theme.render.mjs
      theme.tokens.json
```

`cogenta serve` (`runServe`) calls `configureThemeRegistry({ projectRoot })`
once at boot — the same "site owns its own TypeScript, dynamically
imported" pattern `cogenta.schema.ts` has followed since L2. From then on,
activating a theme by name (from the appearance screen, or a stored
`activeTheme`) tries, in order:

1. the built-in, npm-packaged themes (`@cogenta/theme-canonical` and the
   others `@cogenta/cli` ships as a dependency) — unchanged, byte for byte;
2. `<projectRoot>/themes/<name>/`, loaded via `loadTheme`
   (`@cogenta/render`) with its static security scan turned on;
3. the default theme, as the fallback for anything that fails either of
   the above.

Three consequences worth knowing before you rely on them:

- **A `themes/` folder never shadows a built-in theme of the same name.**
  If you name your local theme `canonical`, the real, built-in canonical
  theme still wins — your folder is silently ignored, not merged with it,
  not preferred over it.
- **A missing manifest, a missing render module, or a render module that
  does not export `renderPage`/`renderChrome` as functions all fail the
  same way: silently left out of the gallery, and a stored `activeTheme`
  naming it falls back to the default theme rather than crashing every
  request.** R1/R2 — an optional feature never takes a whole site down —
  but it also means nothing tells you *why* your theme did not appear.
  Until fiche 73's task 5 ships a real validation screen, the way to debug
  a theme that "does not show up" is to run `cogenta serve` and watch its
  own log for the swallowed error, or temporarily call `loadTheme` yourself
  with `verify: true` against your `themes/<name>/` folder in a scratch
  script.
- This lookup is **opt-in**: it only activates once `configureThemeRegistry`
  has been called. Every existing caller that never calls it — every test,
  `cogenta skin generate`, any host embedding `@cogenta/cli` that has not
  adopted this yet — sees exactly the pre-fiche-73 built-in-only behaviour.

## A real, tested reference implementation

`@cogenta/theme-canonical`'s own source
(`packages/theme-canonical/src/render/render-block.ts`,
`packages/theme-canonical/src/render/chrome.ts`) is the actual, shipping
`h()`-based implementation this mechanism runs today — every built-in
theme (`theme-blog`, `theme-saas`, `theme-portfolio`, and the rest) follows
the same shape. Read one of those before writing your own; they are the
closest thing to a worked example this guide can point to.

**`examples/theme-starter/` is not that reference, and using it as one will
mislead you.** It is a real, tested example — but it targets a different,
still-deferred pipeline: its manifest declares `runtime: 'static'` and its
block components are `.astro` files, built against the eventual `cogenta
build`/`theme` Astro pipeline (`docs/02-architecture.md`, honestly
documented as not yet built since L9). That pipeline's `RenderContext` is a
*different* shape — nested `.values`, full `MediaReference` objects — from
the flat, string-keyed one `cogenta serve` actually hands your
`theme.render.*` file today (`@cogenta/theme-kit`'s own `contract.ts`
documents this split explicitly, and why the two were never unified: doing
so would change live SSR behaviour for a pipeline nothing serves through
yet). Until fiche 73's own starter template exists (a later, undecided
task), `theme-canonical`'s real source is the accurate reference — not
`theme-starter`.

## What's still missing

- No sandbox or live preview yet — you test a local theme today by
  activating it and reloading the actual site (tasks 3–4).
- No loud validation screen — a malformed theme is silently skipped, not
  explained (task 5).
- No timestamped version backups (task 6).
- No AI generation tool targeting `themes/` yet, beyond the existing
  npm-package flow (task 7).
- No zip export/import (task 8).
- No starter template matching this exact mechanism yet — `theme-canonical`
  is the reference until one exists.
