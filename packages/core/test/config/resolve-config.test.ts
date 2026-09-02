import { isAbsolute, resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { CogentaError } from '../../src/errors/index.js'

const minimal = {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: 'postgres://user@localhost:5432/app' },
} as const

/** Nothing is inherited from the real process environment in these tests. */
const noEnv: Record<string, string | undefined> = {}

describe('resolveConfig — defaults', () => {
  it('applies defaults for everything the user did not specify', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.site.locales).toEqual(['en'])
    expect(config.site.defaultLocale).toBe('en')
  })

  it('leaves cache, queue and storage on auto so the registry picks by availability', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.cache.driver).toBe('auto')
    expect(config.queue.driver).toBe('auto')
    expect(config.storage.driver).toBe('auto')
  })

  it('configures no LLM at all when none is given, because the CMS works without AI', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.llm).toBeUndefined()
  })

  it('defaults embeddings to the local provider, which needs no API key', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.embeddings.provider).toBe('local')
  })
})

describe('resolveConfig — database driver inference', () => {
  it.each([
    ['postgres://user@localhost:5432/app', 'postgres'],
    ['postgresql://user@localhost:5432/app', 'postgres'],
    ['mysql://user@localhost:3306/app', 'mysql'],
    ['mariadb://user@localhost:3306/app', 'mysql'],
    ['file:./data/site.db', 'sqlite'],
    ['sqlite://./data/site.db', 'sqlite'],
    ['./data/site.db', 'sqlite'],
  ])('infers %s as the %s driver', (url, expected) => {
    const config = resolveConfig({ ...minimal, database: { url } }, noEnv)

    expect(config.database.driver).toBe(expected)
  })

  it('keeps an explicitly named driver even when the URL suggests another', () => {
    const config = resolveConfig(
      { ...minimal, database: { driver: 'mysql', url: 'mariadb://user@localhost:3306/app' } },
      noEnv,
    )

    expect(config.database.driver).toBe('mysql')
  })

  it('names the field when the URL scheme is not one we support', () => {
    expect(() =>
      resolveConfig({ ...minimal, database: { url: 'mongodb://localhost' } }, noEnv),
    ).toThrowError(/database\.driver/)
  })
})

describe('resolveConfig — environment precedence', () => {
  it('lets the environment override the config file', () => {
    const config = resolveConfig(minimal, {
      COGENTA_SITE_URL: 'https://staging.example.com',
      COGENTA_DATABASE_URL: 'mysql://user@localhost:3306/staging',
    })

    expect(config.site.url).toBe('https://staging.example.com')
    expect(config.database.url).toBe('mysql://user@localhost:3306/staging')
    expect(config.database.driver).toBe('mysql')
  })

  it('accepts the conventional DATABASE_URL, with COGENTA_DATABASE_URL winning', () => {
    expect(resolveConfig(minimal, { DATABASE_URL: 'mysql://u@h:3306/a' }).database.url).toBe(
      'mysql://u@h:3306/a',
    )

    const both = resolveConfig(minimal, {
      DATABASE_URL: 'mysql://u@h:3306/a',
      COGENTA_DATABASE_URL: 'postgres://u@h:5432/b',
    })
    expect(both.database.url).toBe('postgres://u@h:5432/b')
  })

  it('reads the site locales as a comma-separated list', () => {
    const config = resolveConfig(minimal, {
      COGENTA_SITE_LOCALES: 'fr, en ,de',
      COGENTA_SITE_DEFAULT_LOCALE: 'fr',
    })

    expect(config.site.locales).toEqual(['fr', 'en', 'de'])
    expect(config.site.defaultLocale).toBe('fr')
  })

  it('ignores an environment variable that is set but empty', () => {
    const config = resolveConfig(minimal, { COGENTA_SITE_URL: '' })

    expect(config.site.url).toBe('https://example.com')
  })
})

