import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/agent-skills` — L22 task 1bis's "Skills"
 * screen. A different concept from L7's marketplace skill registry (see
 * `@cogenta/agents`' `skills/library.ts`) — named `agent-skills` on the wire
 * for exactly that reason. Hand-mirrored from `@cogenta/api`'s
 * `agent-skills-router.ts`.
 *
 * **Wire contract changed in L24 task 4**: create/update now send raw
 * Markdown (`content` — the full `SKILL.md`, frontmatter included) instead
 * of separate name/description/instructions fields, matching the admin
 * screen's raw-Markdown editor.
 */

export interface AgentSkillSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  /** The exact `SKILL.md` text (frontmatter + body) this record renders to. */
  readonly content: string
  readonly enabledByDefault: boolean
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export function listAgentSkills(token: string): Promise<readonly AgentSkillSummary[]> {
  return request('/api/agent-skills', { headers: authHeader(token) })
}

export function createAgentSkill(
  token: string,
  input: {
    readonly content: string
    readonly enabledByDefault?: boolean
  },
): Promise<AgentSkillSummary> {
  return request('/api/agent-skills', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updateAgentSkill(
  token: string,
  id: string,
  patch: {
    readonly content?: string
    readonly enabledByDefault?: boolean
  },
): Promise<AgentSkillSummary> {
  return request(`/api/agent-skills/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  })
}

export function removeAgentSkill(token: string, id: string): Promise<{ readonly id: string }> {
  return request(`/api/agent-skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
