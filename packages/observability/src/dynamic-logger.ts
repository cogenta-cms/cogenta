import type { EmittedLogLevel, LogFields, Logger, LogLevel } from '@cogenta/core'
import type { ObservabilityRecentStore } from './recent-store.js'

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
}

/**
 * Wraps an already-built `Logger` so every record it emits also lands in
 * the local recent-log buffer the admin's Exploitation screen reads —
 * gated by `getLevel()`, not by the wrapped logger's own (fixed at
 * construction) threshold.
 *
 * This is what makes `observability.logLevel` (the site setting fiche L22
 * task 5 point 2 asks for) take effect **without a restart**: the wrapped
 * logger's own `level` cannot change after `createLogger()` built it, so a
 * second, dynamic gate sits in front of it here. `getLevel` is a callback
 * rather than a fixed value so the caller (`cogenta serve`) can back it
 * with a value refreshed periodically from `SiteSettingsStore` — see that
 * wiring's own comment for the honestly-bounded propagation delay this
 * implies.
 *
 * Every underlying `logger.debug/info/warn/error` call still happens
 * exactly as before — this wrapper only *adds* the recent-buffer capture,
 * it never suppresses real output the base logger would have produced.
 */
export function withRecentLogCapture(
  base: Logger,
  store: ObservabilityRecentStore,
  getLevel: () => LogLevel,
): Logger {
  function capture(level: EmittedLogLevel, message: string, fields?: LogFields): void {
    if (SEVERITY[level] < SEVERITY[getLevel()]) return
    store.recordLog({ level, msg: message, ...(fields === undefined ? {} : { fields }) })
  }

  return {
    get level() {
      return base.level
    },
    debug: (message, fields) => {
      capture('debug', message, fields)
      base.debug(message, fields)
    },
    info: (message, fields) => {
      capture('info', message, fields)
      base.info(message, fields)
    },
    warn: (message, fields) => {
      capture('warn', message, fields)
      base.warn(message, fields)
    },
    error: (message, fields) => {
      capture('error', message, fields)
      base.error(message, fields)
    },
    child: (bindings) => withRecentLogCapture(base.child(bindings), store, getLevel),
    isLevelEnabled: (candidate) => base.isLevelEnabled(candidate),
  }
}
