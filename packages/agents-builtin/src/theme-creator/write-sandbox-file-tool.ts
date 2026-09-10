import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'

/**
 * `theme.write_sandbox_file` (`tools@1.6`, `docs/04-contrats.md`) — fiche 73
 * task 7. Same shape as `code.propose_patch` (`code.patch`,
 * `../developer/patch-tool.ts`), on purpose: a real, effectful write with a
 * real `revert`, `sideEffects: true` + `reversible: true` keeping it inside
 * `withAutonomy`'s ordinary gate rather than always forcing approval. What
 * differs is the destination and the meaning of "revert": `code.patch`
 * opens a pull request nothing merges automatically, this writes straight
 * into one file of one theme *sandbox* (`<projectRoot>/.cogenta/theme-sandbox
 * /<id>/`, fiche 73 task 4) — never `themes/`, and so never anything a live
 * request could resolve. `revert` deletes the file it wrote, the same
 * "undo the one write this tool made" meaning `deps.patch`'s `revert`
 * already has, just without a forge in between.
 *
 * `writeFile`/`deleteFile` are factory options, not part of the Zod input
 * schema — the same shape `theme.propose_theme`'s `resolveProvider` and
 * `code.propose_patch`'s `prClient` already use: this package cannot import
 * `@cogenta/cli`'s `theme-sandbox.ts` (the dependency arrow runs the other
 * way — `@cogenta/cli` depends on `@cogenta/agents-builtin`, never the
 * reverse), so the real filesystem write — and the path-escape guard that
 * makes it safe to hand a model — lives in `@cogenta/cli` and is threaded in
 * here as a plain function.
 */

export interface WriteSandboxFileToolOptions {
  readonly writeFile: (input: {
    readonly sandboxId: string
    readonly path: string
    readonly content: string
  }) => Promise<{ readonly path: string; readonly warnings?: readonly string[] }>
  readonly deleteFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<void>
}

const WriteSandboxFileInputSchema = z.object({
  /** An id `theme.propose_theme`-adjacent tooling (or a human) already created — this tool never creates a sandbox itself. */
  sandboxId: z.string().min(1),
  /** Sandbox-relative, e.g. `"theme.render.mjs"` — never absolute, never `../`-prefixed. The real escape guard is enforced host-side, in `@cogenta/cli`; this tool has no filesystem of its own to guard. */
  path: z.string().min(1),
  content: z.string(),
})
export type WriteSandboxFileInput = z.infer<typeof WriteSandboxFileInputSchema>

const WriteSandboxFileOutputSchema = z.object({
  sandboxId: z.string(),
  path: z.string(),
  /** Present when the file was accepted but contains something worth fixing — a dead `href="#"`, say. Read them: a warning here is a real defect that simply was not worth refusing the write over. */
  warnings: z.array(z.string()).optional(),
})
export type WriteSandboxFileOutput = z.infer<typeof WriteSandboxFileOutputSchema>

