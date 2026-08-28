import { z } from 'zod'

/**
 * The rich text document, contract A § "Texte riche" and ADR-0013.
 *
 * A restricted Portable Text model: a list of typed blocks carrying text,
 * semantic marks and annotations that reference site entities. No HTML, no
 * Markdown, no editor-internal format — a stored `<div class="…">` would tie an
 * article to one theme for good, and would have to be sanitised on every read.
 *
 * `h1` is deliberately absent: the page title is the only `h1`, and leaving it
 * available in the body breaks the heading outline and accessibility with it.
 */

export const RICH_TEXT_STYLES = ['normal', 'h2', 'h3', 'h4', 'blockquote'] as const

export type RichTextStyle = (typeof RICH_TEXT_STYLES)[number]

export const RICH_TEXT_LIST_ITEMS = ['bullet', 'number'] as const

export type RichTextListItem = (typeof RICH_TEXT_LIST_ITEMS)[number]

/**
 * Marks that need no definition. Anything else in `marks` is a `markDefs._key`.
 *
 * `strikethrough` (fiche 42 task 2) is an additive entry to this open
 * taxonomy — the same treatment already given to a new `ErrorCode` or to
 * `document.extract` on contract C's permission taxonomy (`schema@2.1`,
 * ADR-0027): existing documents never carry it, so nothing already stored
 * changes shape, and a reader still on `schema@2.1` simply cannot validate a
 * span that now uses it — the same one-directional compatibility every prior
 * additive vocabulary entry in this project has accepted.
 */
export const RICH_TEXT_DECORATORS = ['strong', 'em', 'code', 'strikethrough'] as const

export type RichTextDecorator = (typeof RICH_TEXT_DECORATORS)[number]

/**
 * Stable across edits: diffs, comments and anchors are all keyed by it. A key
 * that changes on every save makes a per-block comment thread impossible.
 */
const keySchema = z.string().min(1)

const spanSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('span'),
  text: z.string(),
  marks: z.array(z.string().min(1)).default([]),
})

/**
 * An internal link references an *entity*, not a URL. Moving or renaming the
 * target does not break the link, and deleting the target is detectable —
 * neither is true of a stored href.
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

const textBlockSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('block'),
  style: z.enum(RICH_TEXT_STYLES),
  listItem: z.enum(RICH_TEXT_LIST_ITEMS).optional(),
  /** List nesting, from 1. Only meaningful together with `listItem`. */
  level: z.number().int().min(1).optional(),
  children: z.array(spanSchema),
  markDefs: z.array(markDefinitionSchema).default([]),
})

const mediaNodeSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('media'),
  id: z.string().min(1),
  caption: z.string().optional(),
})

/**
 * A thematic break (fiche 42 task 2). Carries no data beyond its key — unlike
 * `media`, it has nothing to reference — so there is nothing for a future
 * property to smuggle presentation through.
 */
const hrNodeSchema = z.strictObject({
  _key: keySchema,
  _type: z.literal('hr'),
})

export const richTextNodeSchema = z.discriminatedUnion('_type', [
  textBlockSchema,
  mediaNodeSchema,
  hrNodeSchema,
])

export const richTextDocumentSchema = z.array(richTextNodeSchema).superRefine((nodes, context) => {
  // Two nodes sharing a key silently break every consumer that addresses a
  // node by key: comments land on the wrong paragraph, diffs pair the wrong
  // blocks. Cheaper to reject on write than to untangle later.
  const seen = new Set<string>()
  for (const [index, node] of nodes.entries()) {
    if (seen.has(node._key)) {
      context.addIssue({
        code: 'custom',
        message: `duplicate _key "${node._key}"`,
        path: [index, '_key'],
      })
    }
    seen.add(node._key)
  }

  for (const [index, node] of nodes.entries()) {
    if (node._type !== 'block') continue
    const defined = new Set(node.markDefs.map((definition) => definition._key))
    for (const [childIndex, child] of node.children.entries()) {
      for (const mark of child.marks) {
        const isDecorator = (RICH_TEXT_DECORATORS as readonly string[]).includes(mark)
        if (!isDecorator && !defined.has(mark)) {
          context.addIssue({
            code: 'custom',
            message: `mark "${mark}" is neither a decorator nor a markDefs key`,
            path: [index, 'children', childIndex, 'marks'],
          })
        }
      }
    }
  }
})

export type RichTextSpan = z.infer<typeof spanSchema>
export type RichTextMarkDefinition = z.infer<typeof markDefinitionSchema>
export type RichTextBlock = z.infer<typeof textBlockSchema>
export type RichTextMediaNode = z.infer<typeof mediaNodeSchema>
export type RichTextHrNode = z.infer<typeof hrNodeSchema>
export type RichTextNode = z.infer<typeof richTextNodeSchema>
export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
