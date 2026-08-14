import type { AutonomyConfig } from '../autonomy/types.js'
import type { BudgetLimits } from '../budget/types.js'

export interface AgentModelPreference {
  readonly preferred: string
  readonly fallback?: string
}

export interface AgentTrigger {
  readonly on: string
  /** Present only for `on: 'schedule'` triggers. */
  readonly cron?: string
}

export interface AgentMemoryConfig {
  readonly episodic?: boolean
  readonly semantic?: boolean
  readonly procedural?: boolean
  readonly scope?: 'agent' | 'site'
}

/**
 * Contract C's `defineAgent({...})` (`tools@1.0`, ADR-0020), reproduced as a
 * type — `autonomy` and `budget` reuse the exact types tasks 8/9 already
 * built rather than re-declaring their shape here.
 */
export interface AgentDeclaration {
  readonly name: string
  /** A path to the agent's identity document (role, objectives, style) — read by whoever assembles context (task 3), not by this module. */
  readonly identity: string
  readonly model: AgentModelPreference
  readonly tools: readonly string[]
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly autonomy?: AutonomyConfig
  readonly budget?: BudgetLimits
  readonly memory?: AgentMemoryConfig
  readonly triggers?: readonly AgentTrigger[]
}
