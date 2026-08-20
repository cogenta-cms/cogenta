import { CogentaError, isCogentaError } from '@cogenta/core'
import { hashIp } from './ip-hash.js'
import { COMMENT_ANONYMOUS, type CommentActor, type CommentPermissionLayer } from './permissions.js'
import type { CommentRateLimiter } from './rate-limit.js'
import {
  type CommentSettingsStore,
  effectiveEnabled,
  effectiveModerationRequired,
} from './settings-store.js'
import { checkSpamHeuristics } from './spam.js'
import type { CommentModerationUpdate, CommentStore } from './store.js'
import { COMMENT_STATUSES, type CommentStatus } from './types.js'

/**
 * The moderation queue and the public write route, as one transport-free
 * router — same shape as `@cogenta/commerce`'s `createCommerceAdminRouter`
 * (`CommerceRequest`/`CommerceResponse`), copied deliberately rather than
 * putting this inside `@cogenta/api`: `@cogenta/api` has never depended on a
 * domain package, and a comment is exactly such a domain, the same way an
 * order is (ADR-0025). `cogenta serve` mounts this router directly, the way
 * it already mounts `createCommerceAdminRouter`.
 *
 * `POST /api/comments` (no id segment) is the one route on this router that
 * takes **no actor at all** — the fiche's own words: "la seule route
 * publique en écriture de tout le CMS". Every other route asserts a contract
 * F permission before doing anything (R4).
 */
export interface CommentsRequest {
  readonly method: string
  readonly path: string
  readonly query?: Readonly<Record<string, string | undefined>>
  readonly body?: unknown
  /** The caller's IP, as the transport saw it — hashed here, never stored raw (RGPD). `null` when unknown (a unit test, an internal call). */
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface CommentsResponse {
  readonly status: number
  readonly body: unknown
  /**
   * Only ever a `location` header, only ever on the public POST route, only
   * when the submission carried `redirectTo` — a plain `<form method=post>`
   * with no JavaScript cannot read a JSON response, so this is what lets it
   * land back on the page it came from instead of showing the visitor a raw
   * API body (fiche 15 task 6: "sans JavaScript, le formulaire doit
   * fonctionner"). Absent on every other route.
   */
  readonly headers?: Readonly<Record<string, string>>
}

export interface CommentsRouterOptions {
  readonly store: CommentStore
  readonly settings: CommentSettingsStore
  readonly rateLimiter: CommentRateLimiter
  readonly permissions: CommentPermissionLayer
  /** Resolves the site default for `discussion.enabled`/`discussion.moderationRequired` — read from `@cogenta/schema`'s site settings, never duplicated here. */
  readonly siteDefaults: () => Promise<{
    readonly enabled: boolean
    readonly moderationRequired: boolean
  }>
  /** Secret for `hashIp` (R7: read once by the caller, never by this router from the environment). */
  readonly ipHashSecret: string
  /** The hidden field a bot fills and a human never sees. Defaults to `website`. */
  readonly honeypotField?: string
  /** Minimum time between the form being served and the submission arriving. Defaults to 3s. */
  readonly minFillDelayMs?: number
  readonly basePath?: string
  readonly now?: () => Date
}

export interface CommentsRouter {
  handle(request: CommentsRequest, actor?: CommentActor): Promise<CommentsResponse>
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  COMMENT_NOT_FOUND: 404,
  COMMENT_BODY_INVALID: 400,
  COMMENT_AUTHOR_INVALID: 400,
  COMMENT_TARGET_INVALID: 400,
  COMMENT_TARGET_CLOSED: 403,
  COMMENT_PARENT_INVALID: 400,
  COMMENT_PARENT_TOO_DEEP: 400,
  COMMENT_STATUS_INVALID: 400,
  COMMENT_RATE_LIMITED: 429,
  COMMENT_SPAM_DETECTED: 422,
}

function errorResponse(error: unknown): CommentsResponse {
  if (isCogentaError(error)) {
    return {
      status: STATUS_BY_CODE[error.code] ?? 500,
      body: {
        error:
          error.hint === undefined
            ? { code: error.code, message: error.message }
            : { code: error.code, message: error.message, hint: error.hint },
      },
    }
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong.' } } }
}

function notFound(): CommentsResponse {
  return {
    status: 404,
    body: { error: { code: 'COMMENT_NOT_FOUND', message: 'No route matches this path.' } },
  }
}

function readObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'COMMENT_BODY_INVALID',
      message: 'This request needs a JSON or form object as its body.',
      hint: 'Send an object, not an array or a bare value.',
    })
  }
  return body as Record<string, unknown>
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CogentaError({
      code: 'COMMENT_BODY_INVALID',
      message: `"${key}" is required.`,
      hint: `Add "${key}" to the submitted form.`,
    })
  }
  return value
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * `redirectTo` is attacker-controlled (any visitor can post it) and it ends
 * up as an HTTP `Location` header, so it gets both checks that matter for
 * that specific use, not just "looks like a path":
 *
 * - **open redirect**: must start with exactly one `/`, never `//` or
 *   `/\` — the second rejects what the leading-slash check alone would
 *   miss, because some browsers normalise a leading `/\` to `//` before
 *   treating the rest as a scheme-relative host (`/\evil.example` would
 *   otherwise sail through a bare `startsWith('//')` check).
 * - **response splitting**: a `Location` header is one line of an HTTP
 *   response, so a CR or LF inside the value could inject a second header
 *   or split the response entirely. No legitimate site path ever contains
 *   one, so both are refused outright rather than stripped — stripping
 *   would silently turn an attack into "no attack visible here", refusing
 *   makes it fall back to the ordinary JSON response instead.
 */
