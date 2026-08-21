---
title: Creating a theme
order: 4
---

# Creating a theme

A Cogenta theme is an Astro package that receives content already resolved
and authorized — never the database, never a secret. That's contract D
(`docs/04-contrats.md` § "Contrat D — Thème"), frozen at `theme@1.1`: adding
an entry to what a theme receives is minor, changing one is major.

## Start here

[Download the theme starter](../downloads/theme-starter.zip) —
`examples/theme-starter/` in the repository: a real, minimal theme that
already implements all twelve vocabulary blocks and passes the real
installation check (its own test suite runs it against that exact check,
not just against a human reading it). Copy the directory, rename it, and
customize from there.

## A fixed structure, named extension points

```
my-theme/
  theme.config.ts        # manifest: name, contract versions, blocks implemented
  tokens.json             # default skin
  src/
    layouts/Base.astro     # <html> shell, header, footer
    blocks/                 # one file per vocabulary block — all twelve, mandatory
      Hero.astro
      Prose.astro
      …
    components/             # your own shared components
```

This fixed structure — one file per block, a declarative manifest, a skin
kept separate from code — is what "structured like a WordPress theme" means
here: not the same PHP filenames, but the same principle, an imposed
skeleton with named extension points rather than one free-form template
where everything is possible and nothing is predictable.

## The manifest

```ts
import { defineTheme } from './src/theme-contract.js'

export default defineTheme({
  name: 'my-theme',
  version: '0.1.0',
  engine: '^1.0.0',       // theme contract version targeted
  blocks: '^1.0.0',       // block vocabulary version supported
  implements: ['hero', 'prose', /* … all twelve */],
  collections: '*',        // or a precise list of expected collections
  runtime: 'static',       // 'static' | 'server' | 'edge'
  tokens: './tokens.json',
})
```

**A theme that omits a vocabulary block fails installation.** That's
deliberate: it's what guarantees a theme switch never silently drops
content already published under another theme.

## What a block component receives

Exactly two props, never more:

```astro
---
import type { HeroBlock } from '@cogenta/blocks'
import type { RenderContext } from '../theme-contract.js'

const { block, ctx } = Astro.props as { block: HeroBlock; ctx: RenderContext }
---
```

`block` is the block's semantic data (contract B — never stored HTML or
style). `ctx` is the `RenderContext`: the site's name and locales, the
current URL, a translation function, an image resolver, a locale-aware
link resolver, and a read-only content client. Nothing else is reachable —
not the database, not secrets, not the filesystem.

## Isolation is verified, not just documented

At install time, `cogenta serve` statically scans the theme's sources and
**refuses** — naming the file, the line and the offending import — any
import of `node:fs`, `node:child_process`, `node:net`, `node:http(s)`,
`node:worker_threads`, `node:vm`, `node:process`, `@cogenta/core`,
`@cogenta/schema`, or any core driver package. This isn't a convention to
respect, it's a real check — the same one the starter's own
`test/verify.test.ts` runs for you, before you'd otherwise find out in
production.

## The skin: zero rebuild to change appearance

`tokens.json` is a **closed, complete** set of tokens — color, typography,
spacing, radii, motion, shadow — rendered as `--cogenta-<group>-<name>` CSS
variables in a single stylesheet, served as a file rather than compiled into
the theme. Changing skin rewrites that file; no rebuild is needed. A skin
that fails AA contrast or omits a token is refused at save time, not merely
flagged — the guarantee that makes AI-generated skin creation safe by
construction.

## Going further

The theme starter documents, in its own `README.md`, what it deliberately
leaves minimal (rich text doesn't yet handle internal links or embedded
media, `embed` has only one consent behavior) and where to find the fuller
reference implementation — `@cogenta/theme-canonical`, the theme Cogenta
ships by default, `packages/theme-canonical/` in the repository.
