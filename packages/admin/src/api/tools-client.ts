import { authHeader, request } from './http.js'

/**
 * `/api/tools` — the "Outils" screen (fiche 24 task 3). Shapes hand-mirrored
 * from `@cogenta/api`'s `tools-router.ts`.
 */

export type ToolRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface ToolDefinition {
  readonly id: string
  readonly labelKey: string
  readonly reversible: boolean
  readonly estimatedDurationKey: string
}

export interface ToolRun {
  readonly id: string
  readonly tool: string
  readonly status: ToolRunStatus
  readonly startedAt: string
  readonly finishedAt: string | undefined
  readonly log: readonly string[]
  readonly error: string | undefined
}

export function listTools(token: string): Promise<{ readonly tools: readonly ToolDefinition[] }> {
  return request('/api/tools', { headers: authHeader(token) })
}

export function runTool(
  token: string,
  id: string,
  input: { readonly external?: boolean; readonly email?: string } = {},
): Promise<{ readonly id: string }> {
  return request(`/api/tools/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function listToolRuns(token: string): Promise<{ readonly runs: readonly ToolRun[] }> {
  return request('/api/tools/runs', { headers: authHeader(token) })
}

export function readToolRun(token: string, id: string): Promise<ToolRun> {
  return request(`/api/tools/runs/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}
