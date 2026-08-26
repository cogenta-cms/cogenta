import { randomUUID } from 'node:crypto'
import type { ChannelRegistry, EmailTransport } from '@cogenta/channels'
import { CogentaError, type RateLimitDriver, type StorageDriver } from '@cogenta/core'
import {
  assertAllowedFormFile,
  checkFillDelay,
  checkHoneypot,
  checkSubmitRateLimit,
  contentTypeForCategory,
  csvHeaderRow,
  csvSubmissionRow,
  csvValueColumns,
  type FormDefinition,
  type FormStore,
  type FormSubmission,
  hashIp,
  isFormFileValue,
  notifyNewSubmission,
  sendAutoresponder,
  notifyChannels as sendChannelNotifications,
  signFormFileToken,
  type UpdateFormDefinitionInput,
  verifyCaptcha,
  verifyFormFileToken,
} from '@cogenta/forms'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { isMultipartFormData } from './multipart.js'

/**
 * `/api/forms` (contract G, ADR-0026 + fiche 47) — form definitions and
 * their submissions, plus the CMS's second public write route:
 * `POST /api/forms/{name}/submit`.
 *
 * Everything under this mount point except that one route is admin-only,
 * checked here (same shape as `api-keys-router.ts`'s `requireAdmin` — there
 * is no per-collection permission vocabulary for a domain contract A never
 * declared). The submit route checks nothing about the caller's identity at
 * all: it is meant to be reached by an anonymous visitor, and its own
 * defences (honeypot, minimum fill delay, rate limit, full server-side
 * validation, and now byte-sniffed file uploads and an optional CAPTCHA)
 * are what stand in for a permission check there.
 */

export interface FormsRouterOptions {
  readonly forms: FormStore
  /** Absent on a site with no e-mail transport configured (R1/R2) — notifications and the autoresponder are then silently skipped, never a hard failure of the submission itself. */
  readonly emailTransport?: EmailTransport
  /** Fiche 47 task 4 — absent means every `notifyChannels` entry a form declares simply never fires (R1: no channel adapters configured, no notification, never a broken submit). */
  readonly channelRegistry?: ChannelRegistry
  /** Fiche 47 task 3 — absent means a `file` field always answers `FORM_FILE_REJECTED`: a form cannot silently accept an upload it has nowhere safe to put. */
  readonly storage?: StorageDriver
  /**
   * Fiche 47 tasks 2/3 — signs a `file` field's value when it has to survive
   * to a later step of a multi-step form (`_accumulated`), so a client can
   * carry it forward but never forge or edit it (a security review found
   * exactly this hole: without signing, a hand-crafted `{filename,
   * mimeType, size, storageKey}` was accepted with no real upload at all).
   * Absent means a `file` field simply cannot survive past the step it was
   * uploaded on — the same honest degradation `storage` being absent
   * already has, never a silently-trusted unsigned value.
   */
  readonly fileSigningSecret?: string
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

/** Letters, digits, dot, dash, underscore — the same whitelist `media-router.ts`'s own `sanitiseFilename` uses for the same reason (a storage key built from an attacker-controlled filename). */
function sanitiseFileName(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/gu, '-')
  return cleaned.length === 0 ? 'file' : cleaned
}

