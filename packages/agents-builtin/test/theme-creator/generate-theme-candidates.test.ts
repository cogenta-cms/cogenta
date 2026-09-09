import type { ProviderClient } from '@cogenta/agents'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const classifyThemeLayoutNeed = vi.fn()
const proposeThemeCandidates = vi.fn()
const generateSandboxTheme = vi.fn()

vi.mock('@cogenta/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cogenta/agents')>()
  return { ...actual, classifyThemeLayoutNeed, proposeThemeCandidates }
})
vi.mock('../../src/theme-creator/generate-sandbox-theme.js', () => ({ generateSandboxTheme }))

const { generateThemeCandidates } = await import(
  '../../src/theme-creator/generate-theme-candidates.js'
)

const CLIENT = {} as ProviderClient
const AVAILABLE_THEMES = [{ name: '@cogenta/theme-canonical', label: 'Canonical' }]

function baseInput(overrides: Partial<Parameters<typeof generateThemeCandidates>[0]> = {}) {
  return {
    client: CLIENT,
    model: 'fake-model',
    description: 'A magazine layout',
    siteName: 'Acme',
    availableThemes: AVAILABLE_THEMES,
    mintSandboxId: () => 'ai-theme-fixed',
    writeFile: async (input: { readonly path: string }) => ({ path: input.path }),
    deleteFile: async () => undefined,
    ...overrides,
  }
}

describe('generateThemeCandidates', () => {
  beforeEach(() => {
    classifyThemeLayoutNeed.mockReset()
    proposeThemeCandidates.mockReset()
    generateSandboxTheme.mockReset()
  })

  it('never mints a sandbox or calls the writer when tokens are enough', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: false,
      reason: 'colour only',
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    proposeThemeCandidates.mockResolvedValue({
      ok: true,
      candidates: [
        {
          id: 'a',
          label: 'Warm',
          rationale: 'r',
          tokens: {},
          themeName: '@cogenta/theme-canonical',
        },
      ],
      warnings: [],
    })
    const mintSandboxId = vi.fn(() => 'should-not-be-called')

    const result = await generateThemeCandidates(baseInput({ mintSandboxId }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.kind).toBe('tokens')
    expect(generateSandboxTheme).not.toHaveBeenCalled()
    expect(mintSandboxId).not.toHaveBeenCalled()
  })

  it('generates a sandbox candidate plus a tokens fallback when a custom layout is needed', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'different hero and nav structure',
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    generateSandboxTheme.mockResolvedValue({
      ok: true,
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.config.mjs', 'theme.render.mjs', 'style.css'],
      rationale: 'A custom magazine layout.',
    })
    proposeThemeCandidates.mockResolvedValue({
      ok: true,
      candidates: [
        {
          id: 'a',
          label: 'Warm',
          rationale: 'r',
          tokens: {},
          themeName: '@cogenta/theme-canonical',
        },
      ],
      warnings: [],
    })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layoutDecision).toEqual({
      needsCustomLayout: true,
      reason: 'different hero and nav structure',
    })
    const kinds = result.candidates.map((c) => c.kind)
    expect(kinds).toContain('sandbox')
    expect(kinds).toContain('tokens')
    const sandboxCandidate = result.candidates.find((c) => c.kind === 'sandbox')
    expect(sandboxCandidate).toMatchObject({
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.config.mjs', 'theme.render.mjs', 'style.css'],
    })
  })

  it('still returns the sandbox candidate when the tokens fallback fails', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'x',
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    generateSandboxTheme.mockResolvedValue({
      ok: true,
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.config.mjs'],
      rationale: 'Done.',
    })
    proposeThemeCandidates.mockResolvedValue({ ok: false, reason: 'model refused' })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.kind).toBe('sandbox')
    expect(result.warnings.some((w) => w.includes('model refused'))).toBe(true)
  })

  it('fails only when neither path produced anything', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'x',
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    generateSandboxTheme.mockResolvedValue({ ok: false, reason: 'wrote nothing' })
    proposeThemeCandidates.mockResolvedValue({ ok: false, reason: 'model refused' })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(false)
  })

  it('forces the custom-layout path when a reference image is attached, even if the classifier says tokens are enough', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: false,
      reason: 'An installed theme already has a hero/stats/about section.',
      processed: {
        documentData: [],
        imageParts: [{ type: 'image', mediaType: 'image/png', data: 'ZmFrZQ==' }],
        warnings: [],
        contributedFilenames: [],
      },
    })
    generateSandboxTheme.mockResolvedValue({
      ok: true,
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.config.mjs', 'theme.render.mjs', 'style.css'],
      rationale: 'Matched the reference layout.',
    })
    proposeThemeCandidates.mockResolvedValue({ ok: true, candidates: [], warnings: [] })

    const result = await generateThemeCandidates(
      baseInput({
        attachments: [{ filename: 'ref.png', mimeType: 'image/png', data: new Uint8Array() }],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layoutDecision.needsCustomLayout).toBe(true)
    expect(generateSandboxTheme).toHaveBeenCalledTimes(1)
    expect(result.candidates.some((c) => c.kind === 'sandbox')).toBe(true)
  })

  it('propagates a classifier failure without calling either generation path', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({ ok: false, reason: 'no theme installed' })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(false)
    expect(generateSandboxTheme).not.toHaveBeenCalled()
    expect(proposeThemeCandidates).not.toHaveBeenCalled()
  })
})
