import { isAbsolute, resolve as resolvePath } from 'node:path'
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
 * Resolves a path written in a config file against the directory that file
 * lives in, rather than against the current working directory.
 *
 * Without this, running a command from a subdirectory silently uses different
 * files: `cogenta migrate status` from `src/` opens an empty `./site.db` next to
 * `src/` and reports every migration as pending, on a database that is already
 * fully migrated. A relative path in a committed config file means "relative to
 * the project", the way it does in every other tool that reads one.
 *
 * A URL is left alone, and so is `:memory:`. A Windows drive letter is not a
 * scheme — the pattern needs two characters before the colon.
 */
function againstConfigFile(value: string, baseDir: string | undefined): string {
  if (baseDir === undefined || value === ':memory:') return value
  if (/^[a-z][a-z0-9+.-]+:/i.test(value)) return value
  return isAbsolute(value) ? value : resolvePath(baseDir, value)
}

/**
 * Turns whatever was written in a config file into the fully resolved
 * configuration the rest of Cogenta consumes.
 *
 * Precedence is defaults → file → environment. An invalid configuration fails
 * here, at startup, naming every offending field at once — never three requests
 * later with a stack trace.
 *
 * `baseDir` is the directory of the config file, when there was one. Relative
 * paths are resolved against it.
 */
export function resolveConfig(
  input: unknown,
  env: Environment = process.env,
  baseDir?: string,
): CogentaConfig {
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
      notFoundPath: config.site.notFoundPath,
    }),
    database: Object.freeze({
      driver,
      // Only SQLite has a path for a URL; the others are server addresses.
      url:
        driver === 'sqlite' ? againstConfigFile(config.database.url, baseDir) : config.database.url,
      poolSize: config.database.poolSize,
    }),
    cache: Object.freeze({
      driver: config.cache.driver,
      url: config.cache.url,
      path: againstConfigFile(config.cache.path, baseDir),
    }),
    queue: Object.freeze({ driver: config.queue.driver, url: config.queue.url }),
    rateLimit: Object.freeze({ driver: config.rateLimit.driver, url: config.rateLimit.url }),
    storage: Object.freeze({
      driver: config.storage.driver,
      bucket: config.storage.bucket,
      region: config.storage.region,
      endpoint: config.storage.endpoint,
      path: againstConfigFile(config.storage.path, baseDir),
      baseUrl: config.storage.baseUrl,
      accessKeyId: secrets.storageAccessKeyId,
      secretAccessKey: secrets.storageSecretAccessKey,
    }),
    auth: Object.freeze({ signingKey: secrets.authSigningKey }),
    security: Object.freeze({
      cors: Object.freeze({
        origins: Object.freeze([...config.security.cors.origins]),
        methods: Object.freeze([...config.security.cors.methods]),
        headers: Object.freeze([...config.security.cors.headers]),
        credentials: config.security.cors.credentials,
        maxAge: config.security.cors.maxAge,
      }),
      csp: config.security.csp,
      hstsMaxAge: config.security.hstsMaxAge,
      hstsIncludeSubDomains: config.security.hstsIncludeSubDomains,
      pageMaxAge: config.security.pageMaxAge,
    }),
    notFoundLog: Object.freeze({
      enabled: config.notFoundLog.enabled,
      maxPaths: config.notFoundLog.maxPaths,
      retainDays: config.notFoundLog.retainDays,
    }),
    webhooks: Object.freeze({
      endpoints: Object.freeze([...config.webhooks.endpoints]),
      secret: secrets.webhookSecret,
    }),
    analytics: Object.freeze({ retainDays: config.analytics.retainDays }),
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
    imageGeneration:
      config.imageGeneration === undefined
        ? undefined
        : Object.freeze({
            provider: config.imageGeneration.provider,
            model: config.imageGeneration.model,
            baseUrl: config.imageGeneration.baseUrl,
            apiKey: secrets.imageApiKey,
          }),
    vector: Object.freeze({
      driver: config.vector.driver,
      path: config.vector.path,
      table: config.vector.table,
    }),
    billing:
      config.billing === undefined
        ? undefined
        : Object.freeze({
            legalName: config.billing.legalName,
            address: Object.freeze([...config.billing.address]),
            taxId: config.billing.taxId,
            footer: config.billing.footer,
          }),
    scheduler: Object.freeze({
      mode: config.scheduler.mode,
    }),
    backup: Object.freeze({
      enabled: config.backup.enabled,
      intervalHours: config.backup.intervalHours,
      keep: config.backup.keep,
      dir: config.backup.dir,
    }),
    assistant: Object.freeze({
      monthlyTokenLimit: config.assistant.monthlyTokenLimit,
    }),
    payment: Object.freeze({
      driver: config.payment.driver,
      testMode: config.payment.testMode,
      manualInstructions: config.payment.manualInstructions,
      stripeSecretKey: secrets.paymentStripeSecretKey,
      stripeWebhookSecret: secrets.paymentStripeWebhookSecret,
    }),
    observability: Object.freeze({
      serviceName: config.observability.serviceName,
      otlpEndpoint: config.observability.otlpEndpoint,
      otlpHeaders:
        secrets.otlpHeaders === undefined ? undefined : Object.freeze({ ...secrets.otlpHeaders }),
    }),
  })
}
