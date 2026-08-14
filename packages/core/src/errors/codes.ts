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
  'MIGRATION_LOCKED',
  'MIGRATION_CHECKSUM_MISMATCH',
  'MIGRATION_DESTRUCTIVE',

  // Content schema
  'SCHEMA_INVALID',

  // Content
  'CONTENT_NOT_FOUND',
  'CONTENT_INVALID',
  'CONTENT_CONFLICT',
  'CONTENT_SLUG_INVALID',
  'CONTENT_SLUG_TAKEN',
  'CONTENT_ROUTE_INVALID',
  'CONTENT_REDIRECT_LOOP',
  'CONTENT_SCHEDULE_INVALID',

  // Blocks
  'BLOCK_UNKNOWN',
  'BLOCK_INVALID',
  'BLOCK_DEFINITION_INVALID',
  'BLOCK_MIGRATION_FAILED',

  // Rendering — skins. A skin is refused, never repaired: contract D freezes the
  // token set precisely so that a generated skin either passes or is rejected.
  'SKIN_TOKEN_MISSING',
  'SKIN_TOKEN_UNKNOWN',
  'SKIN_TOKEN_INVALID',
  'SKIN_CONTRAST_INSUFFICIENT',
  'SKIN_SCALE_NOT_MONOTONIC',
  'SKIN_MOTION_NOT_REDUCED',

  // Themes
  'THEME_NOT_FOUND',
  'THEME_INVALID',
  'THEME_BLOCK_MISSING',
  'THEME_IMPORT_FORBIDDEN',

  // Rendering — the content API a theme reads through (ADR-0016)
  'CONTENT_API_FAILED',

  // Rendering — build targets. A target that cannot honour a declared runtime
  // need refuses the build; it never degrades silently (ADR-0004).
  'BUILD_TARGET_UNKNOWN',
  'BUILD_RUNTIME_UNSATISFIED',

  // Access
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'PREVIEW_TOKEN_INVALID',
  'PREVIEW_TOKEN_EXPIRED',
  'QUERY_INVALID',

  // Auth
  'AUTH_PASSWORD_INVALID',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOTP_INVALID',
  'AUTH_TOTP_REQUIRED',
  'AUTH_WEBAUTHN_FAILED',
  'AUTH_SESSION_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_RATE_LIMITED',
  'AUTH_MFA_REQUIRED',
  'AUTH_USER_EXISTS',
  'AUTH_USER_NOT_FOUND',
  'AUTH_ROLE_UNKNOWN',
  'AUDIT_CHAIN_BROKEN',

  // Media
  'MEDIA_NOT_FOUND',
  'MEDIA_INVALID',
  'MEDIA_TYPE_REJECTED',

  // Infrastructure
  'CACHE_FAILED',
  'QUEUE_FAILED',
  'STORAGE_FAILED',

  // Agents — LLM provider adapters (L4)
  'PROVIDER_UNKNOWN',
  'PROVIDER_REQUEST_FAILED',
  'PROVIDER_RESPONSE_INVALID',
  'PROVIDER_RATE_LIMITED',

  // Catch-all, deliberately last and deliberately rare.
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
