import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

const VALID_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
}

/** Fails the AA contrast check: `fg` on `bg` is near-invisible. */
const INVALID_TOKENS = { ...VALID_TOKENS, color: { ...VALID_TOKENS.color, fg: '#fefefe' } }

async function project(llm?: { provider: string; model: string }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-cli-skin-'))
  const llmBlock =
    llm === undefined
      ? ''
      : `  llm: { provider: ${JSON.stringify(llm.provider)}, model: ${JSON.stringify(llm.model)} },\n`
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
${llmBlock}}
`,
    'utf8',
  )
  return root
}

let written: string[]
const write = (text: string): void => {
  written.push(text)
}
const output = (): string => written.join('')

function fakeAnthropicFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

describe('cogenta skin', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    written = []
  })

  describe('list', () => {
    it('reports the active skin, group by group', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      await writeFile(
        join(root, 'theme.tokens.json'),
        `${JSON.stringify(VALID_TOKENS, null, 2)}\n`,
        'utf8',
      )

      const code = await run({ argv: ['skin', 'list', '--cwd', root], stdout: write, env: {} })

      expect(code).toBe(0)
      expect(output()).toContain('Active skin')
      expect(output()).toContain('color')
    })

    it('exits 1 when no skin has been applied yet', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      let errText = ''

      const code = await run({
        argv: ['skin', 'list', '--cwd', root],
        stdout: write,
        stderr: (text) => {
          errText += text
        },
        env: {},
      })

      expect(code).toBe(1)
      expect(errText).toContain('Could not read')
    })
  })

  describe('validate', () => {
    it('exits 0 for a valid token file', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      const file = join(root, 'candidate.json')
      await writeFile(file, JSON.stringify(VALID_TOKENS), 'utf8')

      const code = await run({ argv: ['skin', 'validate', file], stdout: write, env: {} })

      expect(code).toBe(0)
      expect(output()).toContain('valid skin')
    })

    it('exits 1 with the real validator hint for an invalid token file', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      const file = join(root, 'candidate.json')
      await writeFile(file, JSON.stringify(INVALID_TOKENS), 'utf8')
      let errText = ''

      const code = await run({
        argv: ['skin', 'validate', file],
        stdout: write,
        stderr: (text) => {
          errText += text
        },
        env: {},
      })

      expect(code).toBe(1)
      expect(errText).toMatch(/contrast/i)
    })

    it('exits 2 when no file is given', async () => {
      written = []
      let errText = ''

      const code = await run({
        argv: ['skin', 'validate'],
        stdout: write,
        stderr: (text) => {
          errText += text
        },
        env: {},
      })

      expect(code).toBe(2)
    })
  })

  describe('apply', () => {
    it('validates then writes theme.tokens.json', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      const file = join(root, 'candidate.json')
      await writeFile(file, JSON.stringify(VALID_TOKENS), 'utf8')

      const code = await run({
        argv: ['skin', 'apply', file, '--cwd', root],
        stdout: write,
        env: {},
      })

      expect(code).toBe(0)
      const applied = JSON.parse(await readFile(join(root, 'theme.tokens.json'), 'utf8'))
      expect(applied.color.bg).toBe('#ffffff')
    })

    it('refuses to write an invalid token file', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      const file = join(root, 'candidate.json')
      await writeFile(file, JSON.stringify(INVALID_TOKENS), 'utf8')

      const code = await run({
        argv: ['skin', 'apply', file, '--cwd', root],
        stdout: write,
        env: {},
      })

      expect(code).toBe(1)
      await expect(readFile(join(root, 'theme.tokens.json'), 'utf8')).rejects.toThrow()
    })
  })

  describe('generate', () => {
    it('exits 1 with no LLM provider configured — the CMS works without one (R2)', async () => {
      written = []
      const root = await project()
      dirs.push(root)
      let errText = ''

      const code = await run({
        argv: ['skin', 'generate', '--cwd', root, '--description', 'A calm portfolio.'],
        stdout: write,
        stderr: (text) => {
          errText += text
        },
        env: {},
      })

      expect(code).toBe(1)
      expect(errText).toContain('No LLM provider is configured')
    })

    it('exits 2 with no --description', async () => {
      written = []
      const root = await project({ provider: 'anthropic', model: 'claude-sonnet-5' })
      dirs.push(root)

      const code = await run({
        argv: ['skin', 'generate', '--cwd', root],
        stdout: write,
        env: { COGENTA_LLM_API_KEY: 'sk-test' },
      })

      expect(code).toBe(2)
    })

    it('generates, validates and applies a skin end-to-end against a mocked provider', {
      timeout: 15000,
    }, async () => {
      written = []
      const root = await project({ provider: 'anthropic', model: 'claude-sonnet-5' })
      dirs.push(root)

      // The provider construction happens inside runSkin, which has no seam
      // for fetchImpl through `run()` — exercised directly here instead.
      const { runSkin } = await import('../src/commands/skin.js')
      const { createOutput } = await import('../src/output.js')
      const out = createOutput(write, false)

      const code = await runSkin({
        subcommand: 'generate',
        file: undefined,
        cwd: root,
        env: { COGENTA_LLM_API_KEY: 'sk-test' },
        out,
        stderr: () => {},
        description: 'A calm, minimal portfolio for a photographer.',
        fetchImpl: fakeAnthropicFetch({
          content: [{ type: 'text', text: JSON.stringify(VALID_TOKENS) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      })

      expect(code).toBe(0)
      const applied = JSON.parse(await readFile(join(root, 'theme.tokens.json'), 'utf8'))
      expect(applied.color.bg).toBe('#ffffff')
    })

    it('falls back without writing anything when every attempt fails validation', {
      timeout: 15000,
    }, async () => {
      written = []
      const root = await project({ provider: 'anthropic', model: 'claude-sonnet-5' })
      dirs.push(root)

      const { runSkin } = await import('../src/commands/skin.js')
      const { createOutput } = await import('../src/output.js')
      const out = createOutput(write, false)
      let errText = ''

      const code = await runSkin({
        subcommand: 'generate',
        file: undefined,
        cwd: root,
        env: { COGENTA_LLM_API_KEY: 'sk-test' },
        out,
        stderr: (text) => {
          errText += text
        },
        description: 'A calm, minimal portfolio for a photographer.',
        fetchImpl: fakeAnthropicFetch({
          content: [{ type: 'text', text: JSON.stringify(INVALID_TOKENS) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      })

      expect(code).toBe(1)
      expect(errText).toMatch(/attempt.*failed validation/i)
      await expect(readFile(join(root, 'theme.tokens.json'), 'utf8')).rejects.toThrow()
    })
  })
})
