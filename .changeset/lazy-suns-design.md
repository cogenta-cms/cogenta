---
'@cogenta/render': minor
'@cogenta/core': minor
---

Add the skin system of contract D to `@cogenta/render`: design tokens, CSS variables and
hot swap.

**Tokens.** `validateSkin` takes a raw `tokens.json` and returns it typed, or refuses it.
The token set is closed: a missing token *and* an unknown token are both refused, so a
skin can never leave a variable undefined nor smuggle in presentation the theme never
declared.

**Validation, in hard-refusal mode.** WCAG 2.2 AA contrast on the three declared pairs
(`fg`/`bg`, `accentFg`/`accent`, `mutedFg`/`muted`), a strictly increasing typographic
ladder, well-formed colours, lengths and durations, and `motion.reduced`. A refusal names
every failure of its category at once — for contrast, the pair, its measured ratio and the
shortfall. Relative luminance and the contrast ratio are computed in the package, without
a dependency.

**CSS.** `renderSkinCss` emits one stylesheet of `--cogenta-<group>-<name>` custom
properties, plus the derived font-size ladder and a density multiplier, and honours
`prefers-reduced-motion` in the sheet itself rather than only in the token.

**Hot swap.** `createSkinStore(tokens).apply(next)` validates and rewrites the sheet with
no build step, in well under a millisecond, and keeps the previous skin live if the new
one is refused. Each sheet carries a content ETag that is stable for identical tokens.

New error codes in `@cogenta/core`: `SKIN_TOKEN_MISSING`, `SKIN_TOKEN_UNKNOWN`,
`SKIN_TOKEN_INVALID`, `SKIN_CONTRAST_INSUFFICIENT`, `SKIN_SCALE_NOT_MONOTONIC`,
`SKIN_MOTION_NOT_REDUCED`.
