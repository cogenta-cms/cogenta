import type { EmailTransport } from '@cogenta/channels'
import { CogentaError, type RateLimitDriver } from '@cogenta/core'
import {
  checkFillDelay,
  checkHoneypot,
  checkSubmitRateLimit,
  type FormStore,
  hashIp,
  notifyNewSubmission,
  sendAutoresponder,
  type UpdateFormDefinitionInput,
} from '@cogenta/forms'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/forms` (contract G, ADR-0026) — form definitions and their
 * submissions, plus the CMS's second public write route:
 * `POST /api/forms/{name}/submit`.
 *
 * Everything under this mount point except that one route is admin-only,
 * checked here (same shape as `api-keys-router.ts`'s `requireAdmin` — there
 * is no per-collection permission vocabulary for a domain contract A never
 * declared). The submit route checks nothing about the caller's identity at
 * all: it is meant to be reached by an anonymous visitor, and its own
 * defences (honeypot, minimum fill delay, rate limit, full server-side
 * validation) are what stand in for a permission check there.
 */

export interface FormsRouterOptions {
  readonly forms: FormStore
  /** Absent on a site with no e-mail transport configured (R1/R2) — notifications and the autoresponder are then silently skipped, never a hard failure of the submission itself. */
  readonly emailTransport?: EmailTransport
  readonly rateLimit: RateLimitDriver
  /** Where the "review this submission" link in a notification e-mail points. */
  readonly adminUrl: string
  readonly basePath?: string
  readonly now?: () => number
}

export interface FormsRequestContext {
  readonly actor: Actor
  /**
   * The connecting client's address, resolved by the transport — never
   * trusted input. Same discipline `AnalyticsRequestContext` already
   * follows, and for the same reason `clientIpOf` in `@cogenta/cli`'s
   * `serve.ts` gives: reading a client-supplied `X-Forwarded-For` header
   * directly here would let anyone rotate it per request and step straight
   * around the per-IP submission limiter this route depends on.
   */
  readonly ip: string
}

export interface FormsRouter {
  handle(request: RestRequest, context: FormsRequestContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/forms'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage forms.',
    hint: 'Ask someone with the admin role to do this for you.',
  })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'This request needs a JSON object as its body.',
      hint: 'Send an object, not an array or a bare value.',
    })
  }
  return body as Record<string, unknown>
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${key}" is required and must be a non-empty string.`,
      hint: `Send "${key}" in the request body.`,
    })
  }
  return value
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
    .map((segment) => decodeURIComponent(segment))
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

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'FORM_UNKNOWN',
    message: 'No route matches this path.',
    hint: 'See the forms router documentation for the available routes.',
  })
}

