import type { Environment } from './types.js'

/**
 * Keys that must never appear in `cogenta.config.ts`, mapped to the environment
 * variable that supplies them instead. The config file is committed to git; a
 * secret in it is a secret in every clone, forever (rule R7).
 */
export const SECRET_KEYS: ReadonlyMap<string, string> = new Map([
  ['llm.apiKey', 'COGENTA_LLM_API_KEY'],
  ['imageGeneration.apiKey', 'COGENTA_IMAGE_API_KEY'],
  ['storage.accessKeyId', 'COGENTA_STORAGE_ACCESS_KEY_ID'],
  ['storage.secretAccessKey', 'COGENTA_STORAGE_SECRET_ACCESS_KEY'],
  ['webhooks.secret', 'COGENTA_WEBHOOK_SECRET'],
])

/** First variable that is set and not empty. An empty variable means "unset". */
function read(env: Environment, ...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads a section for merging. A section that exists but is not an object is
 * returned untouched, so the schema can report "expected object" rather than a
 * misleading list of missing fields.
 */
function section(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const current = input[key]
  if (current === undefined) return {}
  return isPlainObject(current) ? { ...current } : undefined
}

function assign(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) target[key] = value
}

/**
 * Overlays environment variables on top of the config file. Precedence is
 * defaults → file → environment, so an operator can retarget a deployment
 * without editing committed code.
 *
 * Secrets are deliberately *not* merged here: they are injected after
 * validation, so they never pass through the schema or an error message.
 */
export function applyEnv(
  input: Record<string, unknown>,
  env: Environment,
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...input }

  const site = section(output, 'site')
  if (site !== undefined) {
    assign(site, 'name', read(env, 'COGENTA_SITE_NAME'))
    assign(site, 'url', read(env, 'COGENTA_SITE_URL'))
    assign(site, 'defaultLocale', read(env, 'COGENTA_SITE_DEFAULT_LOCALE'))
    assign(site, 'notFoundPath', read(env, 'COGENTA_SITE_NOT_FOUND_PATH'))

    const locales = read(env, 'COGENTA_SITE_LOCALES')
    if (locales !== undefined) {
      site['locales'] = locales
        .split(',')
        .map((locale) => locale.trim())
        .filter((locale) => locale !== '')
    }
    output['site'] = site
  }

  const database = section(output, 'database')
  if (database !== undefined) {
    assign(database, 'driver', read(env, 'COGENTA_DATABASE_DRIVER'))
    assign(database, 'url', read(env, 'COGENTA_DATABASE_URL', 'DATABASE_URL'))
    const poolSize = read(env, 'COGENTA_DATABASE_POOL_SIZE')
    if (poolSize !== undefined) database['poolSize'] = Number(poolSize)
    output['database'] = database
  }

  const cache = section(output, 'cache')
  if (cache !== undefined) {
    assign(cache, 'driver', read(env, 'COGENTA_CACHE_DRIVER'))
    assign(cache, 'url', read(env, 'COGENTA_CACHE_URL', 'REDIS_URL'))
    assign(cache, 'path', read(env, 'COGENTA_CACHE_PATH'))
    output['cache'] = cache
  }

  const queue = section(output, 'queue')
  if (queue !== undefined) {
    assign(queue, 'driver', read(env, 'COGENTA_QUEUE_DRIVER'))
    assign(queue, 'url', read(env, 'COGENTA_QUEUE_URL', 'REDIS_URL'))
    output['queue'] = queue
  }

  const storage = section(output, 'storage')
  if (storage !== undefined) {
    assign(storage, 'driver', read(env, 'COGENTA_STORAGE_DRIVER'))
    assign(storage, 'bucket', read(env, 'COGENTA_STORAGE_BUCKET'))
    assign(storage, 'region', read(env, 'COGENTA_STORAGE_REGION'))
    assign(storage, 'endpoint', read(env, 'COGENTA_STORAGE_ENDPOINT'))
    assign(storage, 'path', read(env, 'COGENTA_STORAGE_PATH'))
    assign(storage, 'baseUrl', read(env, 'COGENTA_STORAGE_BASE_URL'))
    output['storage'] = storage
  }

  const webhooks = section(output, 'webhooks')
  if (webhooks !== undefined) {
    const endpoints = read(env, 'COGENTA_WEBHOOK_ENDPOINTS')
    if (endpoints !== undefined) {
      webhooks['endpoints'] = endpoints
        .split(',')
        .map((endpoint) => endpoint.trim())
        .filter((endpoint) => endpoint !== '')
    }
    output['webhooks'] = webhooks
  }

  // The LLM section only comes into existence if someone asked for one: with no
  // provider configured, everything works except the agents (rule R2).
  const llmProvider = read(env, 'COGENTA_LLM_PROVIDER')
  const llm = section(output, 'llm')
  if (llm !== undefined && (output['llm'] !== undefined || llmProvider !== undefined)) {
    assign(llm, 'provider', llmProvider)
    assign(llm, 'model', read(env, 'COGENTA_LLM_MODEL'))
    assign(llm, 'baseUrl', read(env, 'COGENTA_LLM_BASE_URL'))
    output['llm'] = llm
  }

  const embeddings = section(output, 'embeddings')
  if (embeddings !== undefined) {
    assign(embeddings, 'provider', read(env, 'COGENTA_EMBEDDINGS_PROVIDER'))
    assign(embeddings, 'model', read(env, 'COGENTA_EMBEDDINGS_MODEL'))

    const dimensions = read(env, 'COGENTA_EMBEDDINGS_DIMENSIONS')
    if (dimensions !== undefined) embeddings['dimensions'] = Number(dimensions)
    output['embeddings'] = embeddings
  }

  // Same shape as `llm`, and the same rule: the section only comes into
  // existence if someone asked for one. A site with no image vendor has no
  // image generation at all, and that is not an error (R2).
  const imageProvider = read(env, 'COGENTA_IMAGE_PROVIDER')
  const imageGeneration = section(output, 'imageGeneration')
  if (
    imageGeneration !== undefined &&
    (output['imageGeneration'] !== undefined || imageProvider !== undefined)
  ) {
    assign(imageGeneration, 'provider', imageProvider)
    assign(imageGeneration, 'model', read(env, 'COGENTA_IMAGE_MODEL'))
    assign(imageGeneration, 'baseUrl', read(env, 'COGENTA_IMAGE_BASE_URL'))
    output['imageGeneration'] = imageGeneration
  }

  const vector = section(output, 'vector')
  if (vector !== undefined) {
    assign(vector, 'driver', read(env, 'COGENTA_VECTOR_DRIVER'))
    assign(vector, 'path', read(env, 'COGENTA_VECTOR_PATH'))
    assign(vector, 'table', read(env, 'COGENTA_VECTOR_TABLE'))
    output['vector'] = vector
  }

  return output
}

