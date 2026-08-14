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

export interface AgentSummary {
  readonly name: string
  readonly tools: readonly string[]
  readonly autonomy?: AgentAutonomy
  readonly budget?: AgentBudget
  readonly enabled: boolean
  readonly usage?: AgentUsage
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