describe('resolveConfig — secrets come from the environment only', () => {
  it('refuses an API key written in the config file', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, llm: { provider: 'anthropic', model: 'claude-sonnet', apiKey: 'sk-x' } },
        noEnv,
      ),
    ).toThrowError(/llm\.apiKey/)
  })

  it('points the user at the environment variable to use instead', () => {
    try {
      resolveConfig(
        { ...minimal, llm: { provider: 'anthropic', model: 'claude-sonnet', apiKey: 'sk-x' } },
        noEnv,
      )
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_SECRET_IN_FILE')
      expect((error as CogentaError).hint).toContain('COGENTA_LLM_API_KEY')
    }
  })

  it('never echoes the secret value back in the error', () => {
    try {
      resolveConfig(
        { ...minimal, llm: { provider: 'anthropic', model: 'claude', apiKey: 'sk-ant-secret' } },
        noEnv,
      )
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(JSON.stringify((error as CogentaError).toJSON())).not.toContain('sk-ant-secret')
    }
  })

  it('takes the API key from the environment', () => {
    const config = resolveConfig(
      { ...minimal, llm: { provider: 'anthropic', model: 'claude-sonnet' } },
      { COGENTA_LLM_API_KEY: 'sk-ant-from-env' },
    )

    expect(config.llm?.apiKey).toBe('sk-ant-from-env')
  })

  it('refuses storage credentials written in the config file', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, storage: { driver: 's3', bucket: 'media', secretAccessKey: 'shh' } },
        noEnv,
      ),
    ).toThrowError(/storage\.secretAccessKey/)
  })

  it('leaves auth.signingKey undefined when COGENTA_AUTH_SIGNING_KEY is not set', () => {
    expect(resolveConfig(minimal, noEnv).auth.signingKey).toBeUndefined()
  })

  it('takes the auth signing key from the environment', () => {
    const config = resolveConfig(minimal, { COGENTA_AUTH_SIGNING_KEY: 'a-real-signing-key' })
    expect(config.auth.signingKey).toBe('a-real-signing-key')
  })

  it('has no `auth` section to write a signing key into in the file at all', () => {
    // Unlike llm.apiKey or storage.secretAccessKey, there is nothing named
    // `auth` in the input schema — a signing key in the file is rejected as an
    // unrecognised key, not as a recognised-but-forbidden secret field.
    expect(() =>
      resolveConfig({ ...minimal, auth: { signingKey: 'sk-in-file' } }, noEnv),
    ).toThrowError(/auth/)
  })
})

