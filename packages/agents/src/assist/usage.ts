import type { TokenUsage } from '../providers/types.js'

/**
 * Cost and usage visibility for the writing assistant (fiche 30 task 3).
 *
 * Distinct from `../budget/tracker.ts`'s `BudgetTracker`: that one is a
 * per-agent runtime concept keyed to `defineAgent({ budget: {...} })`
 * (contract C), calendar-bucketed by day/hour/EUR. The assistant toolset has
 * no `defineAgent` behind it — `createAssistToolset` builds tools directly —
 * so this is a second, purpose-built tracker: one **monthly token cap** for
 * the whole toolset (the lot's own wording is singular, "un plafond mensuel
 * configurable"), plus a **per-tool breakdown** for visibility, which
 * `BudgetTracker` has no concept of.
 *
 * `checkBudget` is pure and called *before* a tool runs, `record` is called
 * *after* a call actually completed — the same allow-before/record-after
 * shape `BudgetTracker` uses, so a run that is already over budget is refused
 * before it costs anything more, never after (the lot's own pitfall: "le coût
 * est invisible jusqu'à la facture").
 */

export interface AssistUsageLimits {
  /** Absent means never enforced — but `createAssistUsageTracker`'s caller always resolves a real default (fiche 30 §8: "une valeur non nulle plutôt qu'illimité"). */
  readonly monthlyTokenLimit?: number
}

export interface AssistToolUsage {
  readonly tool: string
  readonly calls: number
  readonly tokens: number
}

export interface AssistUsageSnapshot {
  readonly tokensThisMonth: number
  readonly limit?: number
  /** `0..100`, and beyond 100 once the limit has actually been exceeded — never clamped, so "120%" is honest. Absent with no limit. */
  readonly percentUsed?: number
  /** `percentUsed >= 80`. The lot's own "signal à 80%". */
  readonly nearLimit: boolean
  readonly overLimit: boolean
  readonly byTool: readonly AssistToolUsage[]
}

export interface AssistUsageTracker {
  /** Pure, no side effect — read before running a tool. */
  checkBudget(): { readonly allowed: boolean }
  /** Aggregates one call's real usage, attributed to the tool that made it. */
  record(tool: string, usage: TokenUsage): void
  usage(): AssistUsageSnapshot
}

export interface AssistUsageTrackerOptions {
  readonly limits?: AssistUsageLimits
  readonly now?: () => number
}

function monthKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}

/**
 * Calendar-bucketed by UTC month, same convention `BudgetTracker` uses for its
 * own `eurPerMonth` bucket — resets at the first of the month, not 30 days
 * after the first call.
 */
export function createAssistUsageTracker(
  options: AssistUsageTrackerOptions = {},
): AssistUsageTracker {
  const limit = options.limits?.monthlyTokenLimit
  const now = options.now ?? Date.now

  let monthKey = ''
  let tokensThisMonth = 0
  const byTool = new Map<string, { calls: number; tokens: number }>()

  function rollBucket(current: number): void {
    const month = monthKeyOf(current)
    if (month === monthKey) return
    monthKey = month
    tokensThisMonth = 0
    byTool.clear()
  }

  return {
    checkBudget(): { readonly allowed: boolean } {
      rollBucket(now())
      if (limit === undefined) return { allowed: true }
      return { allowed: tokensThisMonth < limit }
    },
    record(tool: string, usage: TokenUsage): void {
      rollBucket(now())
      const total = usage.inputTokens + usage.outputTokens
      tokensThisMonth += total
      const current = byTool.get(tool) ?? { calls: 0, tokens: 0 }
      byTool.set(tool, { calls: current.calls + 1, tokens: current.tokens + total })
    },
    usage(): AssistUsageSnapshot {
      rollBucket(now())
      const percentUsed = limit === undefined ? undefined : (tokensThisMonth / limit) * 100
      return {
        tokensThisMonth,
        ...(limit === undefined ? {} : { limit }),
        ...(percentUsed === undefined ? {} : { percentUsed }),
        nearLimit: percentUsed !== undefined && percentUsed >= 80,
        overLimit: percentUsed !== undefined && percentUsed >= 100,
        byTool: Array.from(byTool.entries())
          .map(([tool, stats]) => ({ tool, calls: stats.calls, tokens: stats.tokens }))
          .sort((a, b) => b.tokens - a.tokens),
      }
    },
  }
}
