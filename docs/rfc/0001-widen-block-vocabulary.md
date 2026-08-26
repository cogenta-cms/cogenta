# RFC — Widen the block vocabulary (contract B)

> Draft for the GitHub issue template `RFC — change to a contract or the block
> vocabulary`. Filed following fiche 43 (`docs/plans/43-cogenta-page-builder.md`,
> sous-chantier C(i)), decided in direct conversation with the user on 2026-08-26:
> the Cogenta Page Builder should reach WordPress/Elementor-level completeness, not
> stop at theme-scoped extras. This explicitly reopens ADR-0009 ("the vocabulary
> must stay small, a dozen blocks, not fifty").

**Contract affected**: B — block vocabulary

## The problem

Cogenta's page builder (L16, fiche 43) has a solid editing shell — drag/drop, undo/
redo, inline text editing, byte-for-byte preview fidelity — but the 12-block
vocabulary (`packages/blocks/src/vocabulary.ts`) covers only generic page shapes
(`hero`, `featureGrid`, `text`, `mediaFigure`, `collectionList`, …). A real
marketing/agency site building a landing or home page reaches for composite,
purpose-built sections that no combination of the 12 current blocks expresses
cleanly: a pricing table, a testimonials carousel, an accordion/FAQ, a stat-counter
row, a logo/social-proof strip, a countdown, a team-member grid, an image gallery
with lightbox. Every one of Cogenta's five built-in themes would benefit from
implementing the same shared shape for these, rather than each site being told to
hand-roll a theme-specific block with no cross-theme guarantee.

## What is possible today without this change

A theme may already declare a block that is entirely its own, as long as it
declares a fallback to a standard-vocabulary block (`packages/blocks/src/
registry.ts`, `BlockRegistry.resolveRenderable`) — this is the existing escape
hatch, and fiche 43 sous-chantier C(ii) is finishing its wiring on the render side.
It does not solve the actual gap: each theme that wants a "pricing table" today
reimplements its own shape, admin form, and validation independently, with zero
guarantee of parity between themes and zero portability of content that uses it —
switching themes silently loses the block (falls back), which is correct behavior
for a theme-private block but is not what a builder marketed as "ultra complete"
needs for its most common sections.

## Proposal

Add a curated set of new shared block types to `packages/blocks/src/vocabulary.ts`,
each following the existing discipline exactly (semantic data only — R3 holds, no
HTML, no CSS, no literal colors; visual intent only via existing enums like
`Action.emphasis`). Starting set, to be confirmed during RFC discussion:

```typescript
// New VocabularyBlock members — shape sketch, not final
interface TestimonialBlock {
  type: 'testimonial';
  quote: RichText;
  attribution: { name: string; role?: string; avatar?: ImageSource };
}

interface PricingTableBlock {
  type: 'pricingTable';
  tiers: Array<{
    name: string;
    price: string; // formatted string, not a numeric/currency type — no billing logic here
    interval?: string;
    features: string[];
    action?: Action;
    highlighted?: boolean;
  }>;
}

interface AccordionBlock {
  type: 'accordion';
  items: Array<{ question: string; answer: RichText }>;
}

interface StatCounterBlock {
  type: 'statCounter';
  stats: Array<{ value: string; label: string }>;
}

interface LogoStripBlock {
  type: 'logoStrip';
  logos: ImageSource[];
  caption?: string;
}
```

Each block is added to `VocabularyBlock`, the exhaustive `switch` in `render-block.ts`
(present identically in all 5 themes) gains one case per block, and
`PageContent.blocks` stays `readonly VocabularyBlock[]` — closed, typed, no
change to that discipline.

## Cost imposed on the ecosystem

Major version bump for contract B (`blocks@2.0`) — this is additive to the type
union but every consuming `switch` is `never`-checked exhaustive, so every theme
must add a case (implement or explicit fallback) or fail to compile. Concretely:
the 5 in-house themes (`theme-canonical`, `theme-portfolio`, `theme-magazine`,
`theme-ecommerce`, `theme-entreprise`) each need ~2-3 days to implement or
fallback-declare the new blocks; `theme-kit`'s shared render helpers gain the new
case shapes. Existing content is unaffected — no site has ever been able to author
these block types, so there is nothing to migrate. Any third-party theme not yet
updated fails its own build against the new contract version rather than silently
mis-rendering, per the existing discipline (`never`-checked switch).

## Fallback (block RFCs only)

Mandatory per new block, to a single existing standard-vocabulary block, mapping
to be finalized during discussion:

- `testimonial` → `text` (quote rendered as attributed body text)
- `pricingTable` → `featureGrid` (tiers rendered as feature cards, losing price
  emphasis and comparison layout)
- `accordion` → `text` (items rendered as a flat sequence of heading + body)
- `statCounter` → `featureGrid` (each stat rendered as a card)
- `logoStrip` → `mediaFigure` (logos rendered as a simple image row)