describe('resolveConfig — invalid configuration fails at startup', () => {
  it('throws a CogentaError coded CONFIG_INVALID', () => {
    try {
      resolveConfig({ site: { name: 'x', url: 'not-a-url' }, database: { url: 'x' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_INVALID')
    }
  })

  it('names the offending field and the expected value', () => {
    try {
      resolveConfig({ site: { name: 'x', url: 'not-a-url' }, database: { url: 'x' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).message).toContain('site.url')
      expect((error as CogentaError).message).toMatch(/url/i)
    }
  })

  it('reports every invalid field at once, not just the first', () => {
    try {
      resolveConfig({ site: { name: '', url: 'nope' }, database: {} }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      const { message } = error as CogentaError
      expect(message).toContain('site.name')
      expect(message).toContain('site.url')
      expect(message).toContain('database.url')
    }
  })

  it('rejects a typo in a config key instead of silently ignoring it', () => {
    expect(() => resolveConfig({ ...minimal, databse: { url: 'x' } }, noEnv)).toThrowError(
      /databse/,
    )
  })

  it('rejects a default locale that is not in the list of locales', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, site: { ...minimal.site, locales: ['fr', 'en'], defaultLocale: 'de' } },
        noEnv,
      ),
    ).toThrowError(/defaultLocale/)
  })

  it('rejects an unknown driver by naming the accepted values', () => {
    try {
      resolveConfig({ ...minimal, cache: { driver: 'memcached' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).message).toContain('cache.driver')
      expect((error as CogentaError).message).toContain('memory')
    }
  })

  it('always carries a hint, because the message is aimed at a human', () => {
    try {
      resolveConfig({ site: { name: 'x', url: 'nope' }, database: { url: 'x' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).hint).toBeTruthy()
    }
  })
})

describe('resolveConfig — paths are relative to the config file', () => {
  // Found by running the CLI from a subdirectory: it opened an empty `./site.db`
  // next to the shell and reported an already-migrated database as untouched.
  // Absolute on every platform, including Windows, where it gains a drive.
  const base = resolvePath('/projects/site')

  it('resolves a relative SQLite path against the project, not the shell', () => {
    const config = resolveConfig({ ...minimal, database: { url: './data/site.db' } }, noEnv, base)

    expect(config.database.driver).toBe('sqlite')
    expect(isAbsolute(config.database.url)).toBe(true)
    expect(config.database.url).toBe(resolvePath(base, 'data/site.db'))
  })

  it('resolves the cache and media directories the same way', () => {
    const config = resolveConfig(minimal, noEnv, base)

    expect(config.cache.path).toBe(resolvePath(base, '.cogenta/cache'))
    expect(config.storage.path).toBe(resolvePath(base, '.cogenta/media'))
  })

  it('leaves a server URL and an absolute path alone', () => {
    const config = resolveConfig(
      { ...minimal, database: { url: 'postgres://user@localhost:5432/app' } },
      noEnv,
      base,
    )

    expect(config.database.url).toBe('postgres://user@localhost:5432/app')
    expect(resolveConfig({ ...minimal, cache: { path: base } }, noEnv, base).cache.path).toBe(base)
  })

  it('leaves an in-memory database alone', () => {
    const config = resolveConfig({ ...minimal, database: { url: ':memory:' } }, noEnv, base)

    expect(config.database.url).toBe(':memory:')
  })

  it('changes nothing when there is no config file to be relative to', () => {
    const config = resolveConfig({ ...minimal, database: { url: './site.db' } }, noEnv)

    expect(config.database.url).toBe('./site.db')
  })
})

describe('resolveConfig — notFoundLog (fiche 12 task 1)', () => {
  it('is on by default, with a bounded cap and a 30-day retention', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.notFoundLog.enabled).toBe(true)
    expect(config.notFoundLog.maxPaths).toBe(2000)
    expect(config.notFoundLog.retainDays).toBe(30)
  })

  it('lets a site turn the log off, or tighten its bounds', () => {
    const config = resolveConfig(
      { ...minimal, notFoundLog: { enabled: false, maxPaths: 100, retainDays: 7 } },
      noEnv,
    )

    expect(config.notFoundLog).toEqual({ enabled: false, maxPaths: 100, retainDays: 7 })
  })
})

describe('resolveConfig — scheduler and backup (fiche 28)', () => {
  it('defaults the scheduler clock to internal, and backups to off', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.scheduler.mode).toBe('internal')
    expect(config.backup).toEqual({
      enabled: false,
      intervalHours: 24,
      keep: 10,
      dir: '.cogenta/backups',
    })
  })

  it('lets a shared-hosting site switch to an external cron', () => {
    const config = resolveConfig({ ...minimal, scheduler: { mode: 'external-cron' } }, noEnv)

    expect(config.scheduler.mode).toBe('external-cron')
  })

  it('lets a site turn scheduled backups on and tune them', () => {
    const config = resolveConfig(
      { ...minimal, backup: { enabled: true, intervalHours: 6, keep: 3, dir: 'my-backups' } },
      noEnv,
    )

    expect(config.backup).toEqual({
      enabled: true,
      intervalHours: 6,
      keep: 3,
      dir: 'my-backups',
    })
  })
})

