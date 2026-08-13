---
'@cogenta/render': minor
'@cogenta/theme-canonical': minor
'@cogenta/seo': minor
'@cogenta/core': minor
---

Add the rendering layer: `@cogenta/render`, `@cogenta/theme-canonical` and `@cogenta/seo`.

A theme reads content through an HTTP client carrying a read-only token, never through
the data layer (ADR-0016), and the isolation is checked at install rather than documented
and hoped for. A hostile-theme fixture proves the refusal against every route in: a bare
`fs` alias, a subpath import, a template-literal dynamic import, `createRequire`, an
import inside a `<script>`, and a `node:fs` alias smuggled through `package.json`
`imports`. The inverse guard matters as much — a theme whose prose contains `don't`, a
class named `process` and a commented-out import yields zero findings.

The canonical theme implements the twelve blocks with no JavaScript at all, asserted:
no script tag, no `on*` attribute, no `client:*` directive. Heading levels are read from
the block vocabulary rather than restated, so a titleless `featureGrid` keeps its items
at `h2` and no level is skipped. `consentRequired` suppresses even the provider
thumbnail, because a thumbnail already leaks the visitor's IP.

Skins validate as hard refusals: AA contrast on every declared pair with no epsilon on
the threshold, a monotonic type scale, no missing and no unknown token, and
`prefers-reduced-motion` honoured. A token value containing CSS syntax is refused — a
skin is a shareable JSON file interpolated into a stylesheet, and without that check it
is code rather than data.

SEO derives JSON-LD from the schema, keeps `hreflang` reciprocal by construction, and
blocks indexing on the working state as well as on draft status: a feed rendered from
the working face ships unreviewed edits, which is the same leak as a draft and far
harder to notice.
