import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `redirects.create` — L22 task 3's one corrective action: a monitoring
 * agent that has read `logs.read_not_found` and picked a destination (via
 * `content.list`) hands both here. It is deliberately the *only* write this
 * lot gives an agent onto the redirect table — editing or deleting an
 * existing rule stays a human-only action in the admin's Redirections
 * screen (`packages/admin/src/routes/redirects.tsx`), which this tool never
 * touches.
 *
 * `reversible: true` with a real `revert`: the redirect this call created is
 * exactly the one thing `revert` removes, by `from` — R6's bar for letting
 * `autonomous` autonomy apply this itself without forced human approval on
 * top of the autonomy gate.
 *
 * A narrow structural type, not the full `RedirectStore`: only the three
 * methods this tool actually calls.
 */
export interface RedirectWriter {
  add(input: {
    readonly from: string
    readonly to: string
    readonly status?: 301 | 302 | 307 | 308
    readonly reason?: 'slug-change' | 'manual' | 'import' | 'agent'
  }): Promise<{
    readonly id: string
    readonly from: string
    readonly to: string
    readonly status: number
    readonly createdAt: number
  }>
  remove(from: string): Promise<boolean>
}

const InputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  // 410 (Gone) is deliberately not offered here: this tool exists to send
  // visitors *somewhere*, never to mark a page dead — an admin who decides
  // that is the right call makes it by hand, in the Redirections screen.
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
})
type Input = z.infer<typeof InputSchema>

const OutputSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.number(),
  createdAt: z.number(),
})
type Output = z.infer<typeof OutputSchema>

export function createRedirectCreateTool(store: RedirectWriter): ToolDefinition<Input, Output> {
  return defineTool({
    name: 'redirects.create',
    version: '1.0.0',
    description:
      'Create (or replace) a redirect from one site path to another. Always recorded with reason "agent", never "manual", so it is visible in the Redirections screen as agent-made.',
    input: InputSchema,
    output: OutputSchema,
    permissions: ['redirects.write'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    rateLimit: { perHour: 30 },
    async execute(input) {
      const record = await store.add({
        from: input.from,
        to: input.to,
        ...(input.status === undefined ? {} : { status: input.status }),
        reason: 'agent',
      })
      return {
        id: record.id,
        from: record.from,
        to: record.to,
        status: record.status,
        createdAt: record.createdAt,
      }
    },
    async revert(receipt) {
      await store.remove(receipt.from)
    },
  })
}
