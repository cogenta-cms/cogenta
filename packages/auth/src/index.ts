/**
 * `@cogenta/auth` — identity, sessions, credentials and the audit log.
 *
 * Contract A stops at "roles are an open set of names a collection's
 * permissions declare" and leaves who attaches a role to a real person to L2.
 * This package is that attachment: users, password/TOTP/WebAuthn credentials,
 * bearer sessions, login-attempt backoff, MFA enforcement for sensitive
 * roles, and the hash-chained audit log L4's agents will write to as well.
 */

export type { ApiKeyStore, ListApiKeysOptions, RotateApiKeyOptions } from './api-keys.js'
export {
  createApiKeyStore,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  looksLikeApiKey,
} from './api-keys.js'
export type {
  AuditChainPoint,
  AuditFilter,
  AuditLog,
  AuditPruneResult,
  AuditVerifyRangeResult,
} from './audit.js'
export { classifyAuditActor, createAuditLog } from './audit.js'
export type { AuditIntegrityStatus, AuditIntegrityStore } from './audit-integrity.js'
export { createAuditIntegrityStore } from './audit-integrity.js'
export type { CredentialStore, WebAuthnCredentialData } from './credentials.js'
export { createCredentialStore } from './credentials.js'
export type {
  AuthService,
  AuthServiceOptions,
  LoginContext,
  LoginResult,
  RecoveryCodesIssued,
} from './login.js'
export { createAuthService } from './login.js'
export { requiresMfa, sensitiveRoles } from './mfa.js'
export { hashPassword, verifyPassword } from './password.js'
export type { LoginAttemptSummary, RateLimiter } from './rate-limit.js'
export { createRateLimiter, LOGIN_ATTEMPT_WINDOW_MS } from './rate-limit.js'
export {
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
  verifyRecoveryCode,
} from './recovery-codes.js'
export type {
  IssuedPasswordReset,
  PasswordResetOutcome,
  PasswordResetStore,
  PendingReset,
} from './resets.js'
export { createPasswordResetStore, PASSWORD_RESET_TTL_MS } from './resets.js'
export type { SessionStore } from './sessions.js'
export { createSessionStore } from './sessions.js'
export type { AuthStore, AuthStoreOptions } from './store.js'
export { createAuthStore } from './store.js'
export { ensureAuthTables, TABLES as AUTH_TABLES } from './tables.js'
export type { VerifyTotpOptions } from './totp.js'
export {
  assertTotpSecretFormat,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from './totp.js'
export * from './types.js'
export type { ParsedUserAgent } from './user-agent.js'
export { parseUserAgent } from './user-agent.js'
export type { UserStore } from './users.js'
export { createUserStore } from './users.js'
export type {
  AuthenticationOptions,
  RegistrationOptions,
  WebAuthnAuthenticationResult,
  WebAuthnConfig,
} from './webauthn.js'
export {
  beginWebAuthnAuthentication,
  beginWebAuthnRegistration,
  completeWebAuthnAuthentication,
  completeWebAuthnRegistration,
} from './webauthn.js'
