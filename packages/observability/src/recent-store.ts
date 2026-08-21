import { randomUUID } from 'node:crypto'
import { type EmittedLogLevel, redact } from '@cogenta/core'

/**
 * The local, bounded "recent events" buffer the admin's Exploitation screen
 * reads (fiche L22 task 5, point 3). Same shape as `@cogenta/core`'s
 * `createErrorLog` (fiche 24 task 4) on purpose — a ring buffer, not a
 * table: durability across a restart is not the point, answering "what has
 * this process seen lately" from the admin is, and bounding it is what
 * keeps that answer cheap without a separate sweep.
 *
 * This is deliberately **not** a substitute for a real APM: it holds what
 * this one process has seen since it started, nothing more. The admin
 * screen says so; this module does not pretend otherwise.
 *
 * Every field passes through `redact()` before it is stored — the same
 * discipline `createErrorLog` already applies, and belt-and-braces on top
 * of the fact that neither a trace attribute nor a log field this module
 * ever receives is a request body or a header (see `request-tracing.ts`'s
 * own comment): rule R7, applied twice.
 */

export interface RecentTraceEntry {
  readonly id: string
  readonly at: string
  readonly traceId: string
  readonly spanId: string
  /** `"<method> <path>"`, the span's own name. */
  readonly name: string
  readonly method: string | undefined
  /** Path only — no query string, which can itself carry a token (fiche 21's own audit-log discipline). */
  readonly path: string | undefined
  readonly statusCode: number | undefined
  readonly durationMs: number
  readonly ok: boolean
}

export interface RecordTraceInput {
  readonly traceId: string
  readonly spanId: string
  readonly name: string
  readonly method?: string
  readonly path?: string
  readonly statusCode?: number
  readonly durationMs: number
  readonly ok: boolean
}

export interface RecentLogEntry {
  readonly id: string
  readonly at: string
  readonly level: EmittedLogLevel
  readonly msg: string
  readonly fields: Readonly<Record<string, unknown>> | undefined
}

export interface RecordLogInput {
  readonly level: EmittedLogLevel
  readonly msg: string
  readonly fields?: Readonly<Record<string, unknown>>
}

export interface ObservabilityRecentStore {
  recordTrace(input: RecordTraceInput): RecentTraceEntry
  recordLog(input: RecordLogInput): RecentLogEntry
  /** Newest first. */
  recentTraces(): readonly RecentTraceEntry[]
  /** Newest first. */
  recentLogs(): readonly RecentLogEntry[]
  clear(): void
}

export interface ObservabilityRecentStoreOptions {
  /** How many trace entries survive at once. The (N+1)th record evicts the oldest. */
  readonly traceCapacity?: number
  /** How many log entries survive at once. The (N+1)th record evicts the oldest. */
  readonly logCapacity?: number
  readonly now?: () => Date
  readonly newId?: () => string
}

const DEFAULT_TRACE_CAPACITY = 500
const DEFAULT_LOG_CAPACITY = 500

export function createObservabilityRecentStore(
  options: ObservabilityRecentStoreOptions = {},
): ObservabilityRecentStore {
  const traceCapacity = options.traceCapacity ?? DEFAULT_TRACE_CAPACITY
  const logCapacity = options.logCapacity ?? DEFAULT_LOG_CAPACITY
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? randomUUID

  let traces: RecentTraceEntry[] = []
  let logs: RecentLogEntry[] = []

  function recordTrace(input: RecordTraceInput): RecentTraceEntry {
    const safe = redact({
      name: input.name,
      method: input.method ?? null,
      path: input.path ?? null,
    })
    const entry: RecentTraceEntry = {
      id: newId(),
      at: now().toISOString(),
      traceId: input.traceId,
      spanId: input.spanId,
      name: String(safe['name']),
      method: typeof safe['method'] === 'string' ? safe['method'] : undefined,
      path: typeof safe['path'] === 'string' ? safe['path'] : undefined,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      ok: input.ok,
    }
    traces.unshift(entry)
    if (traces.length > traceCapacity) traces = traces.slice(0, traceCapacity)
    return entry
  }

  function recordLog(input: RecordLogInput): RecentLogEntry {
    const safe = redact({ msg: input.msg, fields: input.fields ?? null })
    const safeFields = safe['fields']
    const entry: RecentLogEntry = {
      id: newId(),
      at: now().toISOString(),
      level: input.level,
      msg: String(safe['msg']),
      fields:
        safeFields !== null && typeof safeFields === 'object'
          ? (safeFields as Readonly<Record<string, unknown>>)
          : undefined,
    }
    logs.unshift(entry)
    if (logs.length > logCapacity) logs = logs.slice(0, logCapacity)
    return entry
  }

  return {
    recordTrace,
    recordLog,
    recentTraces: () => traces,
    recentLogs: () => logs,
    clear: () => {
      traces = []
      logs = []
    },
  }
}