export interface EnvironmentSecrets {
  readonly llmApiKey: string | undefined
  /** Separate from `llmApiKey`: the image vendor is chosen independently of the text one. */
  readonly imageApiKey: string | undefined
  readonly storageAccessKeyId: string | undefined
  readonly storageSecretAccessKey: string | undefined
  /** Signs @cogenta/auth's MFA tickets. Never in the config file — there is no `auth` section to put it in, on purpose. */
  readonly authSigningKey: string | undefined
  /** Signs outbound content-lifecycle webhooks. Shared with every configured endpoint. */
  readonly webhookSecret: string | undefined
}

export function readSecrets(env: Environment): EnvironmentSecrets {
  return {
    llmApiKey: read(env, 'COGENTA_LLM_API_KEY'),
    imageApiKey: read(env, 'COGENTA_IMAGE_API_KEY'),
    storageAccessKeyId: read(env, 'COGENTA_STORAGE_ACCESS_KEY_ID'),
    storageSecretAccessKey: read(env, 'COGENTA_STORAGE_SECRET_ACCESS_KEY'),
    authSigningKey: read(env, 'COGENTA_AUTH_SIGNING_KEY'),
    webhookSecret: read(env, 'COGENTA_WEBHOOK_SECRET'),
  }
}

/**
 * Finds secrets written into the config file. Returns the dotted paths, never
 * the values — an error message must not leak what it is complaining about.
 */
export function findSecretsInFile(input: Record<string, unknown>): readonly string[] {
  const found: string[] = []
  for (const path of SECRET_KEYS.keys()) {
    const [sectionName, key] = path.split('.')
    if (sectionName === undefined || key === undefined) continue

    const target = input[sectionName]
    if (isPlainObject(target) && target[key] !== undefined) found.push(path)
  }
  return found
}
