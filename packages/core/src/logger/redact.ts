/** What replaces a redacted value. Constant so tests and readers can match on it. */
export const REDACTED = '[redacted]'

/**
 * Field names whose value is a credential, normalised to lowercase letters and
 * digits so `API_KEY`, `x-api-key` and `apiKey` all collapse to `apikey`.
 */
const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'pass',
  'secret',
  'token',
  'apikey',
  'apisecret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearer',
  'authorization',
  'auth',
  'cookie',
  'setcookie',
  'session',
  'sessionid',
  'credential',
  'credentials',
  'privatekey',
  'clientsecret',
  'accesskey',
  'accesskeyid',
  'secretaccesskey',
  'signature',
  'dsn',
])

/**
 * Suffixes that make a compound name a secret: `llmApiKey`, `s3SecretAccessKey`.
 * Deliberately not `key` on its own — `cacheKey` and `keyCount` are not secrets,
 * and over-redacting makes logs useless, which is its own kind of failure.
 */
const SECRET_SUFFIXES = ['password', 'passwd', 'secret', 'apikey', 'accesstoken', 'refreshtoken']

/** Values that are credentials whatever the field is called. */
const SECRET_VALUES: readonly RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/,
  /\bsk-(proj-)?[a-zA-Z0-9]{32,}/,
  /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
]

/** Matches `<scheme>://<user>:<password>@<host>`, capturing the password alone. */
const URL_CREDENTIALS = /^([a-z][a-z0-9+.-]*:\/\/[^:@\s/]+:)([^@\s/]+)(@)/i

const MAX_DEPTH = 8

function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (SECRET_KEYS.has(normalised)) return true
  return SECRET_SUFFIXES.some((suffix) => normalised.endsWith(suffix))
}

function redactString(value: string): string {
  if (SECRET_VALUES.some((pattern) => pattern.test(value))) return REDACTED
  return value.replace(URL_CREDENTIALS, `$1${REDACTED}$3`)
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value

  if (depth >= MAX_DEPTH) return '[depth limit]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen))
  if (value instanceof Date) return value.toISOString()

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    output[key] = isSecretKey(key) ? REDACTED : redactValue(entry, depth + 1, seen)
  }
  return output
}

/**
 * Returns a copy of `fields` with credentials removed — by field name, by value
 * shape, and inside connection strings.
 *
 * This is belt and braces on top of rule R7: secrets are not supposed to reach a
 * log call in the first place. Defence in depth is warranted because a leaked
 * key in a log file is discovered late, by someone else, and costs a rotation.
 */
export function redact<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  return redactValue(fields, 0, new WeakSet()) as Record<string, unknown>
}
