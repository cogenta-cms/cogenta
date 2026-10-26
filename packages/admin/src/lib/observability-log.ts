import type { TFunction } from 'i18next'

export interface DescribedLog {
  /** The line, in the admin's language when the server message is one we know. */
  readonly text: string
  /** The structured fields, as `key: value` pairs, for a details view. */
  readonly details: readonly (readonly [string, string])[]
}

const TIERS = new Set(['optimal', 'degraded'])

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** "redis not available" → "Redis n'est pas disponible"; the three reasons a driver is picked. */
function describeReason(reason: string, t: TFunction): string {
  const missing = /^(.+) not available$/u.exec(reason)
  if (missing?.[1] !== undefined)
    return t('observability.log.reasonUnavailable', { name: missing[1] })
  if (reason === 'named in the configuration') return t('observability.log.reasonConfigured')
  if (reason === 'first available driver') return t('observability.log.reasonFirst')
  return reason
}

/**
 * A server log line as a sentence. The server writes English messages with
 * structured fields; the ones the process itself emits at startup are read
 * back into the admin's language, anything else is shown as written — it is a
 * raw diagnostic line, not a screen of the admin.
 */
export function describeLog(
  log: { readonly msg: string; readonly fields: Readonly<Record<string, unknown>> | undefined },
  t: TFunction,
): DescribedLog {
  const fields = log.fields ?? {}
  const details = Object.entries(fields).map(([key, value]) => [key, stringify(value)] as const)
  if (log.msg === 'driver selected' && typeof fields['driver'] === 'string') {
    const tier =
      typeof fields['tier'] === 'string' && TIERS.has(fields['tier']) ? fields['tier'] : null
    const reason = typeof fields['reason'] === 'string' ? describeReason(fields['reason'], t) : ''
    return {
      text: t('observability.log.driverSelected', {
        driver: fields['driver'],
        tier: tier === null ? '' : t(`observability.log.tier.${tier}`),
        reason,
      }),
      details,
    }
  }
  return { text: log.msg, details }
}
