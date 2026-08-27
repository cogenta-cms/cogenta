import {
  AUDIT_ACTOR_KINDS,
  type AuditActorKind,
  type AuditEntry,
  type AuditIntegrityStatus,
  type AuditLog,
  classifyAuditActor,
} from '@cogenta/auth'
import { CogentaError, isCogentaError } from '@cogenta/core'
import type { ContentDiff } from '@cogenta/schema'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/audit` — the hash-chained log `@cogenta/auth` already keeps
 * (`packages/auth/src/audit.ts`), read-only and restricted to `admin`: it
 * names every actor's writes across the whole site, which is exactly the
 * kind of thing a role below `admin` should not be able to browse.
 *
 * Fiche 21 adds four routes on top of the original list/verify:
 *  - `GET /{id}` — one entry's detail, task 1.
 *  - `GET /export` — the filtered view as CSV or JSON, task 2.
 *  - `GET|POST /integrity` — the scheduled check's last outcome, and a way
 *    to run a fresh (persisted) one on demand, task 3.
 * `actorKind` and `until` are new filters on the existing list route,
 * tasks 2 and 4.
 */

export interface AuditActorLookup {
  /** A human's email, or `null` if the id no longer resolves to one. */
  byId(id: string): Promise<{ readonly email: string } | null>
}

export interface AuditApiKeyLookup {
  /** Every key's `{id, name}` — small enough on any real site to list rather than look up one at a time. */
  list(): Promise<readonly { readonly id: string; readonly name: string }[]>
}

export interface AuditRouterOptions {
  readonly audit: AuditLog
  /**
   * Computes a structural diff between two content versions — exactly the
   * function `GET /{collection}/{id}/diff` already calls
   * (`ContentService.diff`), reused rather than re-derived (task 1: "ne pas
   * dupliquer le diff"). Absent means the detail view never offers one.
   */
  readonly diff?: (
    actor: Actor,
    collection: string,
    entryId: string,
    from: number,
    to: number,
  ) => Promise<ContentDiff>
  /** Resolves a human actor to an email for the detail view. Absent falls back to the raw id. */
  readonly users?: AuditActorLookup
  /** Resolves an API-key actor to its name for the detail view. Absent falls back to the raw id. */
  readonly apiKeys?: AuditApiKeyLookup
  /**
   * The scheduled integrity check (task 3). Absent means `/integrity`
   * answers `{ data: null }` rather than 404 — the same "not configured,
   * not broken" shape `/api/assistant` uses.
   */
  readonly integrity?: {
    status(): Promise<AuditIntegrityStatus>
    check(options?: { readonly full?: boolean }): Promise<{ readonly status: AuditIntegrityStatus }>
  }
  /** Mount point. `/api/audit` by default. */
  readonly basePath?: string
}

export interface AuditRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/audit'
/** Bounded so an admin cannot ask this route to hold a million rows in memory at once. */
const MAX_EXPORT_ENTRIES = 10_000
/**
 * Fiche 67 task 1: what `GET /api/audit` (the screen, not `/export`) answers
 * with when the caller sends no `limit` — the same page size discipline
 * `users-router.ts`'s `DEFAULT_PAGE_SIZE` follows. `parseLimit`'s existing
 * ceiling of 200 is untouched; only the *default* when nothing is asked for
 * changes, from "200, unpaginated" to "50, paginated".
 */
const DEFAULT_LIST_LIMIT = 50

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may read the audit log.',
    hint: 'Ask someone with the admin role to check this for you.',
  })
}

function unauthenticated(): CogentaError {
  return new CogentaError({
    code: 'UNAUTHENTICATED',
    message: 'Sign in to see your activity.',
    hint: 'Send "Authorization: Bearer <token>" from an existing session.',
  })
}

/** How many entries `GET /api/audit/me` answers with when the caller sends no `limit` — fiche 18 task 4 asks for "the last twenty". */
const MY_ACTIVITY_DEFAULT_LIMIT = 20

/** The most `?limit=` may ever widen "my activity" to — a personal list, not an export. */
const MY_ACTIVITY_MAX_LIMIT = 100

function parseLimit(query: RestRequest['query'], max: number): number | undefined {
  const raw = single(query, 'limit')
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The "limit" query parameter is not a page size.',
      hint: `Pass a whole number between 1 and ${max}.`,
    })
  }
  return parsed
}

function parseActorKind(query: RestRequest['query']): AuditActorKind | undefined {
  const raw = single(query, 'actorKind')
  if (raw === undefined) return undefined
  if (!(AUDIT_ACTOR_KINDS as readonly string[]).includes(raw)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The "actorKind" query parameter is not one this API understands.',
      hint: `Use one of: ${AUDIT_ACTOR_KINDS.join(', ')}.`,
    })
  }
  return raw as AuditActorKind
}

interface ParsedAuditQuery {
  readonly actorId?: string
  readonly action?: string
  readonly collection?: string
  readonly since?: string
  readonly until?: string
  readonly actorKind?: AuditActorKind
}

function parseAuditQuery(query: RestRequest['query']): ParsedAuditQuery {
  const actorId = single(query, 'actorId')
  const action = single(query, 'action')
  const collection = single(query, 'collection')
  const since = single(query, 'since')
  const until = single(query, 'until')
  const actorKind = parseActorKind(query)
  return {
    ...(actorId === undefined ? {} : { actorId }),
    ...(action === undefined ? {} : { action }),
    ...(collection === undefined ? {} : { collection }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(actorKind === undefined ? {} : { actorKind }),
  }
}

/**
 * Opaque cursor for `GET /api/audit`'s pagination (fiche 67 task 1) — same
 * "not secret, just not a row id" reasoning and base64url-of-two-fields shape
 * as `users-router.ts`'s `encodeUsersCursor`/`decodeUsersCursor`, over the
 * `(at, id)` pair `AuditLog.list`'s `before` filter already expects.
 */
function encodeAuditCursor(at: string, id: string): string {
  return Buffer.from(`${at} ${id}`, 'utf8').toString('base64url')
}

function decodeAuditCursor(raw: string): { readonly at: string; readonly id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const separator = decoded.indexOf(' ')
    if (separator === -1) return null
    return { at: decoded.slice(0, separator), id: decoded.slice(separator + 1) }
  } catch {
    return null
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function notFound(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Audit routes are /api/audit, /api/audit/{id}, /api/audit/me, /api/audit/verify, /api/audit/export and /api/audit/integrity.',
  })
}

/** RFC 4180: quote a field that contains a comma, a quote or a line break. */
function csvField(value: string): string {
  if (/[",\n\r]/u.test(value)) return `"${value.replace(/"/gu, '""')}"`
  return value
}