export function createFormsRouter(options: FormsRouterOptions): FormsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const now = options.now ?? Date.now
  const { forms } = options

  return {
    handle: async (request, context) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()

        if (segments.length === 2 && segments[1] === 'submit') {
          return await handleSubmit(request, segments[0] as string, method, context.ip)
        }

        const { actor } = context
        if (segments[0] === 'submissions')
          return await submissionsRoute(request, actor, segments.slice(1), method)

        if (segments.length === 0) return await definitionsCollectionRoute(request, actor, method)
        if (segments.length === 1)
          return await definitionRoute(request, actor, segments[0] as string, method)

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  // ---------------------------------------------------------------- definitions

  async function definitionsCollectionRoute(
    request: RestRequest,
    actor: Actor,
    method: string,
  ): Promise<RestResponse> {
    if (method === 'GET') {
      requireAdmin(actor)
      return jsonResponse(200, { data: await forms.definitions.list() })
    }
    if (method === 'POST') {
      requireAdmin(actor)
      const body = asRecord(request.body)
      const fields = body['fields']
      if (!Array.isArray(fields)) {
        throw new CogentaError({
          code: 'FORM_DEFINITION_INVALID',
          message: '"fields" must be an array of field definitions.',
          hint: 'Add at least one field before saving.',
        })
      }
      const created = await forms.definitions.create({
        name: stringField(body, 'name'),
        label: stringField(body, 'label'),
        fields: fields as never,
        ...(typeof body['active'] === 'boolean' ? { active: body['active'] } : {}),
        ...(typeof body['confirmationMessage'] === 'string'
          ? { confirmationMessage: body['confirmationMessage'] }
          : {}),
        ...(body['redirectTo'] === null || typeof body['redirectTo'] === 'string'
          ? { redirectTo: body['redirectTo'] as string | null }
          : {}),
        ...(Array.isArray(body['notifyEmails'])
          ? { notifyEmails: body['notifyEmails'] as string[] }
          : {}),
        ...(typeof body['autoresponder'] === 'object' && body['autoresponder'] !== null
          ? { autoresponder: body['autoresponder'] as never }
          : {}),
        ...(typeof body['retainDays'] === 'number' ? { retainDays: body['retainDays'] } : {}),
      })
      return jsonResponse(201, { data: created })
    }
    return methodNotAllowed(['GET', 'POST'])
  }

  async function definitionRoute(
    request: RestRequest,
    actor: Actor,
    id: string,
    method: string,
  ): Promise<RestResponse> {
    requireAdmin(actor)
    if (method === 'GET') {
      const found = await forms.definitions.read(id)
      if (found === null) throw definitionNotFound(id)
      return jsonResponse(200, { data: found })
    }
    if (method === 'PATCH') {
      const body = asRecord(request.body)
      const patch: UpdateFormDefinitionInput = {
        ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
        ...(typeof body['label'] === 'string' ? { label: body['label'] } : {}),
        ...(Array.isArray(body['fields']) ? { fields: body['fields'] as never } : {}),
        ...(typeof body['active'] === 'boolean' ? { active: body['active'] } : {}),
        ...(typeof body['confirmationMessage'] === 'string'
          ? { confirmationMessage: body['confirmationMessage'] }
          : {}),
        ...(body['redirectTo'] === null || typeof body['redirectTo'] === 'string'
          ? { redirectTo: body['redirectTo'] as string | null }
          : {}),
        ...(Array.isArray(body['notifyEmails'])
          ? { notifyEmails: body['notifyEmails'] as string[] }
          : {}),
        ...(typeof body['autoresponder'] === 'object' && body['autoresponder'] !== null
          ? { autoresponder: body['autoresponder'] as never }
          : {}),
        ...(typeof body['retainDays'] === 'number' ? { retainDays: body['retainDays'] } : {}),
      }
      return jsonResponse(200, { data: await forms.definitions.update(id, patch) })
    }
    if (method === 'DELETE') {
      await forms.definitions.remove(id)
      return { status: 204, body: null, headers: {} }
    }
    return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
  }

  // ---------------------------------------------------------------- submit (public)

  /**
   * Always answers JSON — the same discipline `createSearchRouter` follows,
   * with `search-page.ts` as the public HTML wrapper around it rather than
   * HTML logic living in the router itself. Here that wrapper is
   * `@cogenta/cli`'s `forms-page.ts`: it is the one that can render this
   * site's actual theme, re-displaying submitted values and field errors
   * accessibly on a validation failure and issuing the redirect on success —
   * this package has no theme to render with, and must not invent one.
   *
   * No actor check: this route is reached by an anonymous visitor by
   * design. Its own defences (honeypot, minimum fill delay, per-IP rate
   * limit, full server-side validation) are what stand in for one.
   */
  async function handleSubmit(
    request: RestRequest,
    formName: string,
    method: string,
    clientIp: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])

    const body = asRecord(request.body ?? {})

    checkHoneypot(body)
    checkFillDelay(body, now)

    const ipHash = clientIp === '' || clientIp === 'unknown' ? null : hashIp(clientIp)
    await checkSubmitRateLimit(options.rateLimit, formName, ipHash)

    const definition = await forms.definitions.readByName(formName)
    if (definition === null) {
      throw new CogentaError({
        code: 'FORM_UNKNOWN',
        message: `No form named "${formName}".`,
        hint: 'Check the form name.',
      })
    }

    const submission = await forms.submissions.submit(formName, body, {
      ip: ipHash,
      referrer: request.headers?.['referer'] ?? null,
      userAgent: request.headers?.['user-agent'] ?? null,
    })

    if (options.emailTransport !== undefined) {
      await notifyNewSubmission({
        transport: options.emailTransport,
        definition,
        submission,
        adminUrl: `${options.adminUrl}/form-submissions/${submission.id}`,
      }).catch(() => undefined)

      const emailField = definition.fields.find((field) => field.kind === 'email')
      const recipient = emailField === undefined ? undefined : submission.values[emailField.name]
      if (typeof recipient === 'string' && recipient !== '') {
        await sendAutoresponder({
          transport: options.emailTransport,
          definition,
          recipientEmail: recipient,
          rateLimit: options.rateLimit,
        }).catch(() => undefined)
      }
    }

    return jsonResponse(201, {
      data: {
        id: submission.id,
        status: 'submitted',
        redirectTo: definition.redirectTo,
        confirmationMessage: definition.confirmationMessage,
      },
    })
  }

  // ---------------------------------------------------------------- submissions

  async function submissionsRoute(
    request: RestRequest,
    actor: Actor,
    rest: readonly string[],
    method: string,
  ): Promise<RestResponse> {
    requireAdmin(actor)

    if (rest.length === 0) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      const query = request.query ?? {}
      const formId = typeof query['formId'] === 'string' ? query['formId'] : undefined
      const status = typeof query['status'] === 'string' ? query['status'] : undefined
      const cursor = typeof query['cursor'] === 'string' ? query['cursor'] : undefined
      const limit = typeof query['limit'] === 'string' ? Number(query['limit']) : undefined
      const result = await forms.submissions.list({
        ...(formId === undefined ? {} : { formId }),
        ...(status === undefined ? {} : { status: status as never }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
      })
      return jsonResponse(200, { data: result.items, nextCursor: result.nextCursor })
    }

    if (rest.length === 1 && rest[0] === 'unread-count') {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      return jsonResponse(200, { data: { count: await forms.submissions.unreadCount() } })
    }

    if (rest.length === 1 && rest[0] === 'search') {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      const email = request.query?.['email']
      if (typeof email !== 'string' || email.trim() === '') {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: '"email" is required.',
          hint: 'Send ?email=... to search.',
        })
      }
      return jsonResponse(200, { data: await forms.submissions.searchByEmail(email) })
    }

    if (rest.length === 1 && rest[0] === 'by-email') {
      if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
      const email = request.query?.['email']
      if (typeof email !== 'string' || email.trim() === '') {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: '"email" is required.',
          hint: 'Send ?email=... to erase.',
        })
      }
      const erased = await forms.submissions.deleteByEmail(email)
      return jsonResponse(200, { data: { erased } })
    }

    if (rest.length === 1 && rest[0] === 'bulk') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const body = asRecord(request.body)
      const ids = body['ids']
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: '"ids" must be an array of submission ids.',
          hint: 'Send at least one id.',
        })
      }
      const action = body['action']
      if (action === 'delete') {
        const count = await forms.submissions.bulkRemove(ids as string[])
        return jsonResponse(200, { data: { updated: count } })
      }
      if (action === 'read' || action === 'archived' || action === 'spam' || action === 'new') {
        const count = await forms.submissions.bulkMarkStatus(ids as string[], action)
        return jsonResponse(200, { data: { updated: count } })
      }
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: `"${String(action)}" is not a bulk action.`,
        hint: 'Use one of: read, archived, spam, new, delete.',
      })
    }

    if (rest.length === 1) {
      const id = rest[0] as string
      if (method === 'GET') {
        const found = await forms.submissions.read(id)
        if (found === null) throw submissionNotFound(id)
        return jsonResponse(200, { data: found })
      }
      if (method === 'PATCH') {
        const body = asRecord(request.body)
        return jsonResponse(200, {
          data: await forms.submissions.markStatus(id, stringField(body, 'status') as never),
        })
      }
      if (method === 'DELETE') {
        await forms.submissions.remove(id)
        return { status: 204, body: null, headers: {} }
      }
      return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
    }

    throw noRoute()
  }
}

function definitionNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'FORM_UNKNOWN',
    message: `No form with id "${id}".`,
    hint: 'It may have been deleted.',
  })
}

function submissionNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'FORM_SUBMISSION_NOT_FOUND',
    message: `No submission with id "${id}".`,
    hint: 'It may have been deleted.',
  })
}
