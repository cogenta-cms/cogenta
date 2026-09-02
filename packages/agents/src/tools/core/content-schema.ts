import { VOCABULARY } from '@cogenta/blocks'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'
import type { ContentBrowseAccessContext } from './content-browse.js'

/**
 * `content.schema` — the missing half of the browse pair (`content.
 * collections`/`content.list`, L22 task 3): those answer "what entries
 * exist", never "what shape does an entry take". `content.write_draft`'s
 * `values` input is `z.record(z.string(), z.unknown())`, deliberately
 * schema-blind (contract A's field set is open-ended, and the tool has no
 * business re-validating what `ContentServiceLike.create`/`update` already
 * validate) — which leaves an agent with no way to learn a collection's real
 * field keys short of guessing or reverse-engineering an existing entry, and
 * no way at all on a fresh collection with zero entries. A live run against
 * "peux-tu générer un template ?" showed exactly this: the superagent had
 * nothing to introspect, so it asked the human to specify everything.
 *
 * Read-only, and deliberately under the same permission as the browse pair:
 * `content.read`. Describing a collection's *shape* is not a wider grant
 * than reading one of its entries (the precedent this file follows is
 * `content-browse.ts`'s own comment on the same point).
 *
 * The block vocabulary half needs no adapter and no permission check beyond
 * the tool's own: it is contract B, static and site-independent, the same
 * seventeen blocks on every Cogenta install. It is always present in the
 * output, regardless of which (if any) collection was asked about, so an
 * agent building a `blocks`-kind field's value never has to make a second
 * call to learn what a "hero" block or a "prose" block actually holds.
 */

export interface CollectionFieldSummary {
  readonly key: string
  readonly kind: string
  readonly label: string | null
  readonly required: boolean
  readonly options: Readonly<Record<string, unknown>>
}

export interface CollectionSchemaSummary {
  readonly collection: string
  readonly labelSingular: string
  readonly labelPlural: string
  readonly routed: boolean
  readonly fields: readonly CollectionFieldSummary[]
}

export interface ContentSchemaServiceLike {
  /**
   * Every collection's schema this actor may read, or just `collection`'s
   * when given — `undefined` in `collection`'s place means "all". An
   * unreadable or unknown named collection is silently omitted (mirrors
   * `content-browse.ts`'s own `list()`), never thrown: a tool result says
   * "nothing here", a thrown error would end the agent's turn over what is,
   * from the model's point of view, an ordinary "try a different name".
   */
  describe(
    context: ContentBrowseAccessContext,
    collection?: string,
  ): Promise<readonly CollectionSchemaSummary[]>
}

const BlockFieldOutputSchema = z.object({
  key: z.string(),
  kind: z.string(),
  required: z.boolean(),
  options: z.record(z.string(), z.unknown()),
})

const BlockOutputSchema = z.object({
  name: z.string(),
  version: z.string(),
  fields: z.array(BlockFieldOutputSchema),
})

const CollectionFieldOutputSchema = z.object({
  key: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  required: z.boolean(),
  options: z.record(z.string(), z.unknown()),
})

const CollectionSchemaOutputSchema = z.object({
  collection: z.string(),
  labelSingular: z.string(),
  labelPlural: z.string(),
  routed: z.boolean(),
  fields: z.array(CollectionFieldOutputSchema),
})

const OutputSchema = z.object({
  collections: z.array(CollectionSchemaOutputSchema),
  blocks: z.array(BlockOutputSchema),
})
type Output = z.infer<typeof OutputSchema>

const InputSchema = z.object({ collection: z.string().optional() })
type Input = z.infer<typeof InputSchema>

/**
 * Built once, from `@cogenta/blocks`' own `VOCABULARY` — a plain data
 * mapping, not a query, so it costs nothing to compute on every call and
 * needs no caching.
 */
function blockVocabularyOutput(): Output['blocks'] {
  return VOCABULARY.map((block) => ({
    name: block.name,
    version: block.version,
    fields: Object.entries(block.schema).map(([key, field]) => ({
      key,
      kind: field.kind,
      required: field.required,
      options: field.options,
    })),
  }))
}

export function createContentSchemaTool(
  service: ContentSchemaServiceLike,
): ToolDefinition<Input, Output> {
  return defineTool({
    name: 'content.schema',
    version: '1.0.0',
    description:
      "Describe one or every collection's field shape (key, kind, required, label, kind-specific options) and this site's fixed block vocabulary (block type name, version, and its own field shape) — the type/field names a blocks-kind field's array items may use. Call this before content.write_draft to know which field keys and value shapes a collection actually accepts, instead of guessing.",
    input: InputSchema,
    output: OutputSchema,
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      const collections = await service.describe({ actor: ctx.actor }, input.collection)
      return {
        collections: collections.map((collection) => ({
          collection: collection.collection,
          labelSingular: collection.labelSingular,
          labelPlural: collection.labelPlural,
          routed: collection.routed,
          fields: collection.fields.map((field) => ({
            key: field.key,
            kind: field.kind,
            label: field.label,
            required: field.required,
            options: field.options,
          })),
        })),
        blocks: blockVocabularyOutput(),
      }
    },
  })
}
