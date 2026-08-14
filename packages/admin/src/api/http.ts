/**
 * The thin fetch layer every `/api/*` client module builds on.
 *
 * Base URL is same-origin by default — the production build is served by
 * `cogenta serve` itself — and overridable through `VITE_API_BASE_URL` for
 * local development against a separately running server (see the dev proxy
 * in `vite.config.ts`).
 */

export const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? ''

export class ApiError extends Error {
  readonly code: string
  readonly hint: string | undefined

  constructor(code: string, message: string, hint: string | undefined) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.hint = hint
  }
}

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
}

/** The whole parsed body — for a response that carries more than `data` alone, like a list page's `page.hasMore`/`page.nextCursor`. */
export async function requestBody<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (body as ErrorBody | null)?.error
    throw new ApiError(
      error?.code ?? 'INTERNAL',
      error?.message ?? 'The request could not be completed.',
      error?.hint,
    )
  }

  return body as T
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // A 204 (delete, revoke) has no body to parse at all — `requestBody`
  // already turned that into `null`, and there is no `.data` to unwrap.
  const body = await requestBody<{ data: T } | null>(path, init)
  return (body?.data ?? null) as T
}

export function authHeader(token: string): { readonly authorization: string } {
  return { authorization: `Bearer ${token}` }
}
