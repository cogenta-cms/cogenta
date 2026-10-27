import type { AccessContext, RestResponse } from '@cogenta/api'
import type { Logger } from '@cogenta/core'
import type { Site } from './serve.js'

/** `/sitemap.xml` and the `/sitemap-N.xml` chunks a large site splits into. */
/**
 * Every mutation lands in `@cogenta/auth`'s hash-chained audit log
 * (`packages/auth/src/audit.ts`), which existed since L2's own `AuthStore`
 * was built but had no writer until now. Recording here, at the transport
 * boundary, rather than inside `ContentService`/`MediaRouter`, means every
 * route that mutates something is covered by one place instead of every
 * write path remembering to call it — the same reasoning that keeps actor
 * resolution itself at this layer rather than duplicated per route.
 *
 * Never blocks or fails the response it is auditing: a write that succeeded
 * must reach the caller whether or not the audit row could be appended, and
 * a broken audit log is something `verify()` surfaces on its own.
 */
export async function recordContentAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  body: unknown,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return
  const segments = pathname
    .replace(/^\/api\/content\/?/u, '')
    .split('/')
    .filter((segment) => segment.length > 0)
  const [collection, id, subAction] = segments

  // A search-and-replace that was applied (L34) crosses collections, so it
  // is recorded once per entry it wrote — the audit log is a per-entry
  // history, and "which pages did that rename touch?" has to be answerable
  // from it. Each row carries the phrase and its replacement, never the text
  // around them: that is in the entry's own version history already.
  if (collection === '-' && id === 'replace') {
    const report = (response.body as { readonly data?: ReplaceAuditReport } | null)?.data
    if (report?.applied !== true) return
    const request = body as { readonly find?: unknown; readonly replace?: unknown } | null
    for (const written of report.entries ?? []) {
      await site.auth.audit
        .record({
          actorId: actor.id,
          actorRoles: actor.roles,
          action: 'content.replace',
          collection: written.collection,
          entryId: written.entryId,
          diff: {
            _replace: {
              find: typeof request?.find === 'string' ? request.find : '',
              replace: typeof request?.replace === 'string' ? request.replace : '',
              occurrences: written.occurrences,
            },
          },
        })
        .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    }
    return
  }
  if (collection === undefined || collection === '-') return

  const action = contentAuditAction(method, subAction)
  if (action === null) return

  const entryId = id ?? responseId(response)
  const values =
    typeof body === 'object' && body !== null && 'values' in body
      ? (body as { readonly values?: Record<string, unknown> }).values
      : undefined
  const version = responseVersion(response)

  // Fiche 30 task 5: which fields (if any) were filled by an accepted
  // assistant suggestion since the last save. Not a contract A field — this
  // never reaches `store.update`, `parseUpdateBody` strips it as an unknown
  // key — only the audit trail, so "a paragraph written" and "a paragraph
  // accepted from a suggestion" read differently in the log even though both
  // produce the same `content.update`.
  const assistApplied =
    typeof body === 'object' && body !== null && 'assistApplied' in body
      ? (
          body as {
            readonly assistApplied?: readonly { readonly field: string; readonly tool: string }[]
          }
        ).assistApplied
      : undefined
  const diff =
    values === undefined && (assistApplied === undefined || assistApplied.length === 0)
      ? undefined
      : {
          ...(values === undefined ? {} : values),
          ...(assistApplied === undefined || assistApplied.length === 0
            ? {}
            : { _assistApplied: assistApplied }),
        }

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      collection,
      ...(entryId === undefined ? {} : { entryId }),
      ...(diff === undefined ? {} : { diff }),
      ...(version === undefined ? {} : { version }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

export async function recordAuthAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
  body?: unknown,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) {
    // A refused password attempt is the "who is trying to get in" signal a
    // security-conscious admin expects an audit log to carry (WordPress and
    // its security plugins log these too) — only the first step, though:
    // TOTP, recovery-code and passkey completion reuse the same
    // `AUTH_INVALID_CREDENTIALS`-family codes for a different meaning each
    // time, so recording those here under one generic action would misname
    // what actually failed.
    // A refused step-up is the signal that someone holding a session is
    // guessing the password or a code to change a second factor. The attempt is
    // recorded; the secret that was typed never is.
    if (pathname.endsWith('/api/auth/step-up') && method === 'POST') {
      await site.auth.audit
        .record({ actorId: actor.id, actorRoles: actor.roles, action: 'auth.step_up_failed' })
        .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
      return
    }

    if (pathname.endsWith('/api/auth/login') && method === 'POST') {
      const email =
        body !== null &&
        typeof body === 'object' &&
        typeof (body as { email?: unknown }).email === 'string'
          ? (body as { email: string }).email
          : null
      await site.auth.audit
        .record({
          actorId: null,
          actorRoles: [],
          action: 'auth.login_failed',
          ...(email === null ? {} : { diff: { email } }),
        })
        .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    }
    return
  }

  if (pathname.endsWith('/api/auth/session') && method === 'DELETE') {
    await site.auth.audit
      .record({ actorId: actor.id, actorRoles: actor.roles, action: 'auth.logout' })
      .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    return
  }

  // Changes to the second factor (pentest 2026-10-26, F-01): who turned it on,
  // off or replaced it, and when someone re-confirmed their identity to do so.
  // Never the secret, a code or a password — the action name is all that is kept.
  const factorAction = secondFactorAuditAction(method, pathname)
  if (factorAction !== null) {
    await site.auth.audit
      .record({ actorId: actor.id, actorRoles: actor.roles, action: factorAction })
      .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    return
  }

  // Login, TOTP completion and passkey completion all land here the same
  // way: whichever step actually produced a session is the one worth
  // recording, not every intermediate MFA round trip.
  const data = (response.body as { readonly data?: { readonly status?: unknown } } | null)?.data
  if (data?.status !== 'session') return
  const user = (data as { readonly user?: { readonly id?: unknown; readonly roles?: unknown } })
    .user
  const userId = typeof user?.id === 'string' ? user.id : null
  const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : []

  // A recovery-code sign-in is its own, more specific event (fiche 18 task
  // 1): "a code was consumed" is worth remarking on in a way an ordinary
  // login is not — it is what `createRecoveryCodeUsedNoticeSource` looks
  // for — so it is recorded instead of the generic `auth.login`, not in
  // addition to it.
  const action = pathname.endsWith('/api/auth/recovery-code')
    ? 'auth.recovery_code_used'
    : 'auth.login'

  await site.auth.audit
    .record({ actorId: userId, actorRoles: roles, action })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/** The audit action for a successful change to an account's second factor, or `null` for any other auth route. */
