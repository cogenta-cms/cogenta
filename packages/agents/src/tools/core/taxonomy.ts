import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `taxonomy.list_terms` and `taxonomy.create_term` — the terms of a
 * taxonomy (tags, categories) an entry's `taxonomy` fields point at.
 *
 * An MCP client could write `tags: [id, …]` with `content.write_draft` but
 * had no way to learn those ids, nor to add the tag a new article needs: a
 * publishing client had to call the REST taxonomy routes beside MCP.
 *
 * The narrow service below is declared locally, like `ContentServiceLike`,
 * and the host is the permission gate (`PermissionLayer.assertTerm`, the same
 * one the REST routes call) before the call reaches it.
 */
export interface TaxonomyTermLike {
  readonly id: string
  readonly slug: string
  readonly parent: string | null
  readonly labels: Readonly<Record<string, string>>
}

export interface TaxonomyServiceLike {
  list(taxonomy: string): Promise<readonly TaxonomyTermLike[]>
  create(
    taxonomy: string,
    input: {
      readonly slug: string
      readonly labels: Readonly<Record<string, string>>
      readonly parent?: string
    },
  ): Promise<TaxonomyTermLike>
  /**
   * How many entries (live, trashed or draft — all of them) carry this term.
   * Optional with `delete`: a host that supplies neither keeps
   * `taxonomy.create_term` non-reversible, so it waits for a human.
   */
  usage?(taxonomy: string, termId: string): Promise<number>
  /** Removes one term. Never cascades: a term with children is refused by the store. */
  delete?(taxonomy: string, termId: string): Promise<void>
}

const TermSchema = z.object({
  id: z.string(),
  slug: z.string(),
  parent: z.string().nullable(),
  labels: z.record(z.string(), z.string()),
})

const ListInputSchema = z.object({ taxonomy: z.string().min(1) })
type ListInput = z.infer<typeof ListInputSchema>
const ListOutputSchema = z.object({ terms: z.array(TermSchema) })
type ListOutput = z.infer<typeof ListOutputSchema>

export function createTaxonomyListTermsTool(
  service: TaxonomyServiceLike,
): ToolDefinition<ListInput, ListOutput> {
  return defineTool({
    name: 'taxonomy.list_terms',
    version: '1.0.0',
    description:
      'List the terms of one taxonomy (for example "tag" or "category"): id, slug, parent and the label in each language. An entry field of kind "taxonomy" takes these ids — content.schema names the taxonomy each field points at.',
    input: ListInputSchema,
    output: ListOutputSchema,
    permissions: ['taxonomy.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const terms = await service.list(input.taxonomy)
      return { terms: terms.map(termOf) }
    },
  })
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

const CreateInputSchema = z.object({
  taxonomy: z.string().min(1),
  /** Lowercase ASCII words joined by hyphens, the term's address segment. */
  slug: z.string().min(1).max(100).regex(SLUG),
  /** The term's name in each site language, keyed by locale. */
  labels: z
    .record(z.string(), z.string().min(1).max(200))
    .refine((labels) => Object.keys(labels).length > 0, 'At least one label.'),
  parent: z.string().min(1).optional(),
})
type CreateInput = z.infer<typeof CreateInputSchema>
const CreateOutputSchema = TermSchema.extend({
  /** The taxonomy the term belongs to — what `revert` needs besides the id. */
  taxonomy: z.string(),
  /** False when a term with this slug already existed and was returned as is. */
  created: z.boolean(),
})
type CreateOutput = z.infer<typeof CreateOutputSchema>

/**
 * Idempotent on the slug: asking for a term that already exists returns it
 * (`created: false`) instead of failing, so a client can ensure its tags
 * exist without listing first, and a retried call never makes a duplicate.
 * Labels of an existing term are left untouched — renaming is not this
 * tool's job.
 *
 * Reversible when the host can count a term's uses and delete it. `revert`
 * deletes the term only if this very call created it (`created: true` — a
 * term that already existed is never this call's to remove) and nothing
 * carries it any more; otherwise it refuses with a reason. Deleting a term
 * would silently unclassify every entry carrying it (the join rows cascade),
 * which is why "still unused" counts every entry, trashed and draft included.
 */
export function createTaxonomyCreateTermTool(
  service: TaxonomyServiceLike,
): ToolDefinition<CreateInput, CreateOutput> {
  const usage = service.usage?.bind(service)
  const remove = service.delete?.bind(service)
  const canUndo = usage !== undefined && remove !== undefined
  return defineTool({
    name: 'taxonomy.create_term',
    version: '1.0.0',
    description:
      'Create a term in a taxonomy (for example a tag), or return the existing one when the slug is already taken (`created: false`, labels unchanged). `labels` holds the name per site language, e.g. { "en": "AI agents", "fr": "Agents IA" }.',
    input: CreateInputSchema,
    output: CreateOutputSchema,
    permissions: ['taxonomy.write'],
    sideEffects: true,
    reversible: canUndo,
    cost: 'low',
    async execute(input) {
      const existing = (await service.list(input.taxonomy)).find((term) => term.slug === input.slug)
      if (existing !== undefined) {
        return { ...termOf(existing), taxonomy: input.taxonomy, created: false }
      }
      const term = await service.create(input.taxonomy, {
        slug: input.slug,
        labels: input.labels,
        ...(input.parent === undefined ? {} : { parent: input.parent }),
      })
      return { ...termOf(term), taxonomy: input.taxonomy, created: true }
    },
    ...(usage === undefined || remove === undefined
      ? {}
      : {
          async revert(receipt: CreateOutput) {
            const where = { taxonomy: receipt.taxonomy, id: receipt.id }
            if (!receipt.created) {
              throw new CogentaError({
                code: 'TOOL_REVERT_REFUSED',
                message: `The term "${receipt.slug}" already existed before this call, so it is not this call's to delete.`,
                hint: 'Delete it from the Taxonomies screen if it is really unwanted.',
                details: where,
              })
            }
            const stillThere = (await service.list(receipt.taxonomy)).some(
              (term) => term.id === receipt.id,
            )
            // Already deleted: the state this revert aims for.
            if (!stillThere) return
            const uses = await usage(receipt.taxonomy, receipt.id)
            if (uses > 0) {
              throw new CogentaError({
                code: 'TOOL_REVERT_REFUSED',
                message: `The term "${receipt.slug}" is now used by ${uses} entr${uses === 1 ? 'y' : 'ies'}; it was not deleted.`,
                hint: 'Unclassify those entries first, or keep the term.',
                details: { ...where, uses },
              })
            }
            await remove(receipt.taxonomy, receipt.id)
          },
        }),
  })
}

function termOf(term: TaxonomyTermLike): z.infer<typeof TermSchema> {
  return { id: term.id, slug: term.slug, parent: term.parent, labels: { ...term.labels } }
}
