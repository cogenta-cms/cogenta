import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { API_BASE, authHeader, request } from './http.js'

export { ApiError } from './http.js'

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
  return request('/api/auth/session', { headers: authHeader(token) })
}

interface WebAuthnLoginChallenge {
  readonly options: PublicKeyCredentialRequestOptionsJSON
  readonly ticket: string
}

function beginWebAuthnLogin(): Promise<WebAuthnLoginChallenge> {
  return request('/api/auth/webauthn/login/begin', { method: 'POST' })
}

function completeWebAuthnLogin(ticket: string, response: unknown): Promise<LoginResult> {
  return request('/api/auth/webauthn/login/complete', {
    method: 'POST',
    body: JSON.stringify({ ticket, response }),
  })
}

/**
 * The whole usernameless passkey ceremony in one call: fetch the challenge,
 * hand it to the browser's WebAuthn API, send the assertion back. The
 * account is whichever one the passkey the person picked belongs to — never
 * named up front.
 */
export async function loginWithPasskey(): Promise<LoginResult> {
  const challenge = await beginWebAuthnLogin()
  const response = await startAuthentication({ optionsJSON: challenge.options })
  return completeWebAuthnLogin(challenge.ticket, response)
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/session`, { method: 'DELETE', headers: authHeader(token) })
}

interface WebAuthnRegistrationChallenge {
  readonly options: PublicKeyCredentialCreationOptionsJSON
  readonly ticket: string
}

function beginWebAuthnRegistration(token: string): Promise<WebAuthnRegistrationChallenge> {
  return request('/api/auth/webauthn/register/begin', {
    method: 'POST',
    headers: authHeader(token),
  })
}

function completeWebAuthnRegistration(
  token: string,
  ticket: string,
  response: unknown,
  label: string | undefined,
): Promise<void> {
  return request('/api/auth/webauthn/register/complete', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ ticket, response, ...(label === undefined ? {} : { label }) }),
  })
}

/**
 * The registration counterpart of `loginWithPasskey()`: mint a challenge for
 * the already-signed-in account, hand it to the browser's WebAuthn API, send
 * the attestation back. `label` is what a future "manage your passkeys" list
 * would show next to this one — optional, since a device's own name is often
 * good enough on its own.
 */
export async function registerPasskey(token: string, label?: string): Promise<void> {
  const challenge = await beginWebAuthnRegistration(token)
  const response = await startRegistration({ optionsJSON: challenge.options })
  await completeWebAuthnRegistration(token, challenge.ticket, response, label)
}
