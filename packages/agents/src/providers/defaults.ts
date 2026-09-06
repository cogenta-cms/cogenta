import { CogentaError } from '@cogenta/core'
import { SITE_SETTINGS_SITE_SCOPE, type SiteSettingsStore, siteSettingByKey } from '@cogenta/schema'

/**
 * The site-wide floor every resolved provider client's
 * `maxOutputTokens`/`requestTimeoutMs`/`maxCorrectionAttempts` falls back to
 * when an admin has not set a per-provider override — always a concrete
 * number, resolved once from `assistant.defaultMaxOutputTokens`/
 * `assistant.defaultRequestTimeoutSeconds`/
 * `assistant.defaultMaxCorrectionAttempts` (`SITE_SETTINGS_REGISTRY` in
 * `@cogenta/schema`) by whoever builds the provider registry (`cogenta
 * serve`'s wiring — see `resolveProviderTuningDefaults` below), never a
 * TypeScript constant baked into this package.
 *
 * Fiche feedback: `FALLBACK_MAX_OUTPUT_TOKENS = 8000` and
 * `FALLBACK_MAX_CORRECTION_ATTEMPTS = 3` used to live here as plain
 * exported numbers — invisible and unreachable from the admin, only ever
 * mentioned as static hint text on `/admin/providers`. This file now only
 * declares the *shape* those three numbers travel in between the settings
 * store and `createProviderRegistry` — it holds no value of its own.
 */
export interface ProviderTuningDefaults {
  readonly maxOutputTokens: number
  readonly requestTimeoutMs: number
  readonly maxCorrectionAttempts: number
}

const MAX_OUTPUT_TOKENS_KEY = 'assistant.defaultMaxOutputTokens'
const REQUEST_TIMEOUT_SECONDS_KEY = 'assistant.defaultRequestTimeoutSeconds'
const MAX_CORRECTION_ATTEMPTS_KEY = 'assistant.defaultMaxCorrectionAttempts'

/**
 * The registry's own declared default for a numeric setting
 * (`SITE_SETTINGS_REGISTRY`'s own `defaultValue`) — the single place either
 * reader below gets a fallback number from, never a second copy kept in this
 * package. Throwing here is not reachable in practice (the three keys this
 * file reads are declared with a numeric `defaultValue` in
 * `site-settings-registry.ts`); it exists because neither caller has any way
 * to prove that from its own call site, and a silent fallback to some other
 * literal here would be exactly the hardcoding this file exists to avoid.
 */
function registryDefaultValue(key: string): number {
  const definition = siteSettingByKey(key)
  if (definition !== undefined && typeof definition.defaultValue === 'number') {
    return definition.defaultValue
  }
  throw new CogentaError({
    code: 'SITE_SETTING_INVALID',
    message: `Site setting "${key}" has no numeric default registered.`,
    hint: 'This is a registry bug — check the entry in SITE_SETTINGS_REGISTRY.',
  })
}

/**
 * A row exists only once an admin has actually written this key
 * (`SiteSettingsStore`'s own contract) — absent means "use the registry's
 * own `defaultValue`" (`registryDefaultValue` above).
 */
async function resolveNumberSetting(store: SiteSettingsStore, key: string): Promise<number> {
  const row = await store.get(key, SITE_SETTINGS_SITE_SCOPE)
  return row !== null && typeof row.value === 'number' ? row.value : registryDefaultValue(key)
}

/**
 * Reads the three `assistant.*` site settings and turns them into the shape
 * every resolved provider client needs — the CLI wiring layer's own
 * responsibility (`cogenta serve`, `packages/cli/src/commands/agent-runtime
 * .ts`), exposed here so it never has to re-derive the key names or the
 * seconds-to-milliseconds conversion itself.
 */
export async function resolveProviderTuningDefaults(
  store: SiteSettingsStore,
): Promise<ProviderTuningDefaults> {
  const [maxOutputTokens, requestTimeoutSeconds, maxCorrectionAttempts] = await Promise.all([
    resolveNumberSetting(store, MAX_OUTPUT_TOKENS_KEY),
    resolveNumberSetting(store, REQUEST_TIMEOUT_SECONDS_KEY),
    resolveNumberSetting(store, MAX_CORRECTION_ATTEMPTS_KEY),
  ])
  return {
    maxOutputTokens,
    requestTimeoutMs: requestTimeoutSeconds * 1000,
    maxCorrectionAttempts,
  }
}

/**
 * The registry's own defaults with no live per-site override consulted at
 * all — for the one caller with no `SiteSettingsStore` to read from in the
 * first place: `cogenta skin generate`, a one-shot CLI command that works
 * straight off `cogenta.config.mjs` and already bypasses every other
 * admin-configured override (`ProviderConfigStore`'s own per-provider
 * tuning included) rather than a running site's database. Still the single
 * declared number (`SITE_SETTINGS_REGISTRY`'s own `defaultValue`), never a
 * second constant duplicated for this one caller.
 */
export function staticProviderTuningDefaults(): ProviderTuningDefaults {
  return {
    maxOutputTokens: registryDefaultValue(MAX_OUTPUT_TOKENS_KEY),
    requestTimeoutMs: registryDefaultValue(REQUEST_TIMEOUT_SECONDS_KEY) * 1000,
    maxCorrectionAttempts: registryDefaultValue(MAX_CORRECTION_ATTEMPTS_KEY),
  }
}
