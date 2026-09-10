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

  it('answers a custom-layout request with the custom layout alone', async () => {
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
    // One answer, not an answer plus alternatives nobody asked for: a live
    // run returned the real custom layout buried under three recolours of an
    // installed blog theme, and the tokens path is now a rescue only.
    const kinds = result.candidates.map((c) => c.kind)
    expect(kinds).toEqual(['sandbox'])
    expect(proposeThemeCandidates).not.toHaveBeenCalled()
    const sandboxCandidate = result.candidates.find((c) => c.kind === 'sandbox')
    expect(sandboxCandidate).toMatchObject({
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.config.mjs', 'theme.render.mjs', 'style.css'],
    })
  })

  it('does not reach for the tokens path at all once a custom layout worked', async () => {
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
      summary: 'Done.',
    })
    proposeThemeCandidates.mockResolvedValue({ ok: false, reason: 'model refused' })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.kind).toBe('sandbox')
    expect(proposeThemeCandidates).not.toHaveBeenCalled()
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
      summary: 'Matched the reference layout.',
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

  it('produces exactly one design by default, and as many as the brief asked for', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'x',
      requestedVariants: 1,
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    generateSandboxTheme.mockResolvedValue({
      ok: true,
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.render.mjs'],
      rationale: 'Done.',
      summary: 'Done.',
    })

    const single = await generateThemeCandidates(baseInput())
    expect(single.ok).toBe(true)
    if (!single.ok) return
    expect(single.candidates).toHaveLength(1)
    expect(generateSandboxTheme).toHaveBeenCalledTimes(1)

    generateSandboxTheme.mockClear()
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'x',
      requestedVariants: 3,
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })

    const several = await generateThemeCandidates(
      baseInput({ description: 'Propose-moi trois designs' }),
    )
    expect(several.ok).toBe(true)
    if (!several.ok) return
    expect(generateSandboxTheme).toHaveBeenCalledTimes(3)
    expect(several.candidates).toHaveLength(3)
  })

  it('still produces one design when the classifier omits a count entirely', async () => {
    // A loop bound read straight from an optional field is how a feature
    // ends up silently answering with nothing.
    classifyThemeLayoutNeed.mockResolvedValue({
      ok: true,
      needsCustomLayout: true,
      reason: 'x',
      processed: { documentData: [], imageParts: [], warnings: [], contributedFilenames: [] },
    })
    generateSandboxTheme.mockResolvedValue({
      ok: true,
      sandboxId: 'ai-theme-fixed',
      filesWritten: ['theme.render.mjs'],
      rationale: 'Done.',
      summary: 'Done.',
    })

    const result = await generateThemeCandidates(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(1)
  })

  it('propagates a classifier failure without calling either generation path', async () => {
    classifyThemeLayoutNeed.mockResolvedValue({ ok: false, reason: 'no theme installed' })

    const result = await generateThemeCandidates(baseInput())

    expect(result.ok).toBe(false)
    expect(generateSandboxTheme).not.toHaveBeenCalled()
    expect(proposeThemeCandidates).not.toHaveBeenCalled()
  })
})
