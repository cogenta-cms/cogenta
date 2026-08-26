import { z } from 'zod'

/**
 * Contract B, "Variante visuelle par bloc" (`blocks@2.0`, RFC 0002 —
 * `docs/rfc/0002-per-block-visual-variant.md`), decided alongside RFC 0001 in
 * direct conversation with the user on 2026-08-26: a page builder aiming for
 * Elementor/Divi-level completeness needs an author to vary, per block
 * *instance*, background treatment, spacing density, horizontal alignment
 * and content width — without ever storing literal CSS or HTML, which R3 and
 * the rest of this contract forbid absolutely.
 *
 * These are semantic tokens, not values: `background: 'muted'` names an
 * intent, and each theme resolves it to its own muted-surface CSS custom
 * property, exactly the indirection `theme.tokens.json` already uses for
 * colour. A theme that does not implement a given value ignores it and
 * renders its default — "absent, not refused", the same tolerance the
 * plugin/theme contracts already use elsewhere — never a hard error, never a
 * blank block.
 */

export const BLOCK_VARIANT_BACKGROUNDS = ['default', 'muted', 'image'] as const
export const BLOCK_VARIANT_SPACINGS = ['compact', 'comfortable', 'spacious'] as const
export const BLOCK_VARIANT_ALIGNS = ['start', 'center', 'end'] as const
export const BLOCK_VARIANT_WIDTHS = ['contained', 'full'] as const

export type BlockVariantBackground = (typeof BLOCK_VARIANT_BACKGROUNDS)[number]
export type BlockVariantSpacing = (typeof BLOCK_VARIANT_SPACINGS)[number]
export type BlockVariantAlign = (typeof BLOCK_VARIANT_ALIGNS)[number]
export type BlockVariantWidth = (typeof BLOCK_VARIANT_WIDTHS)[number]

/**
 * Every axis is optional independently — an author sets only what they mean
 * to change, and an empty `{}` is indistinguishable from `variant` being
 * absent altogether (both mean "this theme's default on every axis").
 */
export const blockVariantSchema = z.strictObject({
  background: z.enum(BLOCK_VARIANT_BACKGROUNDS).optional(),
  spacing: z.enum(BLOCK_VARIANT_SPACINGS).optional(),
  align: z.enum(BLOCK_VARIANT_ALIGNS).optional(),
  width: z.enum(BLOCK_VARIANT_WIDTHS).optional(),
})

export type BlockVariant = z.infer<typeof blockVariantSchema>
