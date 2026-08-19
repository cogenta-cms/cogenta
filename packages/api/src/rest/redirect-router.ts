import { CogentaError, isCogentaError } from '@cogenta/core'
import type {
  AddRedirectPatternInput,
  RedirectPatternRecord,
  RedirectPatternStatus,
  RedirectPatternStore,
  RedirectReason,
  RedirectRecord,
  RedirectStatus,
  RedirectStore,
} from '@cogenta/schema'
import { normalisePath, REDIRECT_REASONS } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { parseCsv, stringifyCsv } from './csv.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/redirects` — the admin screen `RedirectStore` never had (L10 audit
 * follow-up), extended by fiche 12 with editing, search, pagination, prefix
 * patterns and CSV import/export.
 *
 * `RedirectStore` (`@cogenta/schema`) has existed since L10 task 2 and is
 * already applied to *every* public GET by `cogenta serve` — it only ever
 * lacked a way for an editor to add or remove a row without touching the
 * database by hand. This router is that missing route, and nothing else:
 * loop and self-redirect refusal is the store's own job (`add`/`update`
 * throw `CONTENT_REDIRECT_LOOP`/`CONTENT_ROUTE_INVALID`), not reimplemented
 * here.
 *
 *   GET    /api/redirects                    list (?collection=, ?locale=, ?q=, ?limit=, ?offset=)
 *   POST   /api/redirects                    create { from, to?, status?, reason? }
 *   PATCH  /api/redirects?from=/old          edit { to?, status? } — no gap where the old URL 404s
 *   DELETE /api/redirects?from=/old          remove the rule leaving `from`
 *
 *   GET    /api/redirects/patterns           list prefix rules
 *   POST   /api/redirects/patterns           create { fromPrefix, toPrefix, status? }
 *   DELETE /api/redirects/patterns?fromPrefix=/blog/*  remove
 *
 *   GET    /api/redirects/export             { data: { csv, filename } }
 *   POST   /api/redirects/import             { csv, apply? } — preview by default, writes only when `apply: true`
 *
 * Admin-only on every method, including every `GET`: a redirect table is a
 * technical routing decision (an old URL a renamed page still occupies), not
 * content — unlike a menu or a taxonomy, nothing here is ever served to a
 * visitor directly.
 *
 * `DELETE`/`PATCH` take `from` as a query parameter rather than a path
 * segment on purpose: a redirect's `from` is itself a site path, so
 * `/api/redirects/old` could never carry `/old/nested-page` without a second
 * layer of encoding that would only exist for this one route.
 */

export interface RedirectRouterOptions {
  readonly store: RedirectStore
  /** Prefix redirects (fiche 12 task 4). Absent means `/api/redirects/patterns` is not mounted at all. */
  readonly patterns?: RedirectPatternStore
  /** Mount point. `/api/redirects` by default. */
  readonly basePath?: string
  /** Rows a CSV export/import will read or write at most. Bounds a single admin action, not a running site. */
  readonly maxCsvRows?: number
}

export interface RedirectRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/redirects'
const DEFAULT_MAX_CSV_ROWS = 5000
const VALID_STATUSES: ReadonlySet<number> = new Set([301, 302, 307, 308, 410])
const VALID_PATTERN_STATUSES: ReadonlySet<number> = new Set([301, 302])

function isRedirectStatus(value: number): value is RedirectStatus {
  return VALID_STATUSES.has(value)
}

interface SerialisedRedirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: RedirectStatus
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: RedirectReason
  readonly createdAt: number
}

function serialise(record: RedirectRecord): SerialisedRedirect {
  return {
    id: record.id,
    from: record.from,
    to: record.to,
    status: record.status,
    collection: record.collection,
    entryId: record.entryId,
    locale: record.locale,
    reason: record.reason,
    createdAt: record.createdAt,
  }
}

interface SerialisedPattern {
  readonly id: string
  readonly fromPrefix: string
  readonly toPrefix: string
  readonly status: RedirectPatternStatus
  readonly createdAt: number
}

function serialisePattern(record: RedirectPatternRecord): SerialisedPattern {
  return {
    id: record.id,
    fromPrefix: record.fromPrefix,
    toPrefix: record.toPrefix,
    status: record.status,
    createdAt: record.createdAt,
  }
}

