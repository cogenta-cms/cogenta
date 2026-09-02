import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatDoctorReport, runDoctor } from '../src/commands/doctor.js'
import { run } from '../src/index.js'
import { createOutput } from '../src/output.js'

/** A project directory with a config file, and nothing else installed. */
async function project(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-cli-'))
  await writeFile(join(root, 'cogenta.config.mjs'), config, 'utf8')
  return root
}

const minimal = (root: string): string => `
export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`

let written: string[]
const write = (text: string): void => {
  written.push(text)
}
const output = (): string => written.join('')

beforeEach(() => {
  written = []
})

describe('doctor — a machine with no Redis, no Docker and no S3', () => {
  // The L0 smoke test, stated as its acceptance criterion does: the default
  // install has no external dependency, so this must be a clean run.
  it('reports a working install using only degraded drivers', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.problems).toEqual([])
    expect(report.checks.map((check) => check.need)).toEqual([
      'database',
      'cache',
      'storage',
      'images',
      'vector',
      'rateLimit',
    ])
    // `images` is the one exception: `sharp` is a native module, not an
    // external service, so whether it reports `optimal` (compiled for this
    // OS/arch — true on the machine that runs this test suite) or
    // `degraded` (the WebAssembly fallback) is orthogonal to "no Redis, no
    // Docker, no S3" — the property every other need above actually tests.
    expect(
      report.checks
        .filter((check) => check.need !== 'images')
        .every((check) => check.tier === 'degraded'),
    ).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  it('exits zero, because a degraded install is a working install', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    expect(await run({ argv: ['doctor', '--cwd', root], stdout: write, env: {} })).toBe(0)
    expect(output()).toContain('Nothing is broken.')

    await rm(root, { recursive: true, force: true })
  })
})

describe('doctor — saying why', () => {
  it('gives a reason for every driver it chose', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    for (const check of report.checks) expect(check.reason).not.toBe('')
    await rm(root, { recursive: true, force: true })
  })

  it('says a driver was named rather than chosen, when it was', async () => {
    const root = await project('')
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      `${minimal(root).replace('cache: {', "cache: { driver: 'memory',")}`,
      'utf8',
    )

    const report = await runDoctor({ cwd: root, env: {} })
    const cache = report.checks.find((check) => check.need === 'cache')

    expect(cache?.driver).toBe('memory')
    expect(cache?.reason).toBe('named in the configuration')

    await rm(root, { recursive: true, force: true })
  })

  it('names what it skipped and why', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })
    const cache = report.checks.find((check) => check.need === 'cache')

    // Redis was tried and was not there. An operator has to be able to see that.
    expect(cache?.skipped.map((entry) => entry.driver)).toContain('redis')

    await rm(root, { recursive: true, force: true })
  })
})

describe('doctor — the vector driver (audit fiche 15, T05)', () => {
  it('fails with an actionable message when vector.driver is pinned to pgvector on a non-Postgres site', async () => {
    const root = await project('')
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      minimal(root).replace('database: {', "vector: { driver: 'pgvector' },\n  database: {"),
      'utf8',
    )

    const report = await runDoctor({ cwd: root, env: {} })

    // The `database` section above is still SQLite (`minimal`), so
    // `pgvector`'s own `available()` check (`db.dialect !== 'postgres'`)
    // refuses it — a *named*, unavailable driver is a `DRIVER_UNAVAILABLE`
    // error, not a silent fallback (`createDriverRegistry`'s own contract),
    // and `check()` turns that into a named problem instead of a stack trace.
    expect(report.problems.some((problem) => problem.startsWith('vector:'))).toBe(true)
    expect(report.checks.some((check) => check.need === 'vector')).toBe(false)

    await rm(root, { recursive: true, force: true })
  })

  it('reports no problem when vector is left unconfigured — a degraded default exists', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.problems).toEqual([])
    const vector = report.checks.find((check) => check.need === 'vector')
    expect(vector).toBeDefined()
    expect(vector?.tier).toBe('degraded')

    await rm(root, { recursive: true, force: true })
  })
})

