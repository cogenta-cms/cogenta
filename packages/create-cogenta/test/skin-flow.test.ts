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

/** One valid, distinct skin per design direction — a real choice, not the same one three times. */
const ACCENT_BY_DIRECTION: Readonly<Record<string, string>> = {
  'Warm and editorial': '#b45309',
  'Clean and clinical': '#1d4ed8',
  'Bold and graphic': '#7c2d12',
  'Quiet and minimal': '#4c1d95',
  'Classic and formal': '#047857',
}

function tokensFor(accent: string): string {
  return JSON.stringify({ ...VALID_TOKENS, color: { ...VALID_TOKENS.color, accent } })
}

/**
 * Answers by reading which design direction the prompt asked for, not by
 * counting calls: the candidates are generated in parallel, so a counter
 * would make these tests depend on scheduling order.
 */
function perDirectionClient(): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-model',
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const prompt = request.messages[0]?.content ?? ''
      const label =
        Object.keys(ACCENT_BY_DIRECTION).find((name) => prompt.includes(name)) ??
        'Warm and editorial'
      return {
        content: tokensFor(ACCENT_BY_DIRECTION[label] ?? '#1d4ed8'),
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

function constantClient(content: string): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-model',
    async chat(): Promise<ChatResponse> {
      return {
        content,
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

/** Picks by the label shown to a human, one scripted answer per question. */
function scriptedPrompter(labels: readonly string[]): Prompter {
  let index = 0
  return {
    async text() {
      throw new Error('not used by chooseSkin')
    },
    async secret() {
      throw new Error('not used by chooseSkin')
    },
    async choice<T>(
      _question: string,
      options: readonly Choice<T>[],
      defaultIndex: number,
    ): Promise<T> {
      const wanted = labels[index] ?? labels.at(-1)
      index += 1
      const found = options.find((entry) => entry.label === wanted)
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

  it('offers several designs to pick from, never a single take-it-or-leave-it', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()
    const offered: string[] = []

    const outcome = await chooseSkin({
      ...BASE,
      prompter: {
        async text() {
          throw new Error('unused')
        },
        async secret() {
          throw new Error('unused')
        },
        async choice<T>(_q: string, options: readonly Choice<T>[]): Promise<T> {
          offered.push(...options.map((option) => option.label))
          return options[1]?.value as T
        },
        async confirm() {
          throw new Error('unused')
        },
        close() {},
      },
      out,
      client: perDirectionClient(),
      siteName: 'My Site',
      targetDir,
      candidateCount: 3,
    })

    expect(outcome.kind).toBe('generated')
    if (outcome.kind !== 'generated') return
    expect(outcome.offered).toBe(3)
    expect(outcome.candidateLabel).toBe('Clean and clinical')
    // Three designs plus the two ways out — and no "accept" of a single one.
    expect(offered).toHaveLength(5)
    expect(offered.slice(0, 3)).toEqual([
      'Warm editorial',
      'Clean and clinical',
      'Bold and graphic',
    ])
  })

  it('writes three real preview pages per proposed design, in its own directory', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['Warm editorial']),
      out,
      client: perDirectionClient(),
      siteName: 'My Site',
      targetDir,
      candidateCount: 2,
    })

    const root = join(targetDir, '.cogenta', 'skin-preview')
    expect((await readdir(root)).sort()).toEqual(['clinical', 'editorial'])
    expect(await readdir(join(root, 'editorial'))).toHaveLength(3)
    expect(await readdir(join(root, 'clinical'))).toHaveLength(3)
  })

  it('regenerates when none of the proposals fit, and can still end in the default skin', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter([
        'None of these — propose new ones',
        'None of these — use the default skin',
      ]),
      out,
      client: perDirectionClient(),
      siteName: 'My Site',
      targetDir,
      maxRegenerations: 3,
    })

    expect(outcome.kind).toBe('default')
    if (outcome.kind !== 'default') return
    expect(outcome.reason).toContain('chosen over')
  })

  it('falls back to the default, honestly reported, when nothing ever validates', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out, text } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['Warm editorial']),
      out,
      client: constantClient('not json'),
      siteName: 'My Site',
      targetDir,
    })

    expect(outcome.kind).toBe('default')
    if (outcome.kind !== 'default') return
    expect(outcome.reason).toContain('no usable choice of designs')
    expect(text()).toContain('was not offered')
    // No preview directory should exist — nothing ever passed validation.
    await expect(readdir(join(targetDir, '.cogenta', 'skin-preview'))).rejects.toThrow()
  })

  it('refuses to present a choice of one when the model returns the same design every time', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-skin-flow-'))
    dirs.push(targetDir)
    const { out, text } = captureOutput()

    const outcome = await chooseSkin({
      ...BASE,
      prompter: scriptedPrompter(['Warm editorial']),
      out,
      client: constantClient(JSON.stringify(VALID_TOKENS)),
      siteName: 'My Site',
      targetDir,
      maxRegenerations: 1,
    })

    expect(outcome.kind).toBe('default')
    expect(text()).toContain('identical')
  })
})
