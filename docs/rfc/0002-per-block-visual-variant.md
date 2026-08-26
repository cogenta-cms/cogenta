# RFC — Per-block visual variant field (contract B)

> Draft for the GitHub issue template `RFC — change to a contract or the block
> vocabulary`. Filed following fiche 43 (`docs/plans/43-cogenta-page-builder.md`,
> sous-chantier D), decided in direct conversation with the user on 2026-08-26,
> alongside RFC 0001 (widen block vocabulary) — same "ultra complete page
> builder" direction, this half addresses per-instance visual customization
> rather than new block types.

**Contract affected**: B — block vocabulary

## The problem

The only per-block visual lever today is `Action.emphasis?: 'primary' |
'secondary'` — a semantic intent on a call-to-action, not a general styling
mechanism. A page builder aiming for Elementor/Divi-level completeness needs an
author to vary, per block *instance*, things like background treatment (solid vs.
muted vs. image), spacing density, horizontal alignment, and content width
(contained vs. full-bleed) — without falling back to storing literal CSS or HTML,
which R3 and contract B forbid absolutely.

## What is possible today without this change

Nothing, beyond choosing a different theme (global skin, `theme.tokens.json`) or a
different block type entirely. There is no way, from the builder, to make one
`featureGrid` instance sit on a muted background and another on the default
background on the same page.

## Proposal

Add one new **shared, optional field** to the base shape every block already
carries (not a new block type — every existing and future `VocabularyBlock`
member gains it):

```typescript
interface BlockVariant {
  background?: 'default' | 'muted' | 'image';
  spacing?: 'compact' | 'comfortable' | 'spacious';
  align?: 'start' | 'center' | 'end';
  width?: 'contained' | 'full';
}

// Added to the block base shape shared by every VocabularyBlock member:
interface BlockBase {
  // ...existing fields (key, type, etc.)
  variant?: BlockVariant;
}
```

These are semantic tokens, not values — `background: 'muted'` names an intent, and
each theme resolves it to its own muted-surface CSS token (exactly the same
indirection `theme.tokens.json` already uses for color). A theme that does not
implement a given variant value ignores it and renders its default, per the
existing "absent, not refused" tolerance used elsewhere in the plugin/theme
contracts — never a hard error, never a blank block. `variant` is optional and
absent on all currently-authored content, so this is purely additive: a page with
no `variant` set anywhere renders byte-for-byte identical to today.

Editor-side: `packages/admin/src/builder/block-outline.tsx` and the block
insertion/edit panel gain a small variant control (four selects/toggles), writing
into `block-moves.ts`'s existing `updateBlockData` path — no new mechanism needed
there.

## Cost imposed on the ecosystem

Additive to every block's base shape — a minor version bump (`blocks@1.1`) if
shipped alone, or folded into the same major bump as RFC 0001
(`blocks@2.0`) if the two land together, since RFC 0001 already forces every theme
to touch its block-rendering switch. Each of the 5 in-house themes must map the
four `variant` axes to its own token set (a half-day to a day per theme,
significantly less than RFC 0001 since no new block shapes are involved — only
CSS class/token selection on existing render paths). A theme that ignores
`variant` entirely does not fail to compile (the field is optional) — it simply
never varies visually, which is a quality gap for that theme, not a contract
violation.

## Fallback (block RFCs only)

Not applicable — this is a shared field addition, not a new block type. The
equivalent safety net is that every value is optional and every theme is expected
to gracefully ignore any variant value it does not implement, defaulting to its
normal rendering rather than erroring.
