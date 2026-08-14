import type { TokenUsage } from '../providers/types.js'

/** Contract C's `defineAgent({ budget: {...} })` (`tools@1.0`, ADR-0020), reproduced exactly — every field optional, an unset limit is not enforced. */
export interface BudgetLimits {
  readonly tokensPerDay?: number
  readonly eurPerMonth?: number
  readonly callsPerHour?: number
}

export type BudgetExceededReason = 'tokensPerDay' | 'eurPerMonth' | 'callsPerHour'

export interface BudgetCheck {
  readonly allowed: boolean
  readonly reason?: BudgetExceededReason
}

export interface BudgetTracker {
  /**
   * Pure — no side effect. Called before a model call is made, so an agent
   * that is already over budget is refused before it costs anything more,
   * not after ("dépassement = arrêt propre et alerte, jamais dégradation
   * silencieuse").
   */
  checkCall(): BudgetCheck
  /** Aggregates one call's actual usage into the tracker's windows — tokens and EUR cost measured per call, per L4's own pitfall about cost exploding silently otherwise. */
  recordCall(usage: TokenUsage): void
}

export interface KillSwitch {
  isActive(): boolean
}