export function createWriteSandboxFileTool(
  options: WriteSandboxFileToolOptions,
): ToolDefinition<WriteSandboxFileInput, WriteSandboxFileOutput> {
  return defineTool({
    name: 'theme.write_sandbox_file',
    version: '1.0.0',
    description: `Writes one real source file (theme.config.*, theme.render.*, or any other file the theme needs) into a theme sandbox — actual TypeScript/JavaScript code, not tokens. Use this, never theme.propose_theme, whenever the request needs custom layout, custom markup structure, or anything no installed theme package already renders — a fully custom design, not a recolour of an existing one. theme.propose_theme only ever picks an existing installed theme and fills its colour/font/spacing tokens; it cannot change layout or markup. Never writes into themes/ directly, and never touches anything a live request could resolve — deploying the sandbox stays a separate, human-confirmed action.

Full design freedom, like a WordPress theme or a Strapi frontend: renderPage/renderChrome are plain code, not a fixed template — fetch whatever data you want via ctx.content.entry()/list()/byPath() (any collection, not just what a page's own blocks list) and place it anywhere, in any layout, any markup, any CSS. page.blocks is one available data source, never a required structure — a page's blocks can be ignored entirely for a fully bespoke design that queries content directly. There is no closed list of block types either: a custom block type — any name, including one nobody else uses — is fine to invent and handle in renderPage; the shared vocabulary (hero, prose, mediaFigure, featureGrid, cta, gallery, quote, faq, stats, logos, collectionList, embed, testimonial, pricingTable, accordion, statCounter, logoStrip) is only there so existing content composed with those still shows something if this theme chooses to render them — implementing all of them is never required to deploy.

Every write of theme.config.* or theme.render.* is validated for real before it lands — an invalid manifest field, a missing export, or a render function that does not actually produce a real page is rejected with a specific error naming what is wrong; read it and call this tool again with a corrected file. It is normal to need a few tries.

theme.config.* — export default defineTheme({...}) from '@cogenta/theme-kit', EXACTLY these fields:
  name: string, version: 'X.Y.Z' (exact semver), engine: '^1.0.0' (a semver RANGE, not a description), blocks: '^1.0.0' (also a semver range — the block-vocabulary version this theme supports, NEVER a list of block names), implements: string[] (which block _type names this theme's renderPage actually handles, e.g. ['hero','collectionList','prose']), collections: string[] | '*', runtime: 'static' | 'server' | 'edge' (one of these three literal strings, never an object), tokens: a STRING path to the tokens file, e.g. './theme.tokens.json' (never inline token data — the token VALUES belong in that separate JSON file, shaped like SkinTokens: {color:{bg,fg,accent,accentFg,muted,mutedFg,border}, font:{sans,serif,mono,scale,baseSize}, space:{unit,density}, radius:{sm,md,lg}, motion:{duration,easing,reduced}, shadow:{sm,md}} — nothing more, nothing less).

A real .css file — any file name, any number of files (theme.css, style.css, base.css + blocks.css, whatever fits) — is REQUIRED for any design that is supposed to look like anything: real CSS, plain text, no <style> tags. Every *.css file written into this sandbox is picked up automatically, no naming convention to follow. Without at least one, the page is 100% unstyled HTML — every visual detail (colours, layout, spacing, grid, cards, hero image, typography) comes ONLY from selectors written here targeting the class names theme.render.* emits; nothing renders a design on its own. Read the request's visual reference (screenshot/description) closely and write real, specific CSS for it — layout (flexbox/grid), colours, spacing, typography, imagery — not a token dump. Colour/font/spacing VALUES are not invented here: reference the site's actual skin tokens through the CSS custom properties the site already generates on :root — --cogenta-color-bg/fg/accent/accent-fg/muted/muted-fg/border, --cogenta-font-sans/serif/mono, --cogenta-font-size-xs/sm/md/lg/xl/2xl/3xl, --cogenta-space-unit, --cogenta-radius-sm/md/lg, --cogenta-shadow-sm/md — e.g. "background: var(--cogenta-color-bg); font-family: var(--cogenta-font-serif); padding: calc(var(--cogenta-space-unit) * 2);". A background photo or other imagery is a real url() the theme's own markup or CSS points at (e.g. an uploaded media file resolved through ctx.image() and passed into the render module's markup as a style/background, or a static asset path) — never a placeholder colour standing in for a photo the brief actually asked for.

theme.render.* — a real ES module. renderPage and renderChrome build markup with h() from '@cogenta/theme-kit' (h(tag, attrs, ...children) => HtmlElement, NOT a plain data object — the render pipeline calls serialize() on what these return, which only understands an HtmlElement tree or a plain string). There is no ctx.theme.tokens or any per-request access to skin token VALUES from render code — tokens reach the page only through the CSS custom properties the .css file(s) above read, never as JS values; a render module only ever emits semantic HTML with class names for that CSS to target. Minimal, real, working example:

import { h } from '@cogenta/theme-kit'

export function renderChrome(input) {
  // input: { site: {name,url,locales,defaultLocale}, locale, homeHref, headerNav: [{label,href}], footerNav, brandingHtml }
  const nav = (input.headerNav || []).map((l) => \`<a href="\${l.href}">\${l.label}</a>\`).join('')
  return {
    header: \`<header class="cg-header"><a href="\${input.homeHref}">\${input.site.name}</a><nav>\${nav}</nav></header>\`,
    footer: \`<footer class="cg-footer">\${input.site.name}</footer>\`,
  }
}

export function renderPage(page, ctx, entries = {}) {
  // page: { title: string, blocks: Array<{_key, _type, ...fields}> } — the entry's real, saved contract-B blocks.
  // ctx: { site, locale, url, t(key,vals), image(mediaId,opts), link(target), content: {entry,byPath,list} }
  // entries: fetched collectionList results, keyed by block._key.
  const renderedBlocks = page.blocks.map((block) => {
    if (block._type === 'hero') {
      return h('section', { class: 'cg-hero' }, [
        h('h1', { class: 'cg-hero__title' }, block.title || page.title),
        block.subtitle ? h('p', { class: 'cg-hero__subtitle' }, block.subtitle) : null,
      ])
    }
    if (block._type === 'collectionList') {
      const items = entries[block._key] || []
      return h(
        'section',
        { class: 'cg-grid' },
        items.map((entry) =>
          h('article', { class: 'cg-card' }, [
            h('h3', {}, String(entry.title ?? '')),
            h('a', { href: ctx.link({ collection: entry.collection, id: entry.id }) }, ctx.t('readMore', { default: 'Read more' })),
          ]),
        ),
      )
    }
    // Any block type not specifically styled still renders, plainly — never drop content the page actually has.
    return h('section', { class: 'cg-block', 'data-type': block._type }, block.title ? h('h2', {}, String(block.title)) : null)
  })
  return h('main', { class: 'cg-main' }, [h('h1', { class: 'cg-page-title' }, page.title), ...renderedBlocks])
}

Matching .css for the example above (real selectors for the real classes theme.render.* just emitted — this is the part that actually makes it look like anything; call the file whatever you want):

.cg-main { background: var(--cogenta-color-bg); color: var(--cogenta-color-fg); font-family: var(--cogenta-font-sans); }
.cg-hero { padding: calc(var(--cogenta-space-unit) * 4) calc(var(--cogenta-space-unit) * 2); text-align: center; }
.cg-hero__title { font-family: var(--cogenta-font-serif); font-size: var(--cogenta-font-size-3xl); }
.cg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--cogenta-space-unit); padding: var(--cogenta-space-unit); }
.cg-card { background: var(--cogenta-color-muted); color: var(--cogenta-color-muted-fg); border-radius: var(--cogenta-radius-md); padding: var(--cogenta-space-unit); box-shadow: var(--cogenta-shadow-sm); }
@media (max-width: 640px) { .cg-grid { grid-template-columns: 1fr; } }

This example is deliberately generic (it renders whatever block types a real page actually has, defaulting unknown ones to a plain but real block rather than silently dropping them) — adapt the class names, nesting and per-block-type markup freely to match the requested design, but keep using h() to build the tree, keep renderChrome returning { header, footer } as HTML strings, and always write real .css (any file name) that actually styles whatever class names this file ends up using — a theme.render.* with no matching CSS renders as unstyled text, every time, regardless of how good the markup structure is.`,
    input: WriteSandboxFileInputSchema,
    output: WriteSandboxFileOutputSchema,
    permissions: ['theme.write_sandbox'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    async execute(input) {
      const result = await options.writeFile({
        sandboxId: input.sandboxId,
        path: input.path,
        content: input.content,
      })
      return {
        sandboxId: input.sandboxId,
        path: result.path,
        ...(result.warnings === undefined || result.warnings.length === 0
          ? {}
          : { warnings: [...result.warnings] }),
      }
    },
    async revert(receipt) {
      await options.deleteFile({ sandboxId: receipt.sandboxId, path: receipt.path })
    },
  })
}