function isSafeRedirectPath(value: string): boolean {
  if (!value.startsWith('/')) return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  if (/[\r\n]/u.test(value)) return false
  return true
}

export function createCommentsRouter(options: CommentsRouterOptions): CommentsRouter {
  const basePath = (options.basePath ?? '/api/comments').replace(/\/+$/u, '')
  const { permissions } = options
  const honeypotField = options.honeypotField ?? 'website'
  const minFillDelayMs = options.minFillDelayMs ?? 3_000
  const now = options.now ?? ((): Date => new Date())

  /**
   * The public POST route's real entry point. A plain `<form method=post>`
   * with no JavaScript cannot read a JSON body, so when the submission
   * carries a same-origin `redirectTo` (the page's own path, echoed back by
   * the theme's form — never trusted beyond "starts with /" and "no
   * protocol-relative host"), the outcome is a 303 redirect back to that
   * page with `?comment=<status|error>` rather than a JSON body. A caller
   * that never sends `redirectTo` (a JS-driven form, a test, an API client)
   * gets the JSON body exactly as before.
   */
  async function submitPublicComment(request: CommentsRequest): Promise<CommentsResponse> {
    const rawBody = readObject(request.body)
    const redirectTo = readOptionalString(rawBody, 'redirectTo')
    const isSafeRedirect = redirectTo !== undefined && isSafeRedirectPath(redirectTo)

    if (!isSafeRedirect) return submitPublicCommentJson(request)

    try {
      const result = await submitPublicCommentJson(request)
      const outcome = (result.body as { readonly status?: string } | undefined)?.status ?? 'ok'
      return {
        status: 303,
        headers: { location: `${redirectTo}?comment=${encodeURIComponent(outcome)}` },
        body: null,
      }
    } catch (error) {
      const code = isCogentaError(error) ? error.code : 'INTERNAL'
      return {
        status: 303,
        headers: { location: `${redirectTo}?comment=error&reason=${encodeURIComponent(code)}` },
        body: null,
      }
    }
  }

  async function submitPublicCommentJson(request: CommentsRequest): Promise<CommentsResponse> {
    const body = readObject(request.body)

    // ---- anti-bot, before anything else touches the database -----------
    // Honeypot: a hidden field only a bot fills in. A human never sees it,
    // so any non-empty value here is a bot, treated as spam without a
    // rejection message that would teach it what tripped it.
    const honeypot = body[honeypotField]
    const isHoneypotTripped = typeof honeypot === 'string' && honeypot.trim() !== ''

    // Minimum fill delay: the page embeds the server time it was rendered
    // (`_ts`) in a hidden field; a submission that arrives faster than a
    // human could plausibly have read the page and typed a comment is
    // treated the same way — never revealed as a distinct reason.
    const renderedAtRaw = body['_ts']
    const renderedAt = typeof renderedAtRaw === 'string' ? Number(renderedAtRaw) : Number.NaN
    const tooFast = Number.isFinite(renderedAt) && now().getTime() - renderedAt < minFillDelayMs

    if (isHoneypotTripped || tooFast) {
      throw new CogentaError({
        code: 'COMMENT_SPAM_DETECTED',
        message: 'This submission was rejected.',
        hint: 'If you are not a bot, wait a moment and try again without using any autofill on hidden fields.',
      })
    }

    const collection = readString(body, 'collection')
    const entryId = readString(body, 'entryId')
    const locale = readOptionalString(body, 'locale') ?? null
    const parentId = readOptionalString(body, 'parentId') ?? null
    const name = readString(body, 'name')
    const email = readString(body, 'email')
    const authorUrl = readOptionalString(body, 'authorUrl') ?? null
    const commentBody = readString(body, 'body')

    // ---- discussion policy ----------------------------------------------
    const [entrySettings, collectionSettings, defaults] = await Promise.all([
      options.settings.getEntry(collection, entryId),
      options.settings.getCollection(collection),
      options.siteDefaults(),
    ])
    if (!effectiveEnabled(entrySettings, collectionSettings, defaults.enabled)) {
      throw new CogentaError({
        code: 'COMMENT_TARGET_CLOSED',
        message: 'Comments are closed on this entry.',
        hint: 'The site or the entry has disabled comments here.',
      })
    }
    const moderationRequired = effectiveModerationRequired(
      collectionSettings,
      defaults.moderationRequired,
    )

    // ---- rate limiting, mandatory (fiche 15's own words) -----------------
    const ipHash =
      request.ip == null || request.ip === '' ? null : hashIp(options.ipHashSecret, request.ip)
    const target = `${collection}:${entryId}`
    await options.rateLimiter.check({ ipHash, target })

    // ---- non-AI spam heuristics -------------------------------------------
    const heuristics = checkSpamHeuristics(commentBody)

    // WordPress's rule, reused deliberately (fiche 15 task 2): a returning
    // commenter whose hashed IP already has an approved comment skips the
    // queue, unless moderation is mandatory for this collection or the
    // heuristics already flagged this one.
    let status: CommentStatus = moderationRequired ? 'pending' : 'approved'
    if (heuristics.suspect) {
      status = 'spam'
    } else if (moderationRequired && ipHash !== null) {
      const priorApproved = await options.store.countApprovedByIp(ipHash)
      if (priorApproved > 0) status = 'approved'
    }

    const created = await options.store.create({
      collection,
      entryId,
      locale,
      parentId,
      author: { name, email, url: authorUrl },
      body: commentBody,
      status,
      ipHash,
      userAgent: request.userAgent ?? null,
      provenance: 'human',
    })

    // Record the attempt only after a real write — a request refused for a
    // reason unrelated to volume (a bad email, a closed thread) should not
    // spend a visitor's rate-limit budget.
    await options.rateLimiter.record({ ipHash, target })

    // The visitor never learns which status a pending/spam split landed on
    // in more detail than this — the same "answer without a decision
    // rationale" the honeypot/delay branch already follows, so a spammer
    // cannot use the response to tune their attempt.
    return {
      status: 201,
      body: {
        id: created.id,
        status: created.status,
        message:
          created.status === 'approved'
            ? 'Your comment has been posted.'
            : 'Your comment has been received and is awaiting moderation.',
      },
    }
  }

  return {
    handle: async (request, actor = COMMENT_ANONYMOUS) => {
      try {
        if (!request.path.startsWith(basePath)) return notFound()
        const segments = request.path
          .slice(basePath.length)
          .split('/')
          .filter((segment) => segment !== '')
        const method = request.method.toUpperCase()

        // ---- POST /api/comments — the public write route -----------------
        if (segments.length === 0 && method === 'POST') {
          return await submitPublicComment(request)
        }

        // ---- GET /api/comments/permissions --------------------------------
        if (segments.length === 1 && segments[0] === 'permissions' && method === 'GET') {
          permissions.assert('comments.read', actor)
          return { status: 200, body: { roles: permissions.roles } }
        }

        // ---- GET /api/comments/counts --------------------------------------
        if (segments.length === 1 && segments[0] === 'counts' && method === 'GET') {
          permissions.assert('comments.read', actor)
          return { status: 200, body: await options.store.counts() }
        }

        // ---- GET /api/comments (moderation queue) ---------------------------
        if (segments.length === 0 && method === 'GET') {
          permissions.assert('comments.read', actor)
          const q = request.query ?? {}
          const status = COMMENT_STATUSES.includes(q.status as CommentStatus)
            ? (q.status as CommentStatus)
            : undefined
          const page = await options.store.list({
            ...(status === undefined ? {} : { status }),
            ...(q.collection === undefined ? {} : { collection: q.collection }),
            ...(q.entryId === undefined ? {} : { entryId: q.entryId }),
            ...(q.q === undefined ? {} : { search: q.q }),
            ...(q.limit === undefined ? {} : { limit: Number(q.limit) }),
            ...(q.offset === undefined ? {} : { offset: Number(q.offset) }),
          })
          return { status: 200, body: page }
        }

        // ---- POST /api/comments/bulk ------------------------------------
        if (segments.length === 1 && segments[0] === 'bulk' && method === 'POST') {
          permissions.assert('comments.moderate', actor)
          const body = readObject(request.body)
          const ids = body['ids']
          const status = body['status']
          if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
            throw new CogentaError({
              code: 'COMMENT_BODY_INVALID',
              message: '"ids" must be an array of strings.',
              hint: 'Send the list of comment ids to update.',
            })
          }
          if (!COMMENT_STATUSES.includes(status as CommentStatus)) {
            throw new CogentaError({
              code: 'COMMENT_STATUS_INVALID',
              message: `"${String(status)}" is not a known comment status.`,
              hint: `Use one of: ${COMMENT_STATUSES.join(', ')}.`,
            })
          }
          const updated = await options.store.bulkSetStatus(ids, status as CommentStatus, actor.id)
          return { status: 200, body: { updated } }
        }

        // ---- Settings: collection --------------------------------------
        if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'collection') {
          if (method !== 'GET' && method !== 'PUT') return notFound()
          if (method === 'GET') {
            permissions.assert('comments.read', actor)
            const collection = (request.query ?? {}).collection
            if (collection === undefined) {
              throw new CogentaError({
                code: 'COMMENT_TARGET_INVALID',
                message: '"collection" query parameter is required.',
                hint: 'Add ?collection=<name> to the request.',
              })
            }
            return { status: 200, body: await options.settings.getCollection(collection) }
          }
          permissions.assert('comments.settings', actor)
          const body = readObject(request.body)
          const collection = readString(body, 'collection')
          const enabled =
            typeof body['enabled'] === 'boolean' ? (body['enabled'] as boolean) : undefined
          const moderationRequired =
            typeof body['moderationRequired'] === 'boolean'
              ? (body['moderationRequired'] as boolean)
              : undefined
          return {
            status: 200,
            body: await options.settings.setCollection(collection, {
              ...(enabled === undefined ? {} : { enabled }),
              ...(moderationRequired === undefined ? {} : { moderationRequired }),
            }),
          }
        }

        // ---- Settings: entry ---------------------------------------------
        if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'entry') {
          if (method !== 'GET' && method !== 'PUT') return notFound()
          const q = request.query ?? {}
          if (method === 'GET') {
            permissions.assert('comments.read', actor)
            const collection = q.collection
            const entryId = q.entryId
            if (collection === undefined || entryId === undefined) {
              throw new CogentaError({
                code: 'COMMENT_TARGET_INVALID',
                message: '"collection" and "entryId" query parameters are required.',
                hint: 'Add ?collection=<name>&entryId=<id> to the request.',
              })
            }
            return { status: 200, body: await options.settings.getEntry(collection, entryId) }
          }
          permissions.assert('comments.settings', actor)
          const body = readObject(request.body)
          const collection = readString(body, 'collection')
          const entryId = readString(body, 'entryId')
          const enabled = body['enabled']
          if (enabled !== null && typeof enabled !== 'boolean') {
            throw new CogentaError({
              code: 'COMMENT_BODY_INVALID',
              message: '"enabled" must be a boolean or null (inherit).',
              hint: 'Send true, false, or null.',
            })
          }
          return {
            status: 200,
            body: await options.settings.setEntry(collection, entryId, enabled as boolean | null),
          }
        }

        // ---- routes with a single :id segment -----------------------------
        if (segments.length === 2) {
          const id = segments[0] ?? ''
          const action = segments[1]

          if (action === 'status' && method === 'POST') {
            permissions.assert('comments.moderate', actor)
            const body = readObject(request.body)
            const status = body['status']
            if (!COMMENT_STATUSES.includes(status as CommentStatus)) {
              throw new CogentaError({
                code: 'COMMENT_STATUS_INVALID',
                message: `"${String(status)}" is not a known comment status.`,
                hint: `Use one of: ${COMMENT_STATUSES.join(', ')}.`,
              })
            }
            return {
              status: 200,
              body: await options.store.setStatus(id, status as CommentStatus, actor.id),
            }
          }

          if (action === 'moderation' && method === 'POST') {
            permissions.assert('comments.moderate', actor)
            const body = readObject(request.body)
            const update: CommentModerationUpdate = {
              flagged: body['flagged'] === true,
              severity: (body['severity'] as CommentModerationUpdate['severity']) ?? 'none',
              reason: typeof body['reason'] === 'string' ? body['reason'] : '',
            }
            return { status: 200, body: await options.store.setModeration(id, update) }
          }

          if (action === 'reply' && method === 'POST') {
            permissions.assert('comments.reply', actor)
            const body = readObject(request.body)
            const parent = await options.store.get(id)
            if (parent === null) {
              throw new CogentaError({
                code: 'COMMENT_NOT_FOUND',
                message: `No comment "${id}" exists.`,
                hint: 'Check the id.',
              })
            }
            const created = await options.store.create({
              collection: parent.collection,
              entryId: parent.entryId,
              locale: parent.locale,
              parentId: parent.id,
              author: {
                userId: actor.id,
                name: readString(body, 'authorName'),
                email: readString(body, 'authorEmail'),
              },
              body: readString(body, 'body'),
              status: 'approved',
              provenance: 'human',
            })
            return { status: 201, body: created }
          }
        }

        // ---- GET /api/comments/:id, DELETE /api/comments/:id (purge) -------
        if (segments.length === 1) {
          const id = segments[0] ?? ''
          if (method === 'GET') {
            permissions.assert('comments.read', actor)
            const found = await options.store.get(id)
            if (found === null) {
              throw new CogentaError({
                code: 'COMMENT_NOT_FOUND',
                message: `No comment "${id}" exists.`,
                hint: 'Check the id.',
              })
            }
            return { status: 200, body: found }
          }
          if (method === 'DELETE') {
            permissions.assert('comments.purge', actor)
            await options.store.purge(id)
            return { status: 204, body: null }
          }
        }

        return notFound()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
