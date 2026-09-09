import { describe, expect, it } from 'vitest'
import { textOnlyContent } from '../../src/providers/content-parts.js'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'
import { classifyThemeLayoutNeed } from '../../src/theme-creator/layout-classifier.js'
import type { ThemeCreatorTargetTheme } from '../../src/theme-creator/propose-theme.js'

const AVAILABLE_THEMES: readonly ThemeCreatorTargetTheme[] = [
  { name: '@cogenta/theme-canonical', label: 'Canonical' },
  { name: '@cogenta/theme-restaurant', label: 'Restaurant' },
]

function fakeClient(
  replies: readonly string[],
): ProviderClient & { readonly requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    maxOutputTokens: 8000,
    requestTimeoutMs: 180_000,
    maxCorrectionAttempts: 3,
    requests,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      requests.push(request)
      const reply = replies[Math.min(index, replies.length - 1)] ?? ''
      index++
      return {
        content: reply,
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

describe('classifyThemeLayoutNeed', () => {
  it('reports a custom layout is needed when the model says so, with its reason', async () => {
    const client = fakeClient([
      JSON.stringify({
        needsCustomLayout: true,
        reason: 'The reference shows a stats banner and a pill nav no installed theme renders.',
      }),
    ])
    const result = await classifyThemeLayoutNeed({
      client,
      model: 'fake-model',
      description: 'Make it look exactly like this screenshot',
      siteName: 'Acme',
      availableThemes: AVAILABLE_THEMES,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.needsCustomLayout).toBe(true)
    expect(result.reason).toContain('stats banner')
  })

  it('reports tokens are enough for a plain palette request', async () => {
    const client = fakeClient([
      JSON.stringify({ needsCustomLayout: false, reason: 'Only a colour shift was requested.' }),
    ])
    const result = await classifyThemeLayoutNeed({
      client,
      model: 'fake-model',
      description: 'Make the accent colour warmer, keep everything else',
      siteName: 'Acme',
      availableThemes: AVAILABLE_THEMES,
      baseline: { themeName: '@cogenta/theme-canonical' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.needsCustomLayout).toBe(false)
  })

  it('degrades to tokens-only when the model never returns a valid verdict, rather than failing the whole request', async () => {
    const client = fakeClient(['not json', 'still not json', 'nope'])
    const result = await classifyThemeLayoutNeed({
      client,
      model: 'fake-model',
      description: 'Something',
      siteName: 'Acme',
      availableThemes: AVAILABLE_THEMES,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.needsCustomLayout).toBe(false)
  })

  it('refuses when no theme package is installed to choose from', async () => {
    const client = fakeClient([JSON.stringify({ needsCustomLayout: false, reason: 'n/a' })])
    const result = await classifyThemeLayoutNeed({
      client,
      model: 'fake-model',
      description: 'Something',
      siteName: 'Acme',
      availableThemes: [],
    })
    expect(result.ok).toBe(false)
  })

  it('sends the request text to the model, tagged as a layout-versus-tokens decision', async () => {
    const client = fakeClient([JSON.stringify({ needsCustomLayout: true, reason: 'x' })])
    await classifyThemeLayoutNeed({
      client,
      model: 'fake-model',
      description: 'A magazine-style three-column grid with a full-bleed banner',
      siteName: 'Acme',
      availableThemes: AVAILABLE_THEMES,
    })
    const sent = textOnlyContent(client.requests.at(-1)?.messages.at(-1)?.content) ?? ''
    expect(sent).toContain('TOKENS ONLY')
    expect(sent).toContain('CUSTOM LAYOUT')
    expect(sent).toContain('magazine-style three-column grid')
  })
})
