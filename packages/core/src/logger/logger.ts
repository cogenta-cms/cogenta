import process from 'node:process'
import { isCogentaError } from '../errors/index.js'
import { redact } from './redact.js'
import type {
  EmittedLogLevel,
  LogDestination,
  LogFields,
  Logger,
  LoggerOptions,
  LogLevel,
} from './types.js'

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
}

/** Reserved by the record structure: a field may never overwrite one of these. */
const RESERVED = new Set(['time', 'level', 'msg'])

const writeToStdout: LogDestination = (line) => {
  process.stdout.write(line)
}

/**
 * `Error` has non-enumerable properties, so `JSON.stringify` renders it as `{}`.
 * Losing the one field that explains a failure is the classic structured-logging
 * bug; unpack it explicitly instead.
 */
function serialiseError(value: Error): LogFields {
  if (isCogentaError(value)) return { ...value.toJSON() }

  const serialised: LogFields = { name: value.name, message: value.message }
  if (value.cause !== undefined) {
    serialised['cause'] = value.cause instanceof Error ? serialiseError(value.cause) : value.cause
  }
  return serialised
}

function expandErrors(fields: LogFields): LogFields {
  const output: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    output[key] = value instanceof Error ? serialiseError(value) : value
  }
  return output
}

/**
 * Last line of defence. A logger that throws takes the caller down with it, and
 * an unserialisable field is never worth an outage — drop the field, keep the
 * record, say so.
 */
function stringify(record: LogFields): string {
  try {
    return JSON.stringify(record, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    )
  } catch {
    return JSON.stringify({
      time: record['time'],
      level: record['level'],
      msg: record['msg'],
      logError: 'fields could not be serialised and were dropped',
    })
  }
}

/**
 * Structured NDJSON logger. One JSON object per line, never free text: logs are
 * read by machines first and humans second.
 *
 * Every record passes through redaction, so a secret that slipped into a field
 * does not reach the output (rule R7).
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const destination = options.destination ?? writeToStdout
  const clock = options.clock ?? ((): Date => new Date())
  const bindings = redact(options.bindings ?? {})
  const threshold = SEVERITY[level]

  function emit(recordLevel: EmittedLogLevel, message: string, fields?: LogFields): void {
    if (SEVERITY[recordLevel] < threshold) return

    const safe = fields === undefined ? {} : redact(expandErrors(fields))
    const record: LogFields = { ...bindings }
    for (const [key, value] of Object.entries(safe)) {
      if (!RESERVED.has(key)) record[key] = value
    }

    record['time'] = clock().toISOString()
    record['level'] = recordLevel
    record['msg'] = message

    destination(`${stringify(record)}\n`)
  }

  return {
    level,
    debug: (message, fields) => {
      emit('debug', message, fields)
    },
    info: (message, fields) => {
      emit('info', message, fields)
    },
    warn: (message, fields) => {
      emit('warn', message, fields)
    },
    error: (message, fields) => {
      emit('error', message, fields)
    },
    child: (childBindings) =>
      createLogger({
        ...options,
        level,
        destination,
        clock,
        bindings: { ...bindings, ...redact(childBindings) },
      }),
    isLevelEnabled: (candidate) =>
      candidate !== 'silent' &&
      SEVERITY[candidate] >= threshold &&
      threshold !== Number.POSITIVE_INFINITY,
  }
}