describe('doctor — what it warns about', () => {
  it('says the CMS works without an LLM, rather than leaving it to be guessed', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.notes.join(' ')).toContain('Everything works except the agents')
    await rm(root, { recursive: true, force: true })
  })

  // Audit fiche 15, T05: reported as a note (no driver-tier concept exists
  // for this need — `createImageProviderRegistry` is a plain API-key
  // registry, unlike `database`/`cache`/`vector`), and only when configured
  // — an unconfigured site gets no note at all, matching R2.
  it('says nothing about image generation when it is not configured', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.notes.some((note) => note.includes('Image-generation'))).toBe(false)
    await rm(root, { recursive: true, force: true })
  })

  it('names the image-generation provider and warns about a missing API key', async () => {
    const root = await project('')
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      minimal(root).replace(
        'database: {',
        "imageGeneration: { provider: 'openai', model: 'gpt-image-1' },\n  database: {",
      ),
      'utf8',
    )

    const report = await runDoctor({ cwd: root, env: {} })

    const note = report.notes.find((entry) => entry.includes('Image-generation'))
    expect(note).toContain('openai')
    expect(note).toContain('gpt-image-1')
    expect(note).toContain('No API key')
    await rm(root, { recursive: true, force: true })
  })

  it('warns that signed media URLs will not survive a restart', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.notes.join(' ')).toContain('COGENTA_STORAGE_SIGNING_KEY')
    await rm(root, { recursive: true, force: true })
  })

  // Fiche 40 task 4: the same failure a first "Prévisualiser" click threw
  // (`CONFIG_INVALID`, `packages/api/src/access/preview-token.ts`), caught
  // ahead of time — as a warning, never a blocking problem, since a site that
  // never previews an unpublished draft is not broken by lacking this key.
  it('warns that preview links will fail without a preview signing key, without failing the run', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.notes.join(' ')).toContain('COGENTA_PREVIEW_SIGNING_KEY')
    expect(report.notes.join(' ')).toContain('openssl rand -hex 32')
    expect(report.problems).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  it('warns when the preview signing key is present but too short', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({
      cwd: root,
      env: { COGENTA_PREVIEW_SIGNING_KEY: 'too-short' },
    })

    expect(report.notes.join(' ')).toContain('COGENTA_PREVIEW_SIGNING_KEY')
    expect(report.problems).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  it('says nothing about the preview signing key once one long enough is set', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    const report = await runDoctor({
      cwd: root,
      env: { COGENTA_PREVIEW_SIGNING_KEY: 'a'.repeat(32) },
    })

    expect(report.notes.join(' ')).not.toContain('COGENTA_PREVIEW_SIGNING_KEY')
    await rm(root, { recursive: true, force: true })
  })

  it('never prints a secret it was given', async () => {
    const root = await project('')
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      `${minimal(root).replace(
        'export default {',
        "export default {\n  llm: { provider: 'anthropic', model: 'claude-sonnet' },",
      )}`,
      'utf8',
    )

    const report = await runDoctor({
      cwd: root,
      env: { COGENTA_LLM_API_KEY: 'sk-ant-must-not-appear' },
    })
    formatDoctorReport(report, createOutput(write, false))

    expect(output()).not.toContain('sk-ant-must-not-appear')
    await rm(root, { recursive: true, force: true })
  })
})

describe('doctor — a broken configuration', () => {
  it('reports the offending field instead of a stack trace', async () => {
    const root = await project(
      "export default { site: { name: 'x', url: 'not-a-url' }, database: {} }",
    )

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.problems.join(' ')).toContain('site.url')
    expect(report.problems.join(' ')).toContain('database.url')
    await rm(root, { recursive: true, force: true })
  })

  it('exits non-zero so a deployment script notices', async () => {
    const root = await project("export default { site: { name: 'x', url: 'nope' }, database: {} }")

    expect(await run({ argv: ['doctor', '--cwd', root], stdout: write, env: {} })).toBe(1)
    await rm(root, { recursive: true, force: true })
  })

  it('still reports the environment, which is what a bug report needs', async () => {
    const root = await project('export default { nonsense: true }')

    const report = await runDoctor({ cwd: root, env: {} })

    expect(report.node).toBe(process.versions.node)
    expect(report.problems.length).toBeGreaterThan(0)
    await rm(root, { recursive: true, force: true })
  })
})

describe('the command line itself', () => {
  it('prints usage and exits zero with no arguments', async () => {
    expect(await run({ argv: [], stdout: write, env: {} })).toBe(0)
    expect(output()).toContain('Usage')
  })

  it('rejects an unknown command with a usage message', async () => {
    const errors: string[] = []
    const code = await run({
      argv: ['nope'],
      stdout: write,
      stderr: (text) => errors.push(text),
      env: {},
    })

    expect(code).toBe(2)
    expect(errors.join('')).toContain('Unknown command')
  })

  it('rejects an unknown option rather than ignoring it', async () => {
    const errors: string[] = []
    const code = await run({
      argv: ['doctor', '--wat'],
      stdout: write,
      stderr: (text) => errors.push(text),
      env: {},
    })

    expect(code).toBe(2)
    expect(errors.join('')).toContain('Usage')
  })

  it('prints the version', async () => {
    expect(await run({ argv: ['version'], stdout: write, env: {}, version: '1.2.3' })).toBe(0)
    expect(output().trim()).toBe('1.2.3')
  })

  it('leaves colour out of a pipe, and out of NO_COLOR', async () => {
    const root = await project('')
    await writeFile(join(root, 'cogenta.config.mjs'), minimal(root), 'utf8')

    await run({ argv: ['doctor', '--cwd', root], stdout: write, env: {}, isTty: false })

    // No escape codes: piping to a file must not fill it with control characters.
    expect(output()).not.toContain('\u001B[')
    await rm(root, { recursive: true, force: true })
  })
})
