import { z } from 'zod'
import { plainTextSchema } from './plain-text.js'

/**
 * Contract A, "Texte riche": a rich text value is a structured JSON document,
 * never HTML (ADR-0013).
 *
 * TEMPORARY HOME. These shapes belong to `@cogenta/schema`, which is being
 * written in parallel. They live here so `@cogenta/blocks` can validate its
 * `richText` fields today, and must be replaced by an import from
 * `@cogenta/schema` at merge time — not duplicated.
 */

const keySchema = z.string().min(1)

/**
 * A link points at an entity, not at an URL, whenever the target is internal:
 * moving or renaming the target then cannot break the link, and deleting it is
 * detectable.
 */
const markDefinitionSchema = z.discriminatedUnion('_type', [
  z.strictObject({
    _key: keySchema,
    _type: z.literal('link'),
    href: z.string().min(1),
    rel: z.string().optional(),
  }),
  z.strictObject({
    _key: keySchema,
    _type: z.literal('internalLink'),
    collection: z.string().min(1),
    id: z.string().min(1),
  }),
])

const spanSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('span'),
  text: plainTextSchema,
  // 'strong' | 'em' | 'code', or a markDefs._key. Kept open on purpose: the
  // annotation vocabulary grows without a schema change.
  marks: z.array(z.string()).default([]),
})

/**
 * `h1` is absent by design: the page title is the only `h1`. Leaving it
 * available in the body breaks the heading outline and the accessibility tree.
 */
const textBlockSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('block'),
  style: z.enum(['normal', 'h2', 'h3', 'h4', 'blockquote']),
  listItem: z.enum(['bullet', 'number']).optional(),
  level: z.number().int().min(1).optional(),
  children: z.array(spanSchema),
  markDefs: z.array(markDefinitionSchema).default([]),
})

const mediaNodeSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('media'),
  id: z.string().min(1),
  caption: plainTextSchema.optional(),
})

/** A thematic break (fiche 42 task 2) — mirrors `@cogenta/schema`'s own `hrNodeSchema`. */
const hrNodeSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('hr'),
})

export const richTextDocumentSchema = z.array(
  z.discriminatedUnion('_type', [textBlockSchema, mediaNodeSchema, hrNodeSchema]),
)

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
export type RichTextNode = RichTextDocument[number]
export type Span = z.infer<typeof spanSchema>
export type MarkDefinition = z.infer<typeof markDefinitionSchema>
