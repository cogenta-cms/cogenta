import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigFileError, loadConfigFile } from '../src/config-file.js'

describe('loadConfigFile', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withFile(contents: string): Promise<{ dir: string; path: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-configfile-'))
    dirs.push(dir)
    const path = join(dir, 'install.json')
    await writeFile(path, contents, 'utf8')
    return { dir, path }
  }

  it('fills in every default for a minimal file naming only site.name and site.url', async () => {
    const { dir, path } = await withFile(
      JSON.stringify({ site: { name: 'My Site', url: 'https://example.com' } }),
    )

    const answers = await loadConfigFile(path, dir)

    expect(answers.siteName).toBe('My Site')
    expect(answers.siteUrl).toBe('https://example.com')
    expect(answers.defaultLocale).toBe('en')
    expect(answers.blueprintId).toBe('blank')
    expect(answers.databaseDriver).toBe('sqlite')
    expect(answers.llmProvider).toBe('none')
    expect(answers.adminEmail).toBe('admin@example.com')
  })

  it('reads every field when the file sets them all', async () => {
    const { dir, path } = await withFile(
      JSON.stringify({
        site: { name: 'My Site', url: 'https://example.com', defaultLocale: 'fr' },
        blueprint: 'blank',
        database: { driver: 'postgres', url: 'postgres://localhost/site' },
        llm: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-test' },
        adminEmail: 'root@example.com',
      }),
    )

    const answers = await loadConfigFile(path, dir)

    expect(answers.defaultLocale).toBe('fr')
    expect(answers.databaseDriver).toBe('postgres')
    expect(answers.databaseUrl).toBe('postgres://localhost/site')
    expect(answers.llmProvider).toBe('anthropic')
    expect(answers.llmModel).toBe('claude-sonnet-5')
    expect(answers.llmApiKey).toBe('sk-test')
    expect(answers.adminEmail).toBe('root@example.com')
  })

  it('throws, naming the field, when site.name is missing', async () => {
    const { dir, path } = await withFile(JSON.stringify({ site: { url: 'https://example.com' } }))

    await expect(loadConfigFile(path, dir)).rejects.toThrow(ConfigFileError)
    await expect(loadConfigFile(path, dir)).rejects.toThrow(/site\.name/)
  })

  it('throws, naming the field, when site.url is missing', async () => {
    const { dir, path } = await withFile(JSON.stringify({ site: { name: 'My Site' } }))

    await expect(loadConfigFile(path, dir)).rejects.toThrow(/site\.url/)
  })

  it('throws on invalid JSON', async () => {
    const { dir, path } = await withFile('{ not json')

    await expect(loadConfigFile(path, dir)).rejects.toThrow(ConfigFileError)
  })

  it('throws on an unknown database driver', async () => {
    const { dir, path } = await withFile(
      JSON.stringify({
        site: { name: 'My Site', url: 'https://example.com' },
        database: { driver: 'oracle' },
      }),
    )

    await expect(loadConfigFile(path, dir)).rejects.toThrow(/database\.driver/)
  })

  it('throws on an unknown llm provider', async () => {
    const { dir, path } = await withFile(
      JSON.stringify({
        site: { name: 'My Site', url: 'https://example.com' },
        llm: { provider: 'cohere' },
      }),
    )

    await expect(loadConfigFile(path, dir)).rejects.toThrow(/llm\.provider/)
  })

  it('throws with an actionable message when the file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-configfile-'))
    dirs.push(dir)

    await expect(loadConfigFile(join(dir, 'missing.json'), dir)).rejects.toThrow(ConfigFileError)
  })
})
