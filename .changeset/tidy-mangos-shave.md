---
'@cogenta/render': minor
'@cogenta/core': minor
---

Add `@cogenta/render`: the Astro integration, the `RenderContext`, and the theme installation check.

- `cogentaTheme()` is an Astro integration that resolves the active theme from the
  configuration, aliases its sources as `@theme`, and exposes its manifest through the
  virtual module `virtual:cogenta/theme`. The content token never enters Vite's module
  graph.
- `createRenderContext()` builds exactly the `RenderContext` contract D freezes at
  `theme@1.0` — `site`, `locale`, `url`, `t()`, `image()`, `link()`, `content` — and
  nothing else.
- `ctx.content` is an HTTP client to the content API carrying a read-only token
  (ADR-0016). It links against neither `@cogenta/schema` nor a database driver, so a
  theme cannot reach a draft even by asking.
- `verifyTheme()` refuses a theme at installation, naming file, line and import, when it
  does not declare the twelve blocks of the vocabulary, or when it reaches for a
  forbidden module — directly, through the unprefixed spelling of a builtin, through a
  subpath, through an unreadable dynamic `import()`, through CommonJS, or through a
  `package.json` alias. Refused, not warned.

`@cogenta/core` gains the error codes `THEME_NOT_FOUND`, `THEME_INVALID`,
`THEME_BLOCK_MISSING`, `THEME_IMPORT_FORBIDDEN` and `CONTENT_API_FAILED`.