function invalidBody(what: string, hint: string): CogentaError {
  return new CogentaError({ code: 'CONTENT_ROUTE_INVALID', message: what, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function requiredField(body: Record<string, unknown>, field: string, example: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidBody(`This route needs a "${field}".`, `Send ${example}.`)
  }
  return value
}

/** `to` is optional at the body level — required unless `status` is 410 — and the store is the one authority on that. */
function optionalPath(body: Record<string, unknown>, field: 'to'): string | undefined {
  const value = body[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidBody(
      `"${field}" must be a non-empty string when present.`,
      'Omit "to" only when status is 410.',
    )
  }
  return value
}

function optionalStatus(body: Record<string, unknown>): RedirectStatus | undefined {
  if (!Object.hasOwn(body, 'status')) return undefined
  const status = body.status
  if (typeof status !== 'number' || !VALID_STATUSES.has(status)) {
    throw invalidBody(
      '"status" must be one of 301, 302, 307, 308, 410.',
      'Send one of those, or omit "status" to default to 301.',
    )
  }
  return status as RedirectStatus
}

function optionalPatternStatus(body: Record<string, unknown>): RedirectPatternStatus | undefined {
  if (!Object.hasOwn(body, 'status')) return undefined
  const status = body.status
  if (typeof status !== 'number' || !VALID_PATTERN_STATUSES.has(status)) {
    throw invalidBody(
      '"status" must be 301 or 302 for a prefix redirect.',
      'A prefix rule never needs 307/308/410 — send 301 or 302, or omit it.',
    )
  }
  return status as RedirectPatternStatus
}

function optionalReason(body: Record<string, unknown>): RedirectReason | undefined {
  if (!Object.hasOwn(body, 'reason')) return undefined
  const reason = body.reason
  if (typeof reason !== 'string' || !(REDIRECT_REASONS as readonly string[]).includes(reason)) {
    throw invalidBody(
      `"reason" must be one of: ${REDIRECT_REASONS.join(', ')}.`,
      'Drop "reason" to default to "manual".',
    )
  }
  return reason as RedirectReason
}

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: redirects can only be managed by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context)
}

function redirectNotFound(from: string): CogentaError {
  return new CogentaError({
    code: 'REDIRECT_UNKNOWN',
    message: `No redirect leaves "${from}".`,
    hint: 'Check the path — it may already have been removed, or never existed.',
    details: { from },
  })
}

function requiredQuery(request: RestRequest, key: string, example: string): string {
  const value = single(request.query, key)
  if (value === undefined || value.length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `The "${key}" query parameter is required.`,
      hint: `Send ${example}.`,
    })
  }
  return value
}

function parsePageParam(request: RestRequest, key: string): number | undefined {
  const raw = single(request.query, key)
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `The "${key}" query parameter must be a whole number of 0 or more.`,
      hint: `Send an integer, or omit "${key}".`,
    })
  }
  return parsed
}

// ---- CSV import ----------------------------------------------------------

interface ParsedImportRow {
  readonly line: number
  readonly from: string
  readonly to: string
  readonly status: RedirectStatus
}

interface ImportIssue {
  readonly line: number
  readonly detail: string
}

type RowOutcomeKind = 'create' | 'update' | 'unchanged' | 'duplicate' | 'loop'

interface ImportRowOutcome extends ParsedImportRow {
  readonly outcome: RowOutcomeKind
  readonly detail?: string
}

/**
 * Header row must name `from` and `to`; `status` and `reason` are optional
 * columns, matched case-insensitively so a real WordPress/Rank Math export
 * (whose own header casing varies) does not need hand-editing first.
 */
function parseImportCsv(
  csv: string,
  maxRows: number,
): { readonly rows: readonly ParsedImportRow[]; readonly issues: readonly ImportIssue[] } {
  const table = parseCsv(csv)
  if (table.length === 0) {
    return { rows: [], issues: [{ line: 0, detail: 'The file is empty.' }] }
  }

  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase())
  const fromIndex = header.indexOf('from')
  const toIndex = header.indexOf('to')
  const statusIndex = header.indexOf('status')

  if (fromIndex === -1 || toIndex === -1) {
    return {
      rows: [],
      issues: [{ line: 1, detail: 'The header row must include "from" and "to" columns.' }],
    }
  }

  const rows: ParsedImportRow[] = []
  const issues: ImportIssue[] = []
  const dataRows = table.slice(1, 1 + maxRows)

  for (const [offset, cells] of dataRows.entries()) {
    const line = offset + 2 // 1-based, plus the header row
    if (cells.length === 1 && (cells[0] ?? '').trim() === '') continue // a blank line

    const from = (cells[fromIndex] ?? '').trim()
    const to = (cells[toIndex] ?? '').trim()
    const rawStatus = statusIndex === -1 ? '' : (cells[statusIndex] ?? '').trim()
    const status = rawStatus === '' ? 301 : Number(rawStatus)

    if (from === '') {
      issues.push({ line, detail: 'Missing "from".' })
      continue
    }
    if (!isRedirectStatus(status)) {
      issues.push({
        line,
        detail: `"${rawStatus}" is not a valid status (301, 302, 307, 308, 410).`,
      })
      continue
    }
    if (status !== 410 && to === '') {
      issues.push({ line, detail: 'Missing "to" (required unless status is 410).' })
      continue
    }

    rows.push({
      line,
      from: normalisePath(from),
      to: status === 410 ? '' : normalisePath(to),
      status,
    })
  }

  if (table.length - 1 > maxRows) {
    issues.push({
      line: maxRows + 2,
      detail: `Only the first ${maxRows} data rows were read; the rest of the file was not.`,
    })
  }

  return { rows, issues }
}

