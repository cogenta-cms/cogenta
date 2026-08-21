import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `logs.read_not_found` — L22 task 3, "le superagent avec accès aux
 * journaux (jamais au code source)". This is the one log this lot wires an
 * agent to: the 404 log `@cogenta/schema`'s `NotFoundLogStore` has kept
 * since fiche 12, never previously reachable from a tool. It carries a path,
 * a hit count and timestamps — no request body, no header, no IP, no user
 * agent (the store's own doc comment says why: `AGENTS.md` § Logs forbids
 * either) — so there is nothing here for R8 to worry about beyond what
 * `assembleContext`'s `data` channel already does for any external text.
 *
 * A narrow structural type, not the full `NotFoundLogStore`, for the same
 * reason `content.ts`'s `ContentServiceLike` is narrow: this tool only ever
 * reads.
 */
export interface NotFoundLogReader {
  list(options?: { readonly limit?: number }): Promise<
    readonly {
      readonly path: string
      readonly hits: number
      readonly firstSeen: number
      readonly lastSeen: number
      readonly lastReferrer: string | null
    }[]
  >
}

const InputSchema = z.object({
  /** Highest hit count first, same default and cap as the admin's own `/api/not-found`. */
  limit: z.number().int().positive().max(200).optional(),
})
type Input = z.infer<typeof InputSchema>

const EntrySchema = z.object({
  path: z.string(),
  hits: z.number(),
  firstSeen: z.number(),
  lastSeen: z.number(),
  lastReferrer: z.string().nullable(),
})

const OutputSchema = z.object({ entries: z.array(EntrySchema) })
type Output = z.infer<typeof OutputSchema>

export function createNotFoundLogReadTool(store: NotFoundLogReader): ToolDefinition<Input, Output> {
  return defineTool({
    name: 'logs.read_not_found',
    version: '1.0.0',
    description:
      "Read this site's log of public URLs that answered a 404, sorted by hit count — the paths worth investigating first.",
    input: InputSchema,
    output: OutputSchema,
    permissions: ['logs.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const entries = await store.list(input.limit === undefined ? {} : { limit: input.limit })
      return { entries: [...entries] }
    },
  })
}
