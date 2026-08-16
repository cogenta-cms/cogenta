import { authHeader, request } from './http.js'

/**
 * `/api/redirects` — admin-only management of the redirect table that
 * `cogenta serve` already applies to every public GET (audit follow-up to
 * L10 task 2, whose store had no route to reach it from a browser).
 */

export interface Redirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: 301 | 302
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: 'slug-change' | 'manual' | 'import'
  /** Epoch milliseconds. */
  readonly createdAt: number
}

export function listRedirects(token: string): Promise<readonly Redirect[]> {
  return request('/api/redirects', { headers: authHeader(token) })
}

export interface CreateRedirectInput {
  readonly from: string
  readonly to: string
  readonly status?: 301 | 302
}

export function createRedirect(token: string, input: CreateRedirectInput): Promise<Redirect> {
  return request('/api/redirects', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteRedirect(token: string, from: string): Promise<void> {
  await request(`/api/redirects?from=${encodeURIComponent(from)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