/**
 * What each parsed row would do, computed against the table as it stands
 * *before* anything is written — this is the whole of "preview": nothing
 * below mutates the store.
 */
function classifyImportRows(
  rows: readonly ParsedImportRow[],
  existing: ReadonlyMap<string, RedirectRecord>,
): readonly ImportRowOutcome[] {
  const lastLineIndexByFrom = new Map<string, number>()
  rows.forEach((row, index) => {
    lastLineIndexByFrom.set(row.from, index)
  })

  return rows.map((row, index) => {
    if (row.status !== 410 && row.from === row.to) {
      return { ...row, outcome: 'loop', detail: 'A redirect cannot point at itself.' }
    }
    if (lastLineIndexByFrom.get(row.from) !== index) {
      return {
        ...row,
        outcome: 'duplicate',
        detail: 'A later row in this file redirects the same path; only that one will be applied.',
      }
    }

    const current = existing.get(row.from)
    if (current === undefined) return { ...row, outcome: 'create' }

    const effectiveTo = row.status === 410 ? row.from : row.to
    if (current.to === effectiveTo && current.status === row.status) {
      return { ...row, outcome: 'unchanged' }
    }
    return {
      ...row,
      outcome: 'update',
      detail: `Currently redirects to "${current.to}" (${current.status}).`,
    }
  })
}

