import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOutput } from '@cogenta/cli'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultsPrompter } from '../src/prompts.js'
import { runWizard } from '../src/wizard.js'

describe('runWizard', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  function captureOutput(): { out: ReturnType<typeof createOutput>; text: () => string } {
    const chunks: string[] = []
    return { out: createOutput((text) => chunks.push(text), false), text: () => chunks.join('') }
  }

  it('produces a working site from nine defaults — the --yes path', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-wizard-'))
    dirs.push(targetDir)
    const { out, text } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'my-site',
      prompter: createDefaultsPrompter(),
      out,
      env: {},
    })

    expect(exitCode).toBe(0)
    expect(text()).toContain('Password:')
    expect(text()).toContain('Default skin')
  })

  it('installs non-interactively from a --config file', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-wizard-'))
    dirs.push(targetDir)
    const configPath = join(targetDir, 'install.json')
    await writeFile(
      configPath,
      JSON.stringify({ site: { name: 'Configured Site', url: 'https://configured.example' } }),
      'utf8',
    )
    const { out, text } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'my-site',
      prompter: createDefaultsPrompter(),
      out,
      env: {},
      configPath,
    })

    expect(exitCode).toBe(0)
    expect(text()).toContain('Configured Site')
  })

  it('returns 2 and never scaffolds when the --config file is invalid', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-wizard-'))
    dirs.push(targetDir)
    const configPath = join(targetDir, 'install.json')
    await writeFile(configPath, JSON.stringify({ site: {} }), 'utf8')
    const { out, text } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'my-site',
      prompter: createDefaultsPrompter(),
      out,
      env: {},
      configPath,
    })

    expect(exitCode).toBe(2)
    expect(text()).toContain('site.name')
  })

  it('reports the fallback, never silently, when the requested blueprint is not built yet', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-wizard-'))
    dirs.push(targetDir)
    const configPath = join(targetDir, 'install.json')
    await writeFile(
      configPath,
      JSON.stringify({
        site: { name: 'Showcase Site', url: 'https://showcase.example' },
        blueprint: 'vitrine',
      }),
      'utf8',
    )
    const { out, text } = captureOutput()

    const exitCode = await runWizard({
      targetDir,
      siteName: 'my-site',
      prompter: createDefaultsPrompter(),
      out,
      env: {},
      configPath,
    })

    expect(exitCode).toBe(0)
    expect(text()).toContain('is not built yet')
  })
})