function definitionInputFromBody(body: Record<string, unknown>) {
  return {
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
    ...(Array.isArray(body['steps']) ? { steps: body['steps'] as never } : {}),
    ...(Array.isArray(body['notifyChannels'])
      ? { notifyChannels: body['notifyChannels'] as never }
      : {}),
    ...(typeof body['captcha'] === 'object' && body['captcha'] !== null
      ? { captcha: body['captcha'] as never }
      : {}),
  }
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

        if (segments.length === 2 && segments[1] === 'duplicate') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          requireAdmin(actor)
          return jsonResponse(201, {
            data: await forms.definitions.duplicate(segments[0] as string),
          })
        }

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
        ...definitionInputFromBody(body),
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
        ...definitionInputFromBody(body),
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
   * Resolves every `file` field this request can answer: a real upload
   * (sniffed against `field.acceptCategories`/`maxSizeBytes` and stored,
   * fiche 47 task 3) or a value carried forward from an earlier multi-step
   * page as a *signed* token inside `_accumulated` (fiche 47 task 2).
   * Mutates `raw` in place — the only place in this whole flow that ever
   * sees actual file bytes. Returns the storage keys freshly written this
   * call, so the caller can delete them if the rest of the request later
   * fails (never a value carried from an earlier, already-accepted step —
   * only what this exact call itself just stored).
   *
   * **Trust boundary, load-bearing**: a security review of this function
   * found that a plain JSON submission (`Content-Type: application/json`)
   * could hand this a `{filename, mimeType, size, storageKey}` object
   * *directly* as the field's value — no multipart upload at all — and the
   * old code trusted it outright, since `isFormFileValue` only checks
   * shape. That let an anonymous visitor claim any `storageKey` exists
   * without ever sending a byte. The fix: the *only* two ways a `file`
   * field's value survives to `validateSubmission` are (1) a real upload
   * this exact call just sniffed and stored, or (2) a token this exact
   * router previously signed with `signFormFileToken` — verified here with
   * `verifyFormFileToken`, never a bare shape check on client-supplied
   * text. Anything else for a `file` field, including a raw object, is
   * dropped; `validateSubmission`'s own required-ness check then refuses
   * the submission honestly rather than this function refusing silently.
   */
  async function resolveFileFields(
    definition: FormDefinition,
    request: RestRequest,
    raw: Record<string, unknown>,
  ): Promise<readonly string[]> {
    const multipart = isMultipartFormData(request.body) ? request.body : null
    const writtenKeys: string[] = []

    for (const field of definition.fields) {
      if (field.kind !== 'file') continue

      const uploaded = multipart?.files.find((file) => file.fieldName === field.name)
      if (uploaded !== undefined) {
        if (options.storage === undefined) {
          throw new CogentaError({
            code: 'FORM_FILE_REJECTED',
            message: `This form's "${field.name}" field cannot accept a file — no storage is configured for this site.`,
            hint: 'Ask an operator to configure storage before enabling a file field.',
            details: { field: field.name },
          })
        }
        const category = assertAllowedFormFile(field, uploaded.data)
        const storageKey = `forms/${definition.id}/${randomUUID()}/${sanitiseFileName(uploaded.filename)}`
        await options.storage.put(storageKey, Buffer.from(uploaded.data), {
          contentType: contentTypeForCategory(category),
        })
        writtenKeys.push(storageKey)
        raw[field.name] = {
          filename: uploaded.filename,
          mimeType: contentTypeForCategory(category),
          size: uploaded.data.length,
          storageKey,
        }
        continue
      }

      const carried = raw[field.name]
      if (
        typeof carried === 'string' &&
        carried.trim() !== '' &&
        options.fileSigningSecret !== undefined
      ) {
        const verified = verifyFormFileToken(options.fileSigningSecret, carried)
        if (verified !== null) {
          raw[field.name] = verified
          continue
        }
      }
      // A raw object, an unsigned/mis-signed string, or nothing at all —
      // never trusted. Deleted rather than left as-is so `isFormFileValue`
      // in `validate.ts` cannot be reached with attacker-controlled shape.
      delete raw[field.name]
    }

    return writtenKeys
  }

  function firstCaptchaToken(fields: Readonly<Record<string, unknown>>): string | undefined {
    const value = fields['cf-turnstile-response'] ?? fields['_captchaToken']
    return typeof value === 'string' ? value : undefined
  }

  /**
   * Always answers JSON — the same discipline `createSearchRouter` follows,
   * with `@cogenta/cli`'s `forms-page.ts` as the public HTML wrapper around
   * it. No actor check: this route is reached by an anonymous visitor by
   * design.
   *
   * Fiche 47 task 2's multi-step flow lives entirely here: an intermediate
   * step never calls `forms.submissions.submit` (so it is never itself
   * validated against required-ness — deliberate, see `types.ts`'s own
   * `FormStepDefinition` doc) and answers `status: 'step'` instead of a real
   * submission; the final step merges everything accumulated so far and
   * runs the exact same single-page path this route already had.
   */
  async function handleSubmit(
    request: RestRequest,
    formName: string,
    method: string,
    clientIp: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])

    const textFields: Record<string, unknown> = isMultipartFormData(request.body)
      ? { ...request.body.fields }
      : asRecord(request.body ?? {})

    checkHoneypot(textFields)
    checkFillDelay(textFields, now)

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

    const stepsCount = definition.steps.length
    const isMultiStep = stepsCount > 1

    let accumulated: Record<string, unknown> = {}
    if (isMultiStep) {
      const rawAccumulated = textFields['_accumulated']
      if (typeof rawAccumulated === 'string' && rawAccumulated.trim() !== '') {
        try {
          const parsed: unknown = JSON.parse(rawAccumulated)
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            accumulated = parsed as Record<string, unknown>
          }
        } catch {
          // A tampered/corrupted _accumulated is treated as empty — the
          // fields this very request carries still apply, and the final
          // validation pass will refuse anything genuinely missing.
        }
      }
    }

    const merged: Record<string, unknown> = { ...accumulated, ...textFields }
    delete merged['_accumulated']

    const writtenFileKeys = await resolveFileFields(definition, request, merged)

    // A security review's second finding: a real file this call just wrote
    // to storage must not become an orphan if anything after this point
    // fails (a bad CAPTCHA, a missing required field on another step) — an
    // anonymous, rate-limited-but-not-zero route is still a route, and
    // "write first, maybe never finish the request" is a real disk-fill
    // vector across enough attempts. Never touches a key carried forward
    // from an earlier, already-accepted step (`writtenFileKeys` only ever
    // holds what *this* call itself stored).
    async function cleanupWrittenFiles(): Promise<void> {
      if (options.storage === undefined) return
      for (const key of writtenFileKeys) {
        await options.storage.delete(key).catch(() => undefined)
      }
    }

    const rawStep = Number(textFields['_step'] ?? 0)
    const stepIndex = Number.isInteger(rawStep) && rawStep >= 0 ? rawStep : 0
    const isFinalStep = !isMultiStep || stepIndex >= stepsCount - 1

    if (isMultiStep && !isFinalStep) {
      const carried: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(merged)) {
        if (key.startsWith('_') && key !== '_ts') continue
        const field = definition.fields.find((candidate) => candidate.name === key)
        if (field?.kind === 'file') {
          // Never carry a raw file value forward as plain JSON (that is
          // exactly the forgeable shape the security review flagged) — sign
          // it, or drop it when signing is not configured for this site.
          if (isFormFileValue(value) && options.fileSigningSecret !== undefined) {
            carried[key] = signFormFileToken(options.fileSigningSecret, value)
          }
          continue
        }
        carried[key] = value
      }
      return jsonResponse(202, {
        data: {
          status: 'step',
          formName: definition.name,
          nextStep: stepIndex + 1,
          ts: typeof textFields['_ts'] === 'string' ? textFields['_ts'] : String(now()),
          values: carried,
        },
      })
    }

    try {
      await verifyCaptcha({
        captcha: definition.captcha,
        token: firstCaptchaToken(textFields),
        remoteIp: clientIp,
      })

      const submission = await forms.submissions.submit(formName, merged, {
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

      if (options.channelRegistry !== undefined) {
        await sendChannelNotifications({
          registry: options.channelRegistry,
          definition,
          submission,
          adminUrl: `${options.adminUrl}/form-submissions/${submission.id}`,
        }).catch(() => undefined)
      }

      return jsonResponse(201, {
        data: {
          id: submission.id,
          status: 'submitted',
          redirectTo: definition.redirectTo,
          confirmationMessage: definition.confirmationMessage,
        },
      })
    } catch (error) {
      await cleanupWrittenFiles()
      throw error
    }
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
      const from = typeof query['from'] === 'string' ? query['from'] : undefined
      const to = typeof query['to'] === 'string' ? query['to'] : undefined
      const search = typeof query['q'] === 'string' ? query['q'] : undefined
      const result = await forms.submissions.list({
        ...(formId === undefined ? {} : { formId }),
        ...(status === undefined ? {} : { status: status as never }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(search === undefined ? {} : { query: search }),
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

    if (rest.length === 2 && rest[1] === 'notes') {
      const submissionId = rest[0] as string
      if (method === 'GET') {
        return jsonResponse(200, { data: await forms.submissions.listNotes(submissionId) })
      }
      if (method === 'POST') {
        const body = asRecord(request.body)
        const note = await forms.submissions.addNote(submissionId, stringField(body, 'body'), {
          id: actor.id,
          label: actor.id ?? 'admin',
        })
        return jsonResponse(201, { data: note })
      }
      return methodNotAllowed(['GET', 'POST'])
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

export interface StreamSubmissionsCsvFilters {
  readonly formId?: string
  readonly status?: string
  readonly from?: string
  readonly to?: string
  readonly query?: string
}

const CSV_EXPORT_PAGE_SIZE = 500
// Bounds the column-discovery pre-pass for a cross-form export (see below) —
// the same "operator-triggered, never a hot path" cap `MAX_QUERY_SCAN_ROWS`
// already documents in `@cogenta/forms`'s `store.ts`.
const CSV_COLUMN_SCAN_ROWS = 2_000

async function* paginate(
  forms: FormStore,
  filters: StreamSubmissionsCsvFilters,
  limit: number,
): AsyncGenerator<readonly FormSubmission[]> {
  let cursor: string | undefined
  for (;;) {
    const page = await forms.submissions.list({
      ...filters,
      status: filters.status as never,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    })
    yield page.items
    if (page.nextCursor === null) return
    cursor = page.nextCursor
  }
}

/**
 * Task 9 — the server-streamed CSV export, reusing `csvHeaderRow`/
 * `csvSubmissionRow` (which reuse `csvField`'s CWE-1236 guard — the
 * non-regression this task explicitly requires, checked in
 * `packages/forms/test/csv.test.ts`). Exported for `@cogenta/cli`'s
 * `serve.ts`, which streams the HTTP response directly (outside
 * `RestResponse`'s JSON-only shape — same reasoning as `/api/media/{id}/file`).
 *
 * A CSV header has to be fixed before the first row is written, which is at
 * odds with "stream, never buffer the whole thing": for a single form
 * (`filters.formId` set — the common case, `form-submissions.tsx` always
 * filters to one when exporting) the column set is simply that form's own
 * field names, no scan needed. Exporting across every form at once has no
 * such fixed set, so it pays a bounded pre-pass (`CSV_COLUMN_SCAN_ROWS`) to
 * discover columns before the real, unbounded streaming pass — a value
 * outside that pre-pass's window contributes a column-less cell rather than
 * growing the header mid-stream, which is the honest limit of not buffering
 * the whole export.
 */
export async function* streamSubmissionsCsv(
  forms: FormStore,
  filters: StreamSubmissionsCsvFilters,
): AsyncGenerator<string> {
  let columns: readonly string[]
  if (filters.formId !== undefined) {
    const definition = await forms.definitions.read(filters.formId)
    columns = definition === null ? [] : definition.fields.map((field) => field.name)
  } else {
    const discovered = new Set<string>()
    let scanned = 0
    for await (const page of paginate(forms, filters, CSV_EXPORT_PAGE_SIZE)) {
      for (const name of csvValueColumns(page)) discovered.add(name)
      scanned += page.length
      if (scanned >= CSV_COLUMN_SCAN_ROWS) break
    }
    columns = [...discovered]
  }

  yield csvHeaderRow(columns)
  for await (const page of paginate(forms, filters, CSV_EXPORT_PAGE_SIZE)) {
    for (const submission of page) yield csvSubmissionRow(submission, columns)
  }
}
