import { CogentaError } from '@cogenta/core'

/**
 * "Vérification exhaustive de ce qui sort d'un site" — the security test
 * `docs/lots/L8-flotte.md` names explicitly. `TelemetryPayload`'s type
 * already makes the forbidden fields unrepresentable for any caller that
 * goes through TypeScript's own checking — this function is the
 * defense-in-depth half: a real, runtime inspection of the object about to
 * be signed and sent, catching a forbidden key smuggled in past a loosely
 * typed call site (an unchecked cast, an object spread, a JSON round-trip
 * from an untyped source) that the type system alone would not stop.
 */
const FORBIDDEN_KEYS = [
  'content',
  'media',
  'visitorpii',
  'visitordata',
  'apikey',
  'apikeys',
  'secret',
  'secrets',
  'agentmemory',
  'memory',
  'rawlogs',
  'logs',
  'log',
] as const

/** Recurses into plain objects and arrays only — a class instance or a function is not what a JSON-serializable telemetry payload should ever contain in the first place. */
function walk(value: unknown, path: string, hits: string[]): void {
  if (value === null || typeof value !== 'object') return

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walk(entry, `${path}[${index}]`, hits)
    })
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    const keyPath = path === '' ? key : `${path}.${key}`
    if (FORBIDDEN_KEYS.includes(key.toLowerCase() as (typeof FORBIDDEN_KEYS)[number])) {
      hits.push(keyPath)
    }
    walk(entry, keyPath, hits)
  }
}

/**
 * Throws if `payload` — already serialized to a plain object, exactly as it
 * would be before signing and sending — contains any key from the forbidden
 * list at any depth. Never silently drops the offending field: a payload
 * that could only be made "safe" by quietly deleting data is not a payload
 * this function considers safe to send at all.
 */
export function assertNoForbiddenFields(payload: unknown): void {
  const hits: string[] = []
  walk(payload, '', hits)
  if (hits.length > 0) {
    throw new CogentaError({
      code: 'FLEET_TELEMETRY_FORBIDDEN_FIELD',
      message: `Telemetry payload contains forbidden field(s): ${hits.join(', ')}.`,
      hint: 'Only the fields named in "## Ce qui remonte" (docs/lots/L8-flotte.md) may leave a site. Remove the offending field before sending.',
      details: { fields: hits },
    })
  }
}
