import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'
import type { ContentBrowseAccessContext } from './content-browse.js'

/**
 * `content.search` — full-text search across the collections an actor may
 * read (`tools@1.9`). `content.list` walks one collection newest first and
 * stops at fifty entries; an agent asked to "fix the page about opening
 * hours" on a site with three hundred pages had no way to find it short of
 * an id pasted by a human (MCP audit, 2026-10-21).
 *
 * Read-only and under `content.read`, the same reasoning as the browse pair:
 * searching is reading. The host decides which collections and which states
 * an actor may search — the adapter behind `ContentSearchServiceLike` is the
 * site's own search route, with its own permission checks; this tool only
 * shapes the call.
 */

export interface ContentSearchHitLike {
  readonly collection: string
  readonly id: string
  readonly title: string
  readonly status: string
  readonly locale: string
  readonly excerpt: string
}

export interface ContentSearchServiceLike {
  search(
    context: ContentBrowseAccessContext,
    query: { readonly text: string; readonly collection?: string; readonly limit: number },
  ): Promise<readonly ContentSearchHitLike[]>
}

const InputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  collection: z.string().optional(),
  limit: z.number().int().min(1).max(25).optional(),
})
type Input = z.infer<typeof InputSchema>

const OutputSchema = z.object({
  results: z.array(
    z.object({
      collection: z.string(),
      id: z.string(),
      title: z.string(),
      status: z.string(),
      locale: z.string(),
      excerpt: z.string(),
    }),
  ),
})
type Output = z.infer<typeof OutputSchema>

const DEFAULT_LIMIT = 10

export function createContentSearchTool(
  service: ContentSearchServiceLike,
): ToolDefinition<Input, Output> {
  return defineTool({
    name: 'content.search',
    version: '1.0.0',
    description:
      'Full-text search over the content this actor may read: returns collection, id, title, status, locale and a short excerpt per hit, best match first. Use it to find an entry before content.read or content.write_draft.',
    input: InputSchema,
    output: OutputSchema,
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      const results = await service.search(
        { actor: ctx.actor },
        {
          text: input.query,
          ...(input.collection === undefined ? {} : { collection: input.collection }),
          limit: input.limit ?? DEFAULT_LIMIT,
        },
      )
      return { results: [...results] }
    },
  })
}
