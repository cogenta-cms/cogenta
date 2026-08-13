/** Ordered from most to least verbose. `silent` emits nothing at all. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

/** Emitted levels only — `silent` is a threshold, never a record's level. */
export type EmittedLogLevel = Exclude<LogLevel, 'silent'>

export type LogFields = Record<string, unknown>

/** One emitted line, as NDJSON. Structured; never a formatted sentence. */
export interface LogRecord extends LogFields {
  readonly time: string
  readonly level: EmittedLogLevel
  readonly msg: string
}

/** Where a line goes. Injected, so tests capture instead of writing to stdout. */
export type LogDestination = (line: string) => void

export interface Logger {
  readonly level: LogLevel
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** A logger that repeats `bindings` on every record. Never mutates its parent. */
  child(bindings: LogFields): Logger
  isLevelEnabled(level: LogLevel): boolean
}

export interface LoggerOptions {
  readonly level?: LogLevel
  readonly destination?: LogDestination
  /** Injected so tests get stable timestamps. */
  readonly clock?: () => Date
  readonly bindings?: LogFields
}
