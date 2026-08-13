import { CogentaError } from '../errors/index.js'
import { applyEnv, findSecretsInFile, readSecrets, SECRET_KEYS } from './env.js'
import { configSchema, formatIssues } from './schema.js'
import {
  type CogentaConfig,
  DATABASE_DRIVERS,
  type DatabaseDriverName,
  type Environment,
} from './types.js'

const CONFIG_HINT =
  'Fix the fields listed above in cogenta.config.ts, or set the matching COGENTA_* ' +
  'environment variables.'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the driver from the URL scheme. A single-letter scheme is a Windows
 * drive letter, not a protocol — `C:\site\data.db` is a SQLite path.
 */
function inferDatabaseDriver(url: string): DatabaseDriverName | undefined {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  if (scheme === undefined || scheme.length === 1) return 'sqlite'

  switch (scheme) {
    case 'postgres':
    case 'postgresql':
      return 'postgres'
    case 'mysql':
    case 'mariadb':
      return 'mysql'
    case 'file':
    case 'sqlite':
      return 'sqlite'
    default:
      return undefined
  }
}

/**
 * Turns whatever was written in a config file into the fully resolved
 * configuration the rest of Cogenta consumes.
 *
 * Precedence is defaults → file → environment. An invalid configuration fails
 * here, at startup, naming every offending field at once — never three requests
 * later with a stack trace.
 */
export function resolveConfig(input: unknown, env: Environment = process.env): CogentaConfig {
  if (!isPlainObject(input)) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `Cogenta configuration must be an object, received ${input === null ? 'null' : typeof input}.`,
      hint: 'Export a default object from cogenta.config.ts, built with defineConfig().',
    })
  }

  const leaked = findSecretsInFile(input)
  if (leaked.length > 0) {
    const variables = leaked.map((path) => SECRET_KEYS.get(path)).join(', ')
    throw new CogentaError({
      code: 'CONFIG_SECRET_IN_FILE',
      message: `Secrets must not appear in the config file: ${leaked.join(', ')}.`,
      hint: `Remove them and set ${variables} in the environment instead. cogenta.config.ts is committed to git; anything in it is public to everyone with repository access.`,
      details: { fields: leaked },
    })
  }

  const parsed = configSchema.safeParse(applyEnv(input, env))
  if (!parsed.success) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `Invalid Cogenta configuration:\n${formatIssues(parsed.error)}`,
      hint: CONFIG_HINT,
    })
  }

  const config = parsed.data
  const driver = config.database.driver ?? inferDatabaseDriver(config.database.url)
  if (driver === undefined) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message:
        'Invalid Cogenta configuration:\n  database.driver: cannot be inferred from the database URL. ' +
        `Name one of ${DATABASE_DRIVERS.join(', ')} explicitly.`,
      hint: CONFIG_HINT,
    })
  }

  const secrets = readSecrets(env)

  return Object.freeze({
    site: Object.freeze({
      name: config.site.name,
      url: config.site.url,
      locales: Object.freeze([...config.site.locales]),
      defaultLocale: config.site.defaultLocale,
    }),
    database: Object.freeze({ driver, url: config.database.url }),
    cache: Object.freeze({
      driver: config.cache.driver,
      url: config.cache.url,
      path: config.cache.path,
    }),
    queue: Object.freeze({ driver: config.queue.driver, url: config.queue.url }),
    storage: Object.freeze({
      driver: config.storage.driver,
      bucket: config.storage.bucket,
      region: config.storage.region,
      endpoint: config.storage.endpoint,
      path: config.storage.path,
      accessKeyId: secrets.storageAccessKeyId,
      secretAccessKey: secrets.storageSecretAccessKey,
    }),
    llm:
      config.llm === undefined
        ? undefined
        : Object.freeze({
            provider: config.llm.provider,
            model: config.llm.model,
            baseUrl: config.llm.baseUrl,
            apiKey: secrets.llmApiKey,
          }),
    embeddings: Object.freeze({
      provider: config.embeddings.provider,
      model: config.embeddings.model,
      dimensions: config.embeddings.dimensions,
    }),
  })
}
