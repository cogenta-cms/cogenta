import type { DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createApiKeyStore } from './api-keys.js'
import { createAuditLog } from './audit.js'
import { createAuditIntegrityStore } from './audit-integrity.js'
import { createCredentialStore } from './credentials.js'
import { createAuthService } from './login.js'
import { createRateLimiter } from './rate-limit.js'
import { createPasswordResetStore } from './resets.js'
import { createSessionStore } from './sessions.js'
import { ensureAuthTables } from './tables.js'
import { createUserStore } from './users.js'
import type { WebAuthnConfig } from './webauthn.js'

export interface AuthStoreOptions {
  readonly db: DatabaseHandle
  readonly signingKey: string
  readonly collections: readonly CollectionDefinition[]
  /** Shown in the authenticator app next to the account name. Defaults to "Cogenta". */
  readonly issuer?: string
  /** Absent means passkeys are off. */
  readonly webauthn?: WebAuthnConfig
  readonly now?: () => number
}

/** Every piece of this package, wired together against one connection. */
export interface AuthStore {
  readonly users: ReturnType<typeof createUserStore>
  readonly credentials: ReturnType<typeof createCredentialStore>
  readonly sessions: ReturnType<typeof createSessionStore>
  readonly audit: ReturnType<typeof createAuditLog>
  /** The scheduled counterpart to `audit.verify()` — fiche 21 task 3. */
  readonly auditIntegrity: ReturnType<typeof createAuditIntegrityStore>
  readonly rateLimit: ReturnType<typeof createRateLimiter>
  readonly login: ReturnType<typeof createAuthService>
  /** Self-service "forgot password" tokens (L13's HTTP route, `resets.ts`). */
  readonly resets: ReturnType<typeof createPasswordResetStore>
  readonly apiKeys: ReturnType<typeof createApiKeyStore>
}

export async function createAuthStore(options: AuthStoreOptions): Promise<AuthStore> {
  await ensureAuthTables(options.db)
  const now = options.now ?? Date.now
  const audit = createAuditLog(options.db, now)

  return {
    users: createUserStore(options.db, now),
    credentials: createCredentialStore(options.db, now),
    sessions: createSessionStore(options.db, now),
    audit,
    auditIntegrity: createAuditIntegrityStore(options.db, audit, { now }),
    rateLimit: createRateLimiter(options.db, now),
    resets: createPasswordResetStore(options.db, now),
    apiKeys: createApiKeyStore(options.db, now),
    login: createAuthService({
      db: options.db,
      signingKey: options.signingKey,
      collections: options.collections,
      now,
      ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
      ...(options.webauthn === undefined ? {} : { webauthn: options.webauthn }),
    }),
  }
}
