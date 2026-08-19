import { authHeader, request, requestBody } from './http.js'

/**
 * `/api/redirects` — admin-only management of the redirect table that
 * `cogenta serve` already applies to every public GET (audit follow-up to
 * L10 task 2, whose store had no route to reach it from a browser).
 *
 * Extended by fiche 12 with editing, search/pagination, prefix patterns and
 * CSV import/export — one client module for the whole feature, since all of
 * it lives under the same `/api/redirects*` prefix on the server.
 */

export interface Redirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: 301 | 302 | 307 | 308 | 410
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: 'slug-change' | 'manual' | 'import'
  /** Epoch milliseconds. */
  readonly createdAt: number
}

export interface ListRedirectsOptions {
  readonly q?: string
  readonly limit?: number
  readonly offset?: number
}

export interface RedirectsPage {
  readonly data: readonly Redirect[]
  readonly total: number
}

function queryString(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export async function listRedirects(
  token: string,
  options: ListRedirectsOptions = {},
): Promise<RedirectsPage> {
  return requestBody<RedirectsPage>(
    `/api/redirects${queryString({ q: options.q, limit: options.limit, offset: options.offset })}`,
    { headers: authHeader(token) },
  )
}

export interface CreateRedirectInput {
  readonly from: string
  /** Optional only when `status` is 410. */
  readonly to?: string
  readonly status?: Redirect['status']
}

export function createRedirect(token: string, input: CreateRedirectInput): Promise<Redirect> {
  return request('/api/redirects', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export interface UpdateRedirectInput {
  readonly to?: string
  readonly status?: Redirect['status']
}

export function updateRedirect(
  token: string,
  from: string,
  input: UpdateRedirectInput,
): Promise<Redirect> {
  return request(`/api/redirects${queryString({ from })}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteRedirect(token: string, from: string): Promise<void> {
  await request(`/api/redirects${queryString({ from })}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

// ---- Prefix patterns (fiche 12 task 4) -----------------------------------

export interface RedirectPattern {
  readonly id: string
  readonly fromPrefix: string
  readonly toPrefix: string
  readonly status: 301 | 302
  readonly createdAt: number
}

export function listRedirectPatterns(token: string): Promise<readonly RedirectPattern[]> {
  return request('/api/redirects/patterns', { headers: authHeader(token) })
}

export interface CreateRedirectPatternInput {
  readonly fromPrefix: string
  readonly toPrefix: string
  readonly status?: 301 | 302
}

export function createRedirectPattern(
  token: string,
  input: CreateRedirectPatternInput,
): Promise<RedirectPattern> {
  return request('/api/redirects/patterns', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteRedirectPattern(token: string, fromPrefix: string): Promise<void> {
  await request(`/api/redirects/patterns${queryString({ fromPrefix })}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

// ---- CSV import/export (fiche 12 task 4) ---------------------------------

export function exportRedirectsCsv(token: string): Promise<{ csv: string; filename: string }> {
  return request('/api/redirects/export', { headers: authHeader(token) })
}

export interface ImportRowOutcome {
  readonly line: number
  readonly from: string
  readonly to: string
  readonly status: number
  readonly outcome: 'create' | 'update' | 'unchanged' | 'duplicate' | 'loop'
  readonly detail?: string
}

export interface ImportIssue {
  readonly line: number
  readonly detail: string
}

export interface ImportPreview {
  readonly rows: readonly ImportRowOutcome[]
  readonly issues: readonly ImportIssue[]
  readonly summary: Readonly<Record<string, number>>
}

export interface ImportResult {
  readonly created: number
  readonly updated: number
  readonly skipped: number
  readonly failed: readonly {
    readonly line: number
    readonly from: string
    readonly error: string
  }[]
}

export function previewRedirectsImport(token: string, csv: string): Promise<ImportPreview> {
  return request('/api/redirects/import', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ csv, apply: false }),
  })
}

export function applyRedirectsImport(token: string, csv: string): Promise<ImportResult> {
  return request('/api/redirects/import', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ csv, apply: true }),
  })
}

// ---- The 404 log (fiche 12 task 1) ---------------------------------------

export interface NotFoundEntry {
  readonly path: string
  readonly hits: number
  readonly firstSeen: number
  readonly lastSeen: number
  readonly lastReferrer: string | null
}

export function listNotFound(token: string, limit?: number): Promise<readonly NotFoundEntry[]> {
  return request(`/api/not-found${queryString({ limit })}`, { headers: authHeader(token) })
}

export async function dismissNotFound(token: string, path: string): Promise<void> {
  await request(`/api/not-found${queryString({ path })}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