export function createRedirectRouter(options: RedirectRouterOptions): RedirectRouter {
  const { store, patterns } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const patternsPath = `${basePath}/patterns`
  const exportPath = `${basePath}/export`
  const importPath = `${basePath}/import`
  const maxCsvRows = options.maxCsvRows ?? DEFAULT_MAX_CSV_ROWS

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const pathname = normalise(request.path.split('?')[0] ?? request.path)
    const method = request.method.toUpperCase()

    assertAdmin(context)

    if (pathname === basePath) return routeRedirects(request, method)
    if (patterns !== undefined && pathname === patternsPath) {
      return routePatterns(patterns, request, method)
    }
    if (pathname === exportPath) return routeExport(method)
    if (pathname === importPath) return routeImport(request, method)

    throw noRoute()
  }

  async function routeRedirects(request: RestRequest, method: string): Promise<RestResponse> {
    if (method === 'GET') {
      const collection = single(request.query, 'collection')
      const locale = single(request.query, 'locale')
      const query = single(request.query, 'q')?.trim().toLowerCase()
      const offset = parsePageParam(request, 'offset') ?? 0
      const limit = parsePageParam(request, 'limit')

      const all = await store.list({
        ...(collection === undefined ? {} : { collection }),
        ...(locale === undefined ? {} : { locale }),
      })
      const filtered =
        query === undefined || query.length === 0
          ? all
          : all.filter(
              (record) =>
                record.from.toLowerCase().includes(query) ||
                record.to.toLowerCase().includes(query),
            )
      const page =
        limit === undefined ? filtered.slice(offset) : filtered.slice(offset, offset + limit)

      return jsonResponse(200, { data: page.map(serialise), total: filtered.length })
    }

    if (method === 'POST') {
      const body = asRecord(request.body)
      const to = optionalPath(body, 'to')
      const status = optionalStatus(body)
      const reason = optionalReason(body)
      const record = await store.add({
        from: requiredField(body, 'from', '{ "from": "/old-page", "to": "/new-page" }'),
        ...(to === undefined ? {} : { to }),
        ...(status === undefined ? {} : { status }),
        ...(reason === undefined ? {} : { reason }),
      })
      return jsonResponse(201, { data: serialise(record) })
    }

    if (method === 'PATCH') {
      const from = requiredQuery(request, 'from', 'PATCH /api/redirects?from=/old-page')
      const body = asRecord(request.body)
      const to = optionalPath(body, 'to')
      const status = optionalStatus(body)
      if (to === undefined && status === undefined) {
        throw invalidBody('Nothing to change.', 'Send "to" and/or "status" in the body.')
      }
      const record = await store.update(from, {
        ...(to === undefined ? {} : { to }),
        ...(status === undefined ? {} : { status }),
      })
      return jsonResponse(200, { data: serialise(record) })
    }

    if (method === 'DELETE') {
      const from = requiredQuery(request, 'from', 'DELETE /api/redirects?from=/old-page')
      const removed = await store.remove(from)
      if (!removed) throw redirectNotFound(from)
      return jsonResponse(204, null)
    }

    return methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE'])
  }

  async function routePatterns(
    patternStore: RedirectPatternStore,
    request: RestRequest,
    method: string,
  ): Promise<RestResponse> {
    if (method === 'GET') {
      const records = await patternStore.list()
      return jsonResponse(200, { data: records.map(serialisePattern) })
    }

    if (method === 'POST') {
      const body = asRecord(request.body)
      const status = optionalPatternStatus(body)
      const input: AddRedirectPatternInput = {
        fromPrefix: requiredField(
          body,
          'fromPrefix',
          '{ "fromPrefix": "/blog/*", "toPrefix": "/actualites/*" }',
        ),
        toPrefix: requiredField(
          body,
          'toPrefix',
          '{ "fromPrefix": "/blog/*", "toPrefix": "/actualites/*" }',
        ),
        ...(status === undefined ? {} : { status }),
      }
      const record = await patternStore.add(input)
      return jsonResponse(201, { data: serialisePattern(record) })
    }

    if (method === 'DELETE') {
      const fromPrefix = requiredQuery(
        request,
        'fromPrefix',
        'DELETE /api/redirects/patterns?fromPrefix=/blog/*',
      )
      const removed = await patternStore.remove(fromPrefix)
      if (!removed) {
        throw new CogentaError({
          code: 'REDIRECT_UNKNOWN',
          message: `No prefix redirect leaves "${fromPrefix}".`,
          hint: 'Check the prefix — it may already have been removed, or never existed.',
          details: { fromPrefix },
        })
      }
      return jsonResponse(204, null)
    }

    return methodNotAllowed(['GET', 'POST', 'DELETE'])
  }

  async function routeExport(method: string): Promise<RestResponse> {
    if (method !== 'GET') return methodNotAllowed(['GET'])

    const records = await store.list({ limit: maxCsvRows })
    const rows: string[][] = [
      ['from', 'to', 'status', 'reason'],
      ...records.map((record) => [
        record.from,
        record.status === 410 ? '' : record.to,
        String(record.status),
        record.reason,
      ]),
    ]
    return jsonResponse(200, { data: { csv: stringifyCsv(rows), filename: 'redirects.csv' } })
  }

  async function routeImport(request: RestRequest, method: string): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])

    const body = asRecord(request.body)
    const csv = body['csv']
    if (typeof csv !== 'string' || csv.length === 0) {
      throw invalidBody(
        'This route needs a "csv" field with the file contents.',
        'Send { "csv": "from,to,status\\n/old,/new,301" }.',
      )
    }
    const apply = body['apply'] === true

    const { rows, issues } = parseImportCsv(csv, maxCsvRows)
    const existingList = await store.list({ limit: maxCsvRows })
    const existingByFrom = new Map(existingList.map((record) => [record.from, record]))
    const outcomes = classifyImportRows(rows, existingByFrom)

    if (!apply) {
      return jsonResponse(200, {
        data: {
          rows: outcomes,
          issues,
          summary: summarise(outcomes, issues),
        },
      })
    }

    const applicable = outcomes.filter(
      (row) => row.outcome === 'create' || row.outcome === 'update',
    )
    let created = 0
    let updated = 0
    const failed: { line: number; from: string; error: string }[] = []

    // Sequential, not `Promise.all`: each `add()` is its own transaction, and
    // running 300 of them concurrently against SQLite would only serialise
    // behind its writer lock anyway while making the failure report race.
    for (const row of applicable) {
      try {
        await store.add({
          from: row.from,
          ...(row.status === 410 ? {} : { to: row.to }),
          status: row.status,
          reason: 'import',
        })
        if (row.outcome === 'create') created += 1
        else updated += 1
      } catch (error) {
        failed.push({
          line: row.line,
          from: row.from,
          error: isCogentaError(error) ? error.message : String(error),
        })
      }
    }

    return jsonResponse(200, {
      data: { created, updated, failed, skipped: outcomes.length - applicable.length },
    })
  }
}

function summarise(
  outcomes: readonly ImportRowOutcome[],
  issues: readonly ImportIssue[],
): Record<string, number> {
  const summary: Record<string, number> = {
    create: 0,
    update: 0,
    unchanged: 0,
    duplicate: 0,
    loop: 0,
    invalid: issues.length,
  }
  for (const row of outcomes) summary[row.outcome] = (summary[row.outcome] ?? 0) + 1
  return summary
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
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The redirects routes are under GET/POST/PATCH/DELETE /api/redirects.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