describe('resolveConfig — security (L10 task 6)', () => {
  it('leaves CORS off, CSP absent and HSTS at zero when nothing is configured', () => {
    const config = resolveConfig(minimal, noEnv)

    // Every one of these is a deployment decision, and a wrong default is
    // either a site nobody can call from their frontend or — for HSTS — a
    // site nobody can reach at all.
    expect(config.security.cors.origins).toEqual([])
    expect(config.security.cors.credentials).toBe(false)
    expect(config.security.csp).toBeUndefined()
    expect(config.security.hstsMaxAge).toBe(0)
  })

  it('caches a public page briefly by default, so a publish is visible without a purge', () => {
    expect(resolveConfig(minimal, noEnv).security.pageMaxAge).toBe(60)
  })

  it('keeps the methods and headers a headless client needs, without being asked', () => {
    const config = resolveConfig(
      { ...minimal, security: { cors: { origins: ['https://app.example.com'] } } },
      noEnv,
    )

    expect(config.security.cors.origins).toEqual(['https://app.example.com'])
    expect(config.security.cors.methods).toContain('PATCH')
    expect(config.security.cors.headers).toContain('authorization')
  })

  it('refuses credentials together with the wildcard origin, which no browser accepts', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, security: { cors: { origins: ['*'], credentials: true } } },
        noEnv,
      ),
    ).toThrow(CogentaError)
  })

  it('refuses an unknown security key rather than ignoring a typo', () => {
    expect(() =>
      resolveConfig({ ...minimal, security: { hstsMaxAge: 100, hsts: true } }, noEnv),
    ).toThrow(CogentaError)
  })
})

/** T09-01 — the audit log grows without bound unless a site opts in. */
describe('resolveConfig — audit retention (T09-01)', () => {
  it('leaves retainDays absent by default, so the log keeps growing exactly as before', () => {
    expect(resolveConfig(minimal, noEnv).security.audit.retainDays).toBeUndefined()
  })

  it('honours an explicit retention window', () => {
    const config = resolveConfig({ ...minimal, security: { audit: { retainDays: 90 } } }, noEnv)
    expect(config.security.audit.retainDays).toBe(90)
  })

  it('accepts 0 as the explicit "never purge" opt-out', () => {
    const config = resolveConfig({ ...minimal, security: { audit: { retainDays: 0 } } }, noEnv)
    expect(config.security.audit.retainDays).toBe(0)
  })

  it('refuses a negative retention window', () => {
    expect(() =>
      resolveConfig({ ...minimal, security: { audit: { retainDays: -1 } } }, noEnv),
    ).toThrow(CogentaError)
  })
})

