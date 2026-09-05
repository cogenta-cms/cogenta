# Cogenta theme starter

A real, minimal Cogenta theme — copy this directory as the starting point for
your own. It implements all seventeen blocks of contract B (`blocks@2.0`) (`docs/04-contrats.md`
§ "Contrat B — Vocabulaire de blocs") with plain, unstyled-but-usable markup,
and its own test (`test/verify.test.ts`) runs the exact installation check
`cogenta serve` runs on every theme, so this starter cannot silently rot the
way a piece of documentation prose can.

## Structure

```
theme-starter/
  theme.config.ts        # manifest — name, contract versions, blocks implemented
  tokens.json             # default skin (contract D, "Tokens de skin")
  src/
    theme-contract.ts      # contract D's types, copied locally (see its own header comment for why)
    layouts/
      Base.astro            # <html>/<head>/<body> shell, header/footer slots
    blocks/                 # one file per vocabulary block, named exactly like theme-canonical's own
      Hero.astro
      Prose.astro
      MediaFigure.astro
      FeatureGrid.astro
      Cta.astro
      Gallery.astro
      Quote.astro
      Faq.astro
      Stats.astro
      Logos.astro
      CollectionList.astro
      Embed.astro
    render/
      prose.ts               # the one non-trivial helper: rich text → HTML
  test/
    verify.test.ts          # runs the real contract D installation check against this theme
```

This is contract D's own minimal file layout (`docs/04-contrats.md` §
"Structure minimale"), which is itself the thing "inspired by WordPress's
theme structure" means in practice here: a fixed layout and named extension
points (one file per block, a manifest, a `layouts/` directory), rather than
one big template file you edit in place.

## What's minimal, on purpose

- **No production styling.** `Base.astro` ships a thin reset wired to the
  skin's `--cogenta-<group>-<name>` variables and nothing else — every block
  renders semantic, unstyled-but-usable HTML with predictable class names
  (`.hero`, `.feature-grid__item`, …) for you to style.
- **Rich text is intentionally partial.** `src/render/prose.ts` handles
  paragraphs, headings, quotes, lists and the three inline marks the editor's
  toolbar produces (`strong`/`em`/`code`) — but not a link mark or a `media`
  node embedded inside prose. Both are real, small additions;
  `@cogenta/theme-canonical`'s own `src/render/rich-text.ts` is the reference
  implementation to read before you write yours.
- **`embed`'s consent gate is the simplest correct one.** When
  `consentRequired` is true, nothing about the third-party provider is
  contacted until the visitor actively follows a plain link — no iframe is
  even present in the markup before that. A richer, still-zero-JavaScript
  "load in place" experience is possible (a `<details>`-driven reveal, say)
  but this starter keeps the simplest version that is actually correct.
- **No accessibility test suite yet.** `theme-canonical`'s `WCAG-2.2-AA`
  claim in its own manifest is backed by a real automated check
  (`packages/theme-canonical/test/accessibility.test.ts`). This starter's
  manifest deliberately carries no `a11y.verified` field — see the comment in
  `theme.config.ts`.

## Using it

1. Copy this directory out of the monorepo, rename it, and change `name` in
   both `package.json` and `theme.config.ts`.
2. Point your site's configuration at it (see the "Créer un thème" guide in
   the technical documentation for the exact wiring — `cogenta.config.*`
   loads a theme the same way it loads a plugin manifest).
3. Run `cogenta serve`. A missing block or a forbidden import
   (`node:fs`, `@cogenta/core`, …) fails installation with the file, the line
   and the reason — never a silent skip.
4. Style `tokens.json` and the CSS classes each block renders. Nothing here
   requires a rebuild to change skin (contract D): edit `tokens.json` and the
   next request picks it up.

## Verifying your changes

```bash
pnpm -F @cogenta/example-theme-starter test        # runs the real contract D check
pnpm -F @cogenta/example-theme-starter typecheck    # .ts files only — .astro files are not typechecked in this repo's convention (theme-canonical has the same limitation)
```
