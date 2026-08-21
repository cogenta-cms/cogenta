import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/agents` — hand-mirrored from
 * `@cogenta/api`'s `agents-router.ts`, same reason every other
 * `*-client.ts` in this directory copies its server-side shape by hand.
 */

export interface AgentUsage {
  readonly tokensToday: number
  readonly eurThisMonth: number
  readonly callsThisHour: number
}

export interface AgentBudget {
  readonly tokensPerDay?: number
  readonly eurPerMonth?: number
  readonly callsPerHour?: number
}

export interface AgentAutonomy {
  readonly default: string
  readonly overrides?: Readonly<Record<string, string>>
}

export interface AgentModelPreference {
  readonly preferred: string
  readonly fallback?: string
}

export interface AgentTrigger {
  readonly on: string
  /** Present only for `on: 'schedule'` triggers — a cron expression. */
  readonly cron?: string
}

export interface AgentMemoryConfig {
  readonly episodic?: boolean
  readonly semantic?: boolean
  readonly procedural?: boolean
  readonly scope?: 'agent' | 'site'
}

export interface AgentSummary {
  readonly name: string
  readonly tools: readonly string[]
  readonly autonomy?: AgentAutonomy
  readonly budget?: AgentBudget
  readonly enabled: boolean
  readonly usage?: AgentUsage
  /**
   * Fiche 4 (L21 task 4): the rest of `AgentDeclaration` (`@cogenta/agents`,
   * contract C's `defineAgent`) that `createAgentsRouter` now passes through
   * unchanged. All optional, exactly as on the declaration itself — an agent
   * that never declared one simply does not carry it over the wire. Shown
   * read-only in the admin: nothing in this repo's `AgentRegistry` can
   * persist an edit to any of these (only `enable`/`disable` really mutate
   * anything), so an editable control here would have no real effect (R6).
   */
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly model?: AgentModelPreference
  readonly memory?: AgentMemoryConfig
  readonly triggers?: readonly AgentTrigger[]
}

export interface AgentTrace {
  readonly id: string
  readonly agentName: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly stopReason: string
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
}

export interface AgentHistoryEntry {
  readonly id: string
  readonly at: string
  readonly actorId: string | null
  readonly action: string
}

export function listAgents(token: string): Promise<readonly AgentSummary[]> {
  return request('/api/agents', { headers: authHeader(token) })
}

export function getAgent(token: string, name: string): Promise<AgentSummary> {
  return request(`/api/agents/${encodeURIComponent(name)}`, { headers: authHeader(token) })
}

export function enableAgent(token: string, name: string): Promise<AgentSummary> {
  return request(`/api/agents/${encodeURIComponent(name)}/enable`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function disableAgent(token: string, name: string): Promise<AgentSummary> {
  return request(`/api/agents/${encodeURIComponent(name)}/disable`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function listAgentTraces(token: string, name: string): Promise<readonly AgentTrace[]> {
  return request(`/api/agents/${encodeURIComponent(name)}/traces`, { headers: authHeader(token) })
}

export function listAgentHistory(
  token: string,
  name: string,
): Promise<readonly AgentHistoryEntry[]> {
  return request(`/api/agents/${encodeURIComponent(name)}/history`, {
    headers: authHeader(token),
  })
}
