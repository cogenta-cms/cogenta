import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `content.collections` / `content.list` — L22 task 3's missing half:
 * `content.ts`'s `content.read` needs an `id` an agent cannot get any other
 * way, so nothing before this lot let an agent discover what a site
 * publishes. Both tools are read-only, both share `content.read`'s
 * permission (browsing is the same access as reading one entry, not a wider
 * grant), and both are generically useful beyond the monitoring agent this
 * task ships them for — an agent choosing where to point a stale link needs
 * exactly what a future "find thin content" or "suggest internal links"
 * agent would too.
 *
 * `path` on a list item is computed by the caller (`@cogenta/cli`'s
 * `agent-runtime.ts`, which alone has both the entry's field values and the
 * collection's route pattern) and is `null` for a collection with no public
 * route, or a values shape `buildPath` cannot fill — a candidate an agent
 * must not offer as a redirect target either way.
 */

export interface ContentBrowseAccessContext {
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
}

export interface ContentCollectionSummaryLike {
  readonly collection: string
  readonly total: number
  readonly published: number
  readonly routed: boolean
}

export interface ContentListItemLike {
  readonly id: string
  readonly title: string | null
  readonly path: string | null
  readonly status: string
}

export interface ContentBrowseServiceLike {
  /** Every collection this actor may read, with the same counts the dashboard's content summary widget uses. */
  collections(context: ContentBrowseAccessContext): Promise<readonly ContentCollectionSummaryLike[]>
  /** `undefined` when `collection` does not exist, or this actor may not read it — never thrown, so the tool can turn it into a normal (non-crashing) tool error. */
  list(
    context: ContentBrowseAccessContext,
    collection: string,
    options: { readonly limit: number },
  ): Promise<{ readonly items: readonly ContentListItemLike[] } | undefined>
}

function accessContextOf(actor: {
  readonly id: string | null
  readonly roles: readonly string[]
}): ContentBrowseAccessContext {
  return { actor }
}

const CollectionsOutputSchema = z.object({
  collections: z.array(
    z.object({
      collection: z.string(),
      total: z.number(),
      published: z.number(),
      routed: z.boolean(),
    }),
  ),
})
type CollectionsOutput = z.infer<typeof CollectionsOutputSchema>

export function createContentCollectionsTool(
  service: ContentBrowseServiceLike,
): ToolDefinition<Record<string, never>, CollectionsOutput> {
  return defineTool({
    name: 'content.collections',
    version: '1.0.0',
    description:
      'List every content collection this actor may read, with its entry counts and whether it has a public URL — the starting point for finding a page to point somewhere.',
    input: z.object({}),
    output: CollectionsOutputSchema,
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(_input, ctx) {
      const collections = await service.collections(accessContextOf(ctx.actor))
      return { collections: [...collections] }
    },
  })
}

const ListInputSchema = z.object({
  collection: z.string(),
  limit: z.number().int().positive().max(50).optional(),
})
type ListInput = z.infer<typeof ListInputSchema>

const ListOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      path: z.string().nullable(),
      status: z.string(),
    }),
  ),
})
type ListOutput = z.infer<typeof ListOutputSchema>

const DEFAULT_LIST_LIMIT = 20

export function createContentListTool(
  service: ContentBrowseServiceLike,
): ToolDefinition<ListInput, ListOutput> {
  return defineTool({
    name: 'content.list',
    version: '1.0.0',
    description:
      'List published entries of one collection (title, public path, status) — call content.collections first to discover collection names.',
    input: ListInputSchema,
    output: ListOutputSchema,
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      const page = await service.list(accessContextOf(ctx.actor), input.collection, {
        limit: input.limit ?? DEFAULT_LIST_LIMIT,
      })
      return { items: page === undefined ? [] : [...page.items] }
    },
  })
}