function secondFactorAuditAction(method: string, pathname: string): string | null {
  if (method === 'DELETE' && pathname.endsWith('/api/auth/totp')) return 'auth.totp_disabled'
  if (method !== 'POST') return null
  if (pathname.endsWith('/api/auth/totp/enrol/confirm')) return 'auth.totp_enabled'
  if (pathname.endsWith('/api/auth/totp/recovery-codes/regenerate')) {
    return 'auth.recovery_codes_regenerated'
  }
  if (pathname.endsWith('/api/auth/webauthn/register/complete')) return 'auth.passkey_added'
  if (pathname.endsWith('/api/auth/step-up')) return 'auth.step_up'
  return null
}

export function responseId(response: RestResponse): string | undefined {
  const data = (response.body as { readonly data?: { readonly id?: unknown } } | null)?.data
  return typeof data?.id === 'string' ? data.id : undefined
}

/**
 * The content version a create/update/restore/publish response just
 * produced — `SerialisedEntry.version`, a system field on every serialised
 * entry. Feeds `RecordAuditInput.version` (fiche 21 task 1), which is what
 * lets the audit detail view ask `GET .../diff?from={version-1}&to={version}`
 * instead of re-deriving one.
 */
export function responseVersion(response: RestResponse): number | undefined {
  const data = (response.body as { readonly data?: { readonly version?: unknown } } | null)?.data
  return typeof data?.version === 'number' ? data.version : undefined
}

/**
 * The audit action a `/api/content/*` request stands for, or `null` for a
 * read (`history`/`diff`/`preview`/`translations`, or an unrecognised
 * sub-route this layer should not guess about).
 *
 * Found while wiring the trash screen's "deleted by" column (fiche 07 task
 * 3): `untrash` and `purge` fell through to `null` here, alongside
 * `unpublish` and `duplicate` — four real mutations silently missing from
 * the audit log despite the header comment above claiming every mutation
 * lands in it. All four are real writes and are named the same way
 * `publish`/`restore` already were.
 */
export function contentAuditAction(method: string, subAction: string | undefined): string | null {
  switch (subAction) {
    case 'publish':
      return 'content.publish'
    case 'unpublish':
      return 'content.unpublish'
    case 'duplicate':
      return 'content.duplicate'
    case 'restore':
      return 'content.restore'
    case 'untrash':
      return 'content.untrash'
    case 'purge':
      return 'content.purge'
    // Who may read a page is a decision of its own (`schema@2.3`), and one an
    // auditor will ask about: "who made this note public?". Found missing
    // while wiring L34 — it fell to `default` and was never recorded.
    case 'visibility':
      return 'content.visibility'
    case 'history':
    case 'diff':
    case 'preview':
    case 'translations':
      return null
    case undefined:
      if (method === 'POST') return 'content.create'
      if (method === 'PATCH' || method === 'PUT') return 'content.update'
      if (method === 'DELETE') return 'content.delete'
      return null
    default:
      return null
  }
}

/** The part of a `/-/replace` answer the audit log reads. */
export interface ReplaceAuditReport {
  readonly applied?: boolean
  readonly entries?: readonly {
    readonly entryId: string
    readonly collection: string
    readonly occurrences: number
  }[]
}