function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

const CSV_HEADER = [
  'id',
  'at',
  'actorId',
  'actorKind',
  'actorRoles',
  'action',
  'collection',
  'entryId',
] as const

function entriesToCsv(entries: readonly AuditEntry[]): string {
  const rows = entries.map((entry) => [
    entry.id,
    entry.at,
    entry.actorId ?? '',
    classifyAuditActor(entry),
    entry.actorRoles.join('|'),
    entry.action,
    entry.collection ?? '',
    entry.entryId ?? '',
  ])
  // A leading UTF-8 BOM so a spreadsheet opens accented characters correctly
  // — the same reasoning `packages/admin/src/lib/csv.ts` already documents.
  return `﻿${toCsv([[...CSV_HEADER], ...rows])}`
}

export function createAuditRouter(options: AuditRouterOptions): AuditRouter {
  const { audit } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  async function resolveActorLabel(
    entry: AuditEntry,
    kind: AuditActorKind,
  ): Promise<string | null> {
    if (entry.actorId === null) return null
    if (kind === 'api_key' && options.apiKeys !== undefined) {
      const keyId = entry.actorId.slice('apikey:'.length)
      const keys = await options.apiKeys.list()
      return keys.find((key) => key.id === keyId)?.name ?? null
    }
    if ((kind === 'human' || kind === 'agent') && options.users !== undefined) {
      const user = await options.users.byId(entry.actorId)
      return user?.email ?? null
    }
    return null
  }

  /** `null` when there is nothing to diff (a create, a version-less action) or `diff` was not wired in. */
  async function resolveDiff(
    entry: AuditEntry,
    actor: Actor,
  ): Promise<{ readonly diff: ContentDiff | null; readonly diffUnavailable: string | null }> {
    if (options.diff === undefined) return { diff: null, diffUnavailable: null }
    if (entry.collection === null || entry.entryId === null) {
      return { diff: null, diffUnavailable: 'not-a-content-action' }
    }
    if (entry.version === null) return { diff: null, diffUnavailable: 'no-version-recorded' }
    if (entry.version <= 1) return { diff: null, diffUnavailable: 'first-version' }

    try {
      const diff = await options.diff(
        actor,
        entry.collection,
        entry.entryId,
        entry.version - 1,
        entry.version,
      )
      return { diff, diffUnavailable: null }
    } catch (error) {
      // The versions either side of this action were pruned since (a
      // collection's `versioning.keep`) — the entry is still shown, just
      // without a diff, rather than the whole detail view failing.
      if (isCogentaError(error) && error.code === 'CONTENT_NOT_FOUND') {
        return { diff: null, diffUnavailable: 'version-no-longer-kept' }
      }
      // `admin` may read the audit log unconditionally, but the diff is
      // still computed through this collection's *own* permission rules —
      // R4, applied even here. A site that never granted `admin` an
      // authoring role on this one collection is unusual but not invalid,
      // and it must not turn the entire detail view into a 403: who did
      // what, when, is still exactly what this admin is allowed to see.
      if (isCogentaError(error) && error.code === 'FORBIDDEN') {
        return { diff: null, diffUnavailable: 'no-permission-on-collection' }
      }
      throw error
    }
  }

  return {
    handle: async (request, actor) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null || segments.length > 1) throw notFound()
        const [action] = segments
        const method = request.method.toUpperCase()

        // `GET /api/audit/me` — "my activity" (fiche 18 task 4), the one
        // audit route that is not admin-only. `actorId` is `actor.id`,
        // resolved from the bearer token by the transport layer before this
        // router ever runs — nothing in the request path or query can name a
        // different account, which is the whole point: the full log below is
        // `admin`-only precisely because it names *every* actor, and this
        // route must never become a second way to read it.
        if (action === 'me') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          if (actor.id === null) throw unauthenticated()
          const limit =
            parseLimit(request.query, MY_ACTIVITY_MAX_LIMIT) ?? MY_ACTIVITY_DEFAULT_LIMIT
          const entries = await audit.list({ actorId: actor.id, limit })
          return jsonResponse(200, { data: entries })
        }

        requireAdmin(actor)

        if (action === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const filter = parseAuditQuery(request.query)
          const pageSize = parseLimit(request.query, 200) ?? DEFAULT_LIST_LIMIT
          const afterRaw = single(request.query, 'after')
          const before =
            afterRaw === undefined ? undefined : (decodeAuditCursor(afterRaw) ?? undefined)

          // One extra row tells us whether a further page exists without a
          // separate count query — the same trick a `limit+1` fetch always
          // buys, sliced back off before the entries are ever handed out.
          const fetched = await audit.list({
            ...filter,
            ...(before === undefined ? {} : { before }),
            limit: pageSize + 1,
          })
          const hasMore = fetched.length > pageSize
          const entries = hasMore ? fetched.slice(0, pageSize) : fetched
          const last = entries[entries.length - 1]
          const nextCursor =
            hasMore && last !== undefined ? encodeAuditCursor(last.at, last.id) : null

          return jsonResponse(200, { data: entries, page: { hasMore, nextCursor } })
        }

        if (action === 'verify') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          await audit.verify()
          return jsonResponse(200, { data: { ok: true } })
        }

        if (action === 'export') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const format = single(request.query, 'format') ?? 'json'
          if (format !== 'json' && format !== 'csv') {
            throw new CogentaError({
              code: 'QUERY_INVALID',
              message: 'The "format" query parameter is not one this API understands.',
              hint: 'Use format=json or format=csv.',
            })
          }
          const filter = parseAuditQuery(request.query)
          const limit = parseLimit(request.query, MAX_EXPORT_ENTRIES) ?? MAX_EXPORT_ENTRIES
          const entries = await audit.list({ ...filter, limit })

          if (format === 'json') return jsonResponse(200, { data: entries })

          return {
            status: 200,
            body: entriesToCsv(entries),
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': 'attachment; filename="audit-log.csv"',
            },
          }
        }

        if (action === 'integrity') {
          if (options.integrity === undefined) return jsonResponse(200, { data: null })
          if (method === 'GET') return jsonResponse(200, { data: await options.integrity.status() })
          if (method === 'POST') {
            const result = await options.integrity.check({ full: true })
            return jsonResponse(200, { data: result.status })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        // Anything else is an entry id — the detail view (task 1).
        if (method !== 'GET') return methodNotAllowed(['GET'])
        const entry = await audit.get(action)
        if (entry === null) {
          throw new CogentaError({
            code: 'AUDIT_ENTRY_NOT_FOUND',
            message: `No audit entry has id "${action}".`,
            hint: 'Check the id against a recent GET /api/audit listing.',
          })
        }
        const actorKind = classifyAuditActor(entry)
        const [actorLabel, { diff, diffUnavailable }] = await Promise.all([
          resolveActorLabel(entry, actorKind),
          resolveDiff(entry, actor),
        ])
        return jsonResponse(200, { data: { entry, actorKind, actorLabel, diff, diffUnavailable } })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
