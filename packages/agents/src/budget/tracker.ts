import type { TokenUsage } from '../providers/types.js'
import type { BudgetCheck, BudgetLimits, BudgetTracker, BudgetUsage } from './types.js'

export interface BudgetTrackerOptions {
  readonly limits: BudgetLimits
  /** Converts a call's token usage to EUR — pricing is data that changes with the vendor and model, not something this runtime hardcodes. Defaults to always 0, so `eurPerMonth` is simply never checked unless a caller supplies real rates. */
  readonly costOf?: (usage: TokenUsage) => number
  readonly now?: () => number
}

function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}
function monthKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}
function hourKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 13)
}

/**
 * Calendar-bucketed, not a rolling window — "tokens par jour" resets at
 * midnight UTC, not 24 hours after the first call, matching how the limit
 * reads in `defineAgent`'s config.
 */
export function createBudgetTracker(options: BudgetTrackerOptions): BudgetTracker {
  const limits = options.limits
  const costOf = options.costOf ?? (() => 0)
  const now = options.now ?? Date.now

  let dayKey = ''
  let tokensToday = 0
  let monthKey = ''
  let eurThisMonth = 0
  let hourKey = ''
  let callsThisHour = 0

  function rollBuckets(current: number): void {
    const day = dayKeyOf(current)
    if (day !== dayKey) {
      dayKey = day
      tokensToday = 0
    }
    const month = monthKeyOf(current)
    if (month !== monthKey) {
      monthKey = month
      eurThisMonth = 0
    }
    const hour = hourKeyOf(current)
    if (hour !== hourKey) {
      hourKey = hour
      callsThisHour = 0
    }
  }

  return {
    checkCall(): BudgetCheck {
      rollBuckets(now())

      if (limits.callsPerHour !== undefined && callsThisHour >= limits.callsPerHour) {
        return { allowed: false, reason: 'callsPerHour' }
      }
      if (limits.tokensPerDay !== undefined && tokensToday >= limits.tokensPerDay) {
        return { allowed: false, reason: 'tokensPerDay' }
      }
      if (limits.eurPerMonth !== undefined && eurThisMonth >= limits.eurPerMonth) {
        return { allowed: false, reason: 'eurPerMonth' }
      }
      return { allowed: true }
    },
    recordCall(usage: TokenUsage): void {
      rollBuckets(now())
      callsThisHour += 1
      tokensToday += usage.inputTokens + usage.outputTokens
      eurThisMonth += costOf(usage)
    },
    usage(): BudgetUsage {
      rollBuckets(now())
      return { tokensToday, eurThisMonth, callsThisHour }
    },
  }
}
