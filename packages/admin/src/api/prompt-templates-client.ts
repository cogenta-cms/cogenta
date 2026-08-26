import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/prompt-templates` — fiche 45's shared
 * prompt template library. Hand-mirrored from `@cogenta/api`'s
 * `prompt-templates-router.ts`. Read is open to any signed-in actor (the
 * fiche's own wording, "tout acteur signé ayant accès à l'assistant");
 * write is `admin`-only, enforced server-side.
 */

export interface PromptTemplateSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly template: string
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export function listPromptTemplates(token: string): Promise<readonly PromptTemplateSummary[]> {
  return request('/api/prompt-templates', { headers: authHeader(token) })
}

export function createPromptTemplate(
  token: string,
  input: {
    readonly name: string
    readonly description: string
    readonly category: string
    readonly template: string
  },
): Promise<PromptTemplateSummary> {
  return request('/api/prompt-templates', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updatePromptTemplate(
  token: string,
  id: string,
  patch: {
    readonly name?: string
    readonly description?: string
    readonly category?: string
    readonly template?: string
  },
): Promise<PromptTemplateSummary> {
  return request(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  })
}

export function removePromptTemplate(token: string, id: string): Promise<{ readonly id: string }> {
  return request(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
