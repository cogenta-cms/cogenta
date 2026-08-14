import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { createOutput } from '@cogenta/cli'
import { afterEach, describe, expect, it } from 'vitest'
import type { Choice, Prompter } from '../src/prompts.js'
import { chooseSkin } from '../src/skin-flow.js'

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
  font: { sans: 'sans-serif', serif: 'serif', mono: 'monospace', scale: 1.25, baseSize: '1rem' },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'linear', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.1)', md: '0 6px 24px rgba(0,0,0,.1)' },
}

function fakeClient(responses: readonly string[]): ProviderClient {
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    async chat(_request: ChatRequest): Promise<ChatResponse> {
      const content = responses[index] ?? responses.at(-1) ?? null
      index += 1
      return {
        content,
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

/** Always returns a scripted queue of choices, one per call — mirrors a human clicking through a preview. */
function scriptedPrompter(choices: readonly string[]): Prompter {
  let index = 0
  return {
    async text() {
      throw new Error('not used by chooseSkin')
    },
    async choice<T>(
      _question: string,
      options: readonly Choice<T>[],
      defaultIndex: number,
    ): Promise<T> {
      const label = choices[index] ?? choices.at(-1)
      index += 1
      const found = options.find((entry) => entry.value === label)
      return (found ?? options[defaultIndex])?.value as T
    },
    async confirm() {
      throw new Error('not used by chooseSkin')
    },
    close() {},
  }
}

function captureOutput() {
  const chunks: string[] = []
  return { out: createOutput((text) => chunks.push(text), false), text: () => chunks.join('') }
}

const BASE = { model: 'fake-model', description: 'A calm portfolio.', blueprintLabel: 'Blog' }

describe('chooseSkin', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes three real preview pages and accepts the generated skin when chosen', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['accept']),
      out,
      client: fakeClient([JSON.stringify(VALID_TOKENS)]),
      siteName: 'My Site',
      targetDir,
    })

    expect(outcome.kind).toBe('generated')
    const previewFiles = await readdir(join(targetDir, '.cogenta', 'skin-preview'))
    expect(previewFiles).toHaveLength(3)
  })

  it('regenerates when asked, and can still end in the default skin', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['regenerate', 'default']),
      out,
      client: fakeClient([JSON.stringify(VALID_TOKENS), JSON.stringify(VALID_TOKENS)]),
      siteName: 'My Site',
      targetDir,
      maxRegenerations: 3,
    })

    expect(outcome.kind).toBe('default')
    if (outcome.kind === 'default') {
      expect(outcome.reason).toContain('chosen over')
    }
  })

  it('falls back to the default, honestly reported, when generation never validates', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['accept']),
      out,
      client: fakeClient(['not json', 'still not json', 'nope']),
      siteName: 'My Site',
      targetDir,
    })

    expect(outcome.kind).toBe('default')
    if (outcome.kind === 'default') {
      expect(outcome.reason.length).toBeGreaterThan(0)
    }
    // No preview directory should exist — nothing ever passed validation.
    await expect(readdir(join(targetDir, '.cogenta', 'skin-preview'))).rejects.toThrow()
  })
})
