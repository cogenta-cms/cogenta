/**
 * Every error Cogenta throws carries one of these codes. They are a public API:
 * callers branch on them, logs are aggregated by them, and translations key off
 * them. Adding a code is a minor version; changing the meaning of one is major.
 */
export const ERROR_CODES = [
  // Configuration
  'CONFIG_INVALID',
  'CONFIG_NOT_FOUND',
  'CONFIG_LOAD_FAILED',
  'CONFIG_SECRET_IN_FILE',

  // Drivers
  'DRIVER_UNKNOWN',
  'DRIVER_DUPLICATE',
  'DRIVER_UNAVAILABLE',
  'DRIVER_INIT_FAILED',

  // Data
  'DB_UNREACHABLE',
  'DB_DIALECT_UNSUPPORTED',
  'MIGRATION_FAILED',
  'MIGRATION_IRREVERSIBLE',

  // Infrastructure
  'CACHE_FAILED',
  'QUEUE_FAILED',
  'STORAGE_FAILED',

  // Catch-all, deliberately last and deliberately rare.
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