describe('resolveConfig — payment (contract E, fiche 34 task 3)', () => {
  it('defaults to "auto" and test mode on, so a shop cannot silently start taking real money', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.payment.driver).toBe('auto')
    expect(config.payment.testMode).toBe(true)
    expect(config.payment.stripeSecretKey).toBeUndefined()
    expect(config.payment.stripeWebhookSecret).toBeUndefined()
  })

  it('refuses a Stripe secret key written in the config file', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, payment: { driver: 'stripe', stripeSecretKey: 'sk_live_x' } },
        noEnv,
      ),
    ).toThrowError(/payment\.stripeSecretKey/)
  })

  it('points the user at the environment variable for the leaked Stripe key', () => {
    try {
      resolveConfig({ ...minimal, payment: { stripeSecretKey: 'sk_live_x' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_SECRET_IN_FILE')
      expect((error as CogentaError).hint).toContain('COGENTA_PAYMENT_STRIPE_SECRET_KEY')
    }
  })

  it('refuses a Stripe webhook secret written in the config file', () => {
    expect(() =>
      resolveConfig({ ...minimal, payment: { stripeWebhookSecret: 'whsec_x' } }, noEnv),
    ).toThrowError(/payment\.stripeWebhookSecret/)
  })

  it('never echoes the Stripe key back in the error', () => {
    try {
      resolveConfig({ ...minimal, payment: { stripeSecretKey: 'sk_live_super_secret' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(JSON.stringify((error as CogentaError).toJSON())).not.toContain('sk_live_super_secret')
    }
  })

  it('takes the Stripe secret key and webhook secret from the environment', () => {
    const config = resolveConfig(minimal, {
      COGENTA_PAYMENT_STRIPE_SECRET_KEY: 'sk_live_from_env',
      COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET: 'whsec_from_env',
    })

    expect(config.payment.stripeSecretKey).toBe('sk_live_from_env')
    expect(config.payment.stripeWebhookSecret).toBe('whsec_from_env')
  })

  it('lets the environment name the driver and flip test mode off', () => {
    const config = resolveConfig(minimal, {
      COGENTA_PAYMENT_DRIVER: 'stripe',
      COGENTA_PAYMENT_TEST_MODE: 'false',
    })

    expect(config.payment.driver).toBe('stripe')
    expect(config.payment.testMode).toBe(false)
  })

  it('carries manual bank-transfer instructions, which are not a secret', () => {
    const config = resolveConfig(
      { ...minimal, payment: { manualInstructions: 'IBAN FR76…, reference: order number' } },
      noEnv,
    )

    expect(config.payment.manualInstructions).toBe('IBAN FR76…, reference: order number')
  })

  it('accepts "paypal" as a named driver, defaults its credentials to undefined', () => {
    const config = resolveConfig({ ...minimal, payment: { driver: 'paypal' } }, noEnv)

    expect(config.payment.driver).toBe('paypal')
    expect(config.payment.paypalClientId).toBeUndefined()
    expect(config.payment.paypalClientSecret).toBeUndefined()
    expect(config.payment.paypalWebhookId).toBeUndefined()
  })

  it('refuses a PayPal client id, client secret, or webhook id written in the config file', () => {
    expect(() =>
      resolveConfig({ ...minimal, payment: { paypalClientId: 'AeA-client-id' } }, noEnv),
    ).toThrowError(/payment\.paypalClientId/)
    expect(() =>
      resolveConfig({ ...minimal, payment: { paypalClientSecret: 'EL-client-secret' } }, noEnv),
    ).toThrowError(/payment\.paypalClientSecret/)
    expect(() =>
      resolveConfig(
        { ...minimal, payment: { paypalWebhookId: '8PT597110X687430LKGECATA' } },
        noEnv,
      ),
    ).toThrowError(/payment\.paypalWebhookId/)
  })

  it('points the user at the environment variables for a leaked PayPal credential', () => {
    try {
      resolveConfig({ ...minimal, payment: { paypalClientSecret: 'EL-client-secret' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_SECRET_IN_FILE')
      expect((error as CogentaError).hint).toContain('COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET')
    }
  })

  it('takes the PayPal client id, client secret and webhook id from the environment', () => {
    const config = resolveConfig(minimal, {
      COGENTA_PAYMENT_PAYPAL_CLIENT_ID: 'client-id-from-env',
      COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET: 'client-secret-from-env',
      COGENTA_PAYMENT_PAYPAL_WEBHOOK_ID: 'webhook-id-from-env',
    })

    expect(config.payment.paypalClientId).toBe('client-id-from-env')
    expect(config.payment.paypalClientSecret).toBe('client-secret-from-env')
    expect(config.payment.paypalWebhookId).toBe('webhook-id-from-env')
  })

  it('never echoes the PayPal client secret back in the error', () => {
    try {
      resolveConfig(
        { ...minimal, payment: { paypalClientSecret: 'super-secret-paypal-value' } },
        noEnv,
      )
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(JSON.stringify((error as CogentaError).toJSON())).not.toContain(
        'super-secret-paypal-value',
      )
    }
  })
})

describe('resolveConfig — observability (fiche L22 task 5)', () => {
  it('defaults to a service name of "cogenta" and no OTLP export', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.observability.serviceName).toBe('cogenta')
    expect(config.observability.otlpEndpoint).toBeUndefined()
    expect(config.observability.otlpHeaders).toBeUndefined()
  })

  it('accepts a service name and an OTLP endpoint from the config file', () => {
    const config = resolveConfig(
      {
        ...minimal,
        observability: {
          serviceName: 'my-site',
          otlpEndpoint: 'https://otel.example.com/v1/traces',
        },
      },
      noEnv,
    )

    expect(config.observability.serviceName).toBe('my-site')
    expect(config.observability.otlpEndpoint).toBe('https://otel.example.com/v1/traces')
  })

  it('refuses OTLP headers written in the config file', () => {
    expect(() =>
      resolveConfig(
        { ...minimal, observability: { otlpHeaders: { authorization: 'Bearer x' } } },
        noEnv,
      ),
    ).toThrowError(/observability\.otlpHeaders/)
  })

  it('points the user at the environment variable for the leaked OTLP headers', () => {
    try {
      resolveConfig(
        { ...minimal, observability: { otlpHeaders: { authorization: 'Bearer x' } } },
        noEnv,
      )
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_SECRET_IN_FILE')
      expect((error as CogentaError).hint).toContain('COGENTA_OTLP_HEADERS')
    }
  })

  it('parses OTLP headers from the environment, spec-format key=value pairs', () => {
    const config = resolveConfig(minimal, {
      COGENTA_OTLP_HEADERS: 'Authorization=Bearer%20abc,X-Scope-OrgID=123',
    })

    expect(config.observability.otlpHeaders).toEqual({
      Authorization: 'Bearer abc',
      'X-Scope-OrgID': '123',
    })
  })

  it('falls back to the standard OTEL_* environment variable names', () => {
    const config = resolveConfig(minimal, {
      OTEL_SERVICE_NAME: 'from-otel-env',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example.com',
      OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=abc',
    })

    expect(config.observability.serviceName).toBe('from-otel-env')
    expect(config.observability.otlpEndpoint).toBe('https://collector.example.com')
    expect(config.observability.otlpHeaders).toEqual({ 'x-api-key': 'abc' })
  })

  it('prefers the COGENTA_-prefixed variable over the OTEL_* one when both are set', () => {
    const config = resolveConfig(minimal, {
      COGENTA_OTLP_ENDPOINT: 'https://cogenta-wins.example.com',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel-loses.example.com',
    })

    expect(config.observability.otlpEndpoint).toBe('https://cogenta-wins.example.com')
  })
})

describe('search console (fiche 70 task 4, ADR-0032)', () => {
  it('defaults the client id and secret to undefined — the connector is unreachable without them', () => {
    const config = resolveConfig(minimal, noEnv)

    expect(config.searchConsole.clientId).toBeUndefined()
    expect(config.searchConsole.clientSecret).toBeUndefined()
  })

  it('takes the OAuth client id and secret from the environment', () => {
    const config = resolveConfig(minimal, {
      COGENTA_SEARCH_CONSOLE_CLIENT_ID: 'client-id-from-env',
      COGENTA_SEARCH_CONSOLE_CLIENT_SECRET: 'client-secret-from-env',
    })

    expect(config.searchConsole.clientId).toBe('client-id-from-env')
    expect(config.searchConsole.clientSecret).toBe('client-secret-from-env')
  })

  it('refuses a client id or secret written in the config file', () => {
    expect(() =>
      resolveConfig({ ...minimal, searchConsole: { clientId: 'x' } }, noEnv),
    ).toThrowError(/searchConsole\.clientId/)
    expect(() =>
      resolveConfig({ ...minimal, searchConsole: { clientSecret: 'x' } }, noEnv),
    ).toThrowError(/searchConsole\.clientSecret/)
  })

  it('points the user at the environment variable for a leaked client secret', () => {
    try {
      resolveConfig({ ...minimal, searchConsole: { clientSecret: 'leaked' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CONFIG_SECRET_IN_FILE')
      expect((error as CogentaError).hint).toContain('COGENTA_SEARCH_CONSOLE_CLIENT_SECRET')
    }
  })

  it('never echoes the client secret back in the error', () => {
    try {
      resolveConfig({ ...minimal, searchConsole: { clientSecret: 'super-secret-value' } }, noEnv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(JSON.stringify((error as CogentaError).toJSON())).not.toContain('super-secret-value')
    }
  })
})
