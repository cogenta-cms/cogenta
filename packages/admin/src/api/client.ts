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

/**
 * Two outcomes, not three. `totp_setup_required` is gone with ADR-0021: nobody
 * is turned away at sign-in for lacking a second factor, so there is no state in
 * which the login screen has to run an enrolment ceremony before it can let
 * someone in. Enrolment moved to the account's own profile.
 */
export type LoginResult =
  | { readonly status: 'session'; readonly session: LoginSession; readonly user: SessionUser }
  | {
      readonly status: 'mfa_required'
      readonly ticket: string
      readonly availableFactors: readonly ('totp' | 'webauthn')[]
    }

export interface TotpSetup {
  readonly secret: string
  /** `otpauth://` URI — shown as text pending a QR code renderer. */
  readonly uri: string
}

/** Ten single-use codes (fiche 18 task 1), shown to the person exactly once — the caller never sees them again after this response. */
export interface RecoveryCodesIssued {
  readonly recoveryCodes: readonly string[]
}

export interface RecoveryCodesStatus {
  readonly total: number
  readonly remaining: number
}

/** The same floor `assertPasswordPolicy` enforces server-side (fiche 18 task 3) — fetched rather than recopied by hand. */
export interface PasswordPolicy {
  readonly minLength: number
}

/**
 * `rememberMe: false` asks for a day-long session instead of the usual
 * sliding 30-day one (fiche 18 task 5). Omitted keeps today's behaviour.
 */
export function login(email: string, password: string, rememberMe?: boolean): Promise<LoginResult> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(rememberMe === undefined ? {} : { rememberMe }),
    }),
  })
}

/**
 * Always resolves the same way, whether or not `email` names a real
 * account — the server's response is deliberately identical either way
 * (`auth-router.ts`'s `forgotPassword`, the rule this UI must not undo by
 * showing a different message for a caught `ApiError`).
 */
export function forgotPassword(email: string): Promise<{ readonly message: string }> {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}

export function completeTotp(ticket: string, token: string): Promise<LoginResult> {
  return request('/api/auth/totp', { method: 'POST', body: JSON.stringify({ ticket, token }) })
}

/**
 * The recovery-code counterpart of `completeTotp` (fiche 18 task 1) — the
 * way back in when the authenticator that would have produced a TOTP code is
 * unavailable. Same ticket, a code instead of a 6-digit token.
 */
export function completeRecoveryCode(ticket: string, code: string): Promise<LoginResult> {
  return request('/api/auth/recovery-code', {
    method: 'POST',
    body: JSON.stringify({ ticket, code }),
  })
}

/**
 * Self-service TOTP, for an account that is already signed in.
 *
 * `token` is the session bearer token, and it is the *only* thing that says
 * which account is being changed — no route takes a user id, so the admin has
 * no way to ask the server to enrol somebody else even by mistake.
 */
export function beginTotpEnrolment(token: string): Promise<TotpSetup> {
  return request('/api/auth/totp/enrol', { method: 'POST', headers: authHeader(token) })
}

/**
 * Confirming enrolment mints ten recovery codes in the same step (fiche 18
 * task 1) — shown to the person exactly once, right here.
 */
export function confirmTotpEnrolment(token: string, code: string): Promise<RecoveryCodesIssued> {
  return request('/api/auth/totp/enrol/confirm', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ token: code }),
  })
}

export function disableTotp(token: string): Promise<void> {
  return request('/api/auth/totp', { method: 'DELETE', headers: authHeader(token) })
}

/** How many recovery codes this account still has unused. */
export function getRecoveryCodesStatus(token: string): Promise<RecoveryCodesStatus> {
  return request('/api/auth/totp/recovery-codes', { headers: authHeader(token) })
}

/** Replaces the batch wholesale, invalidating every code from the previous one. */
export function regenerateRecoveryCodes(token: string): Promise<RecoveryCodesIssued> {
  return request('/api/auth/totp/recovery-codes/regenerate', {
    method: 'POST',
    headers: authHeader(token),
  })
}

/** Public and read-only: the password floor, announced before it is enforced (fiche 18 task 3). */
export function getPasswordPolicy(): Promise<PasswordPolicy> {
  return request('/api/auth/password-policy')
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
