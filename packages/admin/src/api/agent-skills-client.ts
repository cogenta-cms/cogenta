import { API_BASE, ApiError, authHeader, request } from './http.js'

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
 *
 * **Reference-folder resources added by fiche 57.** `uploadSkillResource`
 * sends a real `multipart/form-data` body (a `File` as-is, no base64
 * inflation) rather than going through `request()` — the generic helper
 * always forces a JSON `content-type`, which would strip the multipart
 * boundary the browser needs to set itself. Same reasoning as
 * `media-client.ts`'s `fetchMediaBlobUrl` reaching for a raw `fetch`.
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

/** `references/`, `scripts/` or `assets/` under a skill's own directory (fiche 57). */
export const SKILL_RESOURCE_DIRS = ['references', 'scripts', 'assets'] as const
export type SkillResourceDir = (typeof SKILL_RESOURCE_DIRS)[number]

export interface AgentSkillResourceSummary {
  /** Relative to the skill's own directory, e.g. `"references/style-guide.md"`. */
  readonly path: string
  readonly size: number
  readonly updatedAt: string
}

export function listSkillResources(
  token: string,
  id: string,
): Promise<readonly AgentSkillResourceSummary[]> {
  return request(`/api/agent-skills/${encodeURIComponent(id)}/resources`, {
    headers: authHeader(token),
  })
}

interface ResourceResponseBody {
  readonly data?: AgentSkillResourceSummary
  readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
}

export async function uploadSkillResource(
  token: string,
  id: string,
  dir: SkillResourceDir,
  filename: string,
  file: File,
): Promise<AgentSkillResourceSummary> {
  const form = new FormData()
  form.set('path', `${dir}/${filename}`)
  form.set('file', file)
  const response = await fetch(`${API_BASE}/api/agent-skills/${encodeURIComponent(id)}/resources`, {
    method: 'POST',
    headers: authHeader(token),
    body: form,
  })
  const body = (await response.json().catch(() => null)) as ResourceResponseBody | null
  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? 'Could not upload the file.',
      body?.error?.hint,
    )
  }
  if (body?.data === undefined) {
    throw new ApiError('INTERNAL', 'The server returned an unexpected response.', undefined)
  }
  return body.data
}

export async function removeSkillResource(token: string, id: string, path: string): Promise<void> {
  const encodedPath = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/')
  await request(`/api/agent-skills/${encodeURIComponent(id)}/resources/${encodedPath}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
