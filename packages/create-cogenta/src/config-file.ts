import { readFile } from 'node:fs/promises'
import type { LlmProviderId } from './llm-setup.js'
import { defaultAnswers, type WizardAnswers } from './types.js'

export class ConfigFileError extends Error {}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigFileError(`"${field}" must be a non-empty string.`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requireString(value, field)
}

const LLM_PROVIDER_IDS: readonly LlmProviderId[] = ['none', 'anthropic', 'openai', 'google']

function llmProvider(value: unknown): LlmProviderId {
  if (value === undefined) return 'none'
  if (typeof value === 'string' && (LLM_PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as LlmProviderId
  }
  throw new ConfigFileError(
    `"llm.provider" must be one of ${LLM_PROVIDER_IDS.join(', ')}, not "${String(value)}".`,
  )
}

function databaseDriver(value: unknown): 'sqlite' | 'postgres' | 'mysql' {
  if (value === undefined) return 'sqlite'
  if (value === 'sqlite' || value === 'postgres' || value === 'mysql') return value
  throw new ConfigFileError(
    `"database.driver" must be one of sqlite, postgres, mysql, not "${String(value)}".`,
  )
}

/**
 * "`--config fichier` pour une installation non interactive." A plain JSON
 * file, hand-validated (this package intentionally carries no schema
 * dependency — a handful of required strings does not need one). Every
 * field left out falls back to the same default the interactive wizard's
 * own Enter key would have produced, so `--yes` and a minimal `--config`
 * file describe the same site.
 */
export async function loadConfigFile(path: string, targetDir: string): Promise<WizardAnswers> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    throw new ConfigFileError(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new ConfigFileError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ConfigFileError(`${path} must contain a JSON object.`)
  }
  const root = parsed as Record<string, unknown>
  const site = (root.site ?? {}) as Record<string, unknown>
  const database = (root.database ?? {}) as Record<string, unknown>
  const llm = (root.llm ?? {}) as Record<string, unknown>

  const base = defaultAnswers(targetDir, requireString(site.name, 'site.name'))

  return {
    ...base,
    siteUrl: requireString(site.url, 'site.url'),
    ...(optionalString(site.defaultLocale, 'site.defaultLocale') === undefined
      ? {}
      : { defaultLocale: optionalString(site.defaultLocale, 'site.defaultLocale') as string }),
    ...(optionalString(root.blueprint, 'blueprint') === undefined
      ? {}
      : { blueprintId: optionalString(root.blueprint, 'blueprint') as string }),
    databaseDriver: databaseDriver(database.driver),
    ...(optionalString(database.url, 'database.url') === undefined
      ? {}
      : { databaseUrl: optionalString(database.url, 'database.url') as string }),
    llmProvider: llmProvider(llm.provider),
    ...(optionalString(llm.model, 'llm.model') === undefined
      ? {}
      : { llmModel: optionalString(llm.model, 'llm.model') as string }),
    ...(optionalString(llm.apiKey, 'llm.apiKey') === undefined
      ? {}
      : { llmApiKey: optionalString(llm.apiKey, 'llm.apiKey') as string }),
    ...(optionalString(llm.siteDescription, 'llm.siteDescription') === undefined
      ? {}
      : {
          siteDescription: optionalString(llm.siteDescription, 'llm.siteDescription') as string,
        }),
    ...(optionalString(root.adminEmail, 'adminEmail') === undefined
      ? {}
      : { adminEmail: optionalString(root.adminEmail, 'adminEmail') as string }),
  }
}
