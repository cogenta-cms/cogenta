import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `analytics.summary` — the site's own audience figures, opened to an agent
 * (L5 task 10, Analytics).
 *
 * A structural port, like every other host-provided tool here. What it hands
 * over is what `@cogenta/analytics` already computes: counts per path and two
 * comparable windows. **Nothing identifies a visitor** — the measurement is
 * cookie-free by design (fiche 27), and this tool has no way to ask for more
 * than counts, which is what keeps "an agent reads the audience" from turning
 * into "an agent reads the audience's visitors".
 */

export interface AnalyticsWindowSummary {
  readonly since: string
  readonly until: string
  readonly totalViews: number
  readonly uniqueVisitors: number
  readonly topPages: readonly { readonly path: string; readonly views: number }[]
  readonly previousTotalViews: number
}

export interface AnalyticsSummaryPort {
  summary(days: number): Promise<AnalyticsWindowSummary>
}

const InputSchema = z.object({
  /** How many days back the window runs. Capped at a quarter: a longer read is a report, not an agent's glance. */
  days: z.number().int().min(1).max(90).optional(),
})
type SummaryInput = z.infer<typeof InputSchema>

const OutputSchema = z.object({
  since: z.string(),
  until: z.string(),
  totalViews: z.number(),
  uniqueVisitors: z.number(),
  topPages: z.array(z.object({ path: z.string(), views: z.number() })),
  previousTotalViews: z.number(),
})
export type AnalyticsSummaryOutput = z.infer<typeof OutputSchema>

export function createAnalyticsSummaryTool(
  port: AnalyticsSummaryPort,
): ToolDefinition<SummaryInput, AnalyticsSummaryOutput> {
  return defineTool({
    name: 'analytics.summary',
    version: '1.0.0',
    description:
      "This site's own audience figures for a window of days: total views, unique visitors, the most visited paths, and the same total for the window just before — so a change can be stated rather than guessed.",
    input: InputSchema,
    output: OutputSchema,
    permissions: ['analytics.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const summary = await port.summary(input.days ?? 7)
      return { ...summary, topPages: [...summary.topPages] }
    },
  })
}
