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
  /** Fiche 55 task 2 — an explicit model id for this agent, distinct from the provider name `preferred` names. Optional: absent means "use the provider's own configured model". */
  readonly model?: string
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
   * L22 task 1: the rest of `AgentDeclaration` (`@cogenta/agents`, contract
   * C's `defineAgent`), now genuinely editable through `updateAgent` below —
   * `createAgentsRouter` was extended with real `create`/`update`/`remove`
   * capabilities, backed by a persistent file store, not the fixed
   * in-memory array `AgentRegistry` used to wrap.
   */
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly model?: AgentModelPreference
  readonly memory?: AgentMemoryConfig
  readonly triggers?: readonly AgentTrigger[]
  /** `true` for the superagent and the two seeded examples — undeletable, always editable. */
  readonly builtin?: boolean
}

export interface AgentIdentityFields {
  readonly role: string
  readonly objectives: readonly string[]
  readonly style?: string
  /** Fiche 55 task 1 — extra standing instructions, distinct from `style`. */
  readonly systemPrompt?: string
}

export interface AgentWriteInput {
  readonly name?: string
  readonly identity?: AgentIdentityFields
  readonly model?: AgentModelPreference
  readonly tools?: readonly string[]
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly autonomy?: AgentAutonomy
  readonly budget?: AgentBudget
  readonly memory?: AgentMemoryConfig
  readonly triggers?: readonly AgentTrigger[]
  readonly enabled?: boolean
}

export interface AgentRunToolCallSummary {
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
}

export interface AgentRunSummary {
  readonly agent: string
  readonly stopReason: string
  readonly finalText: string | null
  readonly steps: number
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number }
  readonly toolCalls?: readonly AgentRunToolCallSummary[]
}

/**
 * One turn of the actor's standing conversation with an agent — the piece
 * that closed a real reported bug: starting a chat on one surface (the
 * agent detail page) and reopening the floating widget did not "load" it,
 * because nothing server-side kept a thread at all. Both surfaces now read
 * and write through the same three functions below.
 */
export interface AgentConversationTurn {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly createdAt: string
  readonly toolCalls?: readonly AgentRunToolCallSummary[]
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

export function createAgent(token: string, input: AgentWriteInput): Promise<AgentSummary> {
  return request('/api/agents', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updateAgent(
  token: string,
  name: string,
  patch: AgentWriteInput,
): Promise<AgentSummary> {
  return request(`/api/agents/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  })
}

export function removeAgent(token: string, name: string): Promise<{ readonly name: string }> {
  return request(`/api/agents/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function getAgentIdentity(token: string, name: string): Promise<AgentIdentityFields> {
  return request(`/api/agents/${encodeURIComponent(name)}/identity`, {
    headers: authHeader(token),
  })
}

export function runAgent(
  token: string,
  name: string,
  instruction: string,
): Promise<AgentRunSummary> {
  return request(`/api/agents/${encodeURIComponent(name)}/run`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ instruction }),
  })
}

export async function getAgentConversation(
  token: string,
  name: string,
): Promise<readonly AgentConversationTurn[]> {
  const { turns } = await request<{ turns: readonly AgentConversationTurn[] }>(
    `/api/agents/${encodeURIComponent(name)}/conversation`,
    { headers: authHeader(token) },
  )
  return turns
}

export async function sendAgentMessage(
  token: string,
  name: string,
  message: string,
): Promise<{ readonly turns: readonly AgentConversationTurn[]; readonly run: AgentRunSummary }> {
  return request(`/api/agents/${encodeURIComponent(name)}/conversation/messages`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ message }),
  })
}

export function clearAgentConversation(token: string, name: string): Promise<{ cleared: boolean }> {
  return request(`/api/agents/${encodeURIComponent(name)}/conversation`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
