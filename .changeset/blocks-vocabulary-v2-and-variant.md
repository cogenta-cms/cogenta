---
'@cogenta/blocks': major
'@cogenta/theme-canonical': major
'@cogenta/theme-portfolio': major
'@cogenta/theme-magazine': major
'@cogenta/theme-ecommerce': major
'@cogenta/theme-entreprise': major
---

Widen contract B (the block vocabulary) from twelve to seventeen blocks (`blocks@2.0`,
RFC 0001 — `docs/rfc/0001-widen-block-vocabulary.md`), and add a shared, optional
per-instance visual variant to every block's envelope (RFC 0002 —
`docs/rfc/0002-per-block-visual-variant.md`). Both were decided in direct conversation
with the user (fiche 43, Cogenta Page Builder), reopening ADR-0009 ("the vocabulary must
stay small") with an explicit renouncement traced in the RFCs themselves.

**New blocks**: `testimonial`, `pricingTable`, `accordion`, `statCounter`, `logoStrip`.
Each names a `fallback` into the twelve of `blocks@1.0` (`prose`, `featureGrid`,
`mediaFigure`), so a theme built before this version still renders them — degraded, never
lost — via `BlockRegistry.resolveRenderable`, now actually wired into the render path
(`@cogenta/theme-kit`'s new `resolveBlockForRender`). All five in-house themes implement
all five directly with their own distinct markup and CSS (never a recolour of another
theme's), so this degraded path is a safety net for a third-party theme, not something a
site using a built-in theme ever sees in practice.

**Why major, not the "adding a block is minor" default this contract stated at
`blocks@1.0`**: every theme's `renderBlock` is an exhaustive `switch` over
`VocabularyBlock`, `never`-checked at compile time by design — a block added to the
vocabulary is therefore a real breaking change for every existing theme's build, even
though no content anyone has ever saved is affected (nothing could create these block
types before this version). `docs/04-contrats.md` is updated to record this as the
precedent for this specific category of change, decided case by case per RFC rather than
by a blanket rule.

**`variant`** (RFC 0002): an optional `{ background?, spacing?, align?, width? }` on
every placed block's envelope — semantic tokens, never CSS or a colour (rule R3 holds).
Applied once per theme, in `renderBlock` itself via `@cogenta/theme-kit`'s
`withBlockVariant`, rather than by each of the seventeen block renderers individually.
Absent on all content written before this version, and rendered byte-for-byte identical:
purely additive at the data level, even though it ships in the same major bump as the
vocabulary widening above.

Each theme resolves the four axes to its own existing design tokens
(`[data-block][data-variant-*]` attribute selectors, `--cg-*`/`--ce-*` custom
properties already defined by that theme) — no theme gained a background-image
mechanism (RFC 0002 adds only the semantic token, not a media field), so
`background: 'image'` resolves to each theme's closest tinted-surface approximation
rather than doing nothing with a stated author intent.

`@cogenta/admin`'s page builder gains a small "Appearance" control (four selects) in the
selected block's detail panel, writing through the existing `updateBlockData` — no new
mechanism, per the RFC's own decision.
