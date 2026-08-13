import { z } from 'zod'
import { plainTextSchema } from './plain-text.js'

/**
 * Contract B, "Actions". The shape is fixed and shared by `hero` and `cta`.
 *
 * A target is either an external URL or an entity reference. Referencing the
 * entity rather than its URL is what makes a slug change harmless.
 */
export const linkTargetSchema = z.union([
  z.strictObject({ href: z.string().min(1) }),
  z.strictObject({ collection: z.string().min(1), id: z.string().min(1) }),
])

export type LinkTarget = z.infer<typeof linkTargetSchema>

/**
 * `emphasis` is a semantic intent — which action matters most — that the theme
 * translates as it sees fit. It is not a CSS class in disguise: `'btn-lg'`
 * would be a presentation value, forbidden by rule R3. The distinction is thin
 * on paper and decisive in use.
 */
export const actionSchema = z.strictObject({
  label: plainTextSchema.min(1),
  target: linkTargetSchema,
  emphasis: z.enum(['primary', 'secondary']).optional(),
})

export type Action = z.infer<typeof actionSchema>
