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
