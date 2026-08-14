/**
 * The thin fetch layer over `/api/auth/*`.
 *
 * Base URL is same-origin by default — the production build is served by
 * `cogenta serve` itself — and overridable through `VITE_API_BASE_URL` for
 * local development against a separately running server (see the dev proxy
 * in `vite.config.ts`).
 */

const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? ''

export interface SessionUser {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
}

export interface LoginSession {
  readonly id: string
  readonly token: string
  readonly expiresAt: string
}

export type LoginResult =
  | { readonly status: 'session'; readonly session: LoginSession; readonly user: SessionUser }
  | {
      readonly status: 'mfa_required'
      readonly ticket: string
      readonly availableFactors: readonly ('totp' | 'webauthn')[]
    }
  | {
      /** This role needs MFA and has no factor set up — enrol one with the ticket. */
      readonly status: 'totp_setup_required'
      readonly ticket: string
    }

export interface TotpSetup {
  readonly secret: string
  /** `otpauth://` URI — shown as text pending a QR code renderer. */
  readonly uri: string
}

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  return (body as { data: T }).data
}

export function login(email: string, password: string): Promise<LoginResult> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function completeTotp(ticket: string, token: string): Promise<LoginResult> {
  return request('/api/auth/totp', { method: 'POST', body: JSON.stringify({ ticket, token }) })
}

export function beginTotpSetup(ticket: string): Promise<TotpSetup> {
  return request('/api/auth/totp-setup', { method: 'POST', body: JSON.stringify({ ticket }) })
}

export function confirmTotpSetup(ticket: string, token: string): Promise<LoginResult> {
  return request('/api/auth/totp-setup-confirm', {
    method: 'POST',
    body: JSON.stringify({ ticket, token }),
  })
}

export function currentSession(token: string): Promise<SessionUser> {
  return request('/api/auth/session', { headers: { authorization: `Bearer ${token}` } })
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/session`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
}
