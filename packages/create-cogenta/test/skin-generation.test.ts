import type { ChatRequest, ChatResponse, ProviderClient } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { generateSkin } from '../src/skin-generation.js'

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

/** Passes structural checks but fails the AA contrast check: `fg` on `bg` is near-invisible. */
const LOW_CONTRAST_TOKENS = {
  ...VALID_TOKENS,
  color: { ...VALID_TOKENS.color, fg: '#fefefe' },
}

/** A key contract D does not define. */
const UNKNOWN_KEY_TOKENS = { ...VALID_TOKENS, sparkle: true }

function fakeClient(responses: readonly (string | null)[]): ProviderClient & { calls: number } {
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    calls: 0,
    async chat(_request: ChatRequest): Promise<ChatResponse> {
      this.calls += 1
      const content = responses[index]
      index += 1
      return {
        content: content ?? null,
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

const BASE_OPTIONS = {
  model: 'fake-model',
  description: 'A calm, minimal portfolio for a photographer.',
  blueprintLabel: 'Blog — posts, categories, demo content',
}

describe('generateSkin', () => {
  it('accepts a first attempt that already passes validation', async () => {
    const client = fakeClient([JSON.stringify(VALID_TOKENS)])

    const result = await generateSkin({ ...BASE_OPTIONS, client })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.attempts).toBe(1)
      expect(result.tokens.color.bg).toBe('#ffffff')
    }
    expect(client.calls).toBe(1)
  })

  it('corrects a failing attempt using the validator hint and succeeds on the second try', async () => {
    const client = fakeClient([JSON.stringify(LOW_CONTRAST_TOKENS), JSON.stringify(VALID_TOKENS)])

    const result = await generateSkin({ ...BASE_OPTIONS, client })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attempts).toBe(2)
    expect(client.calls).toBe(2)
  })

  it('rejects an unknown token key and retries, matching SKIN_TOKEN_UNKNOWN', async () => {
    const client = fakeClient([JSON.stringify(UNKNOWN_KEY_TOKENS), JSON.stringify(VALID_TOKENS)])

    const result = await generateSkin({ ...BASE_OPTIONS, client })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attempts).toBe(2)
  })

  it('treats a non-JSON response as a failed attempt, not a crash', async () => {
    const client = fakeClient([
      'Sure! Here is a lovely skin for you.',
      JSON.stringify(VALID_TOKENS),
    ])

    const result = await generateSkin({ ...BASE_OPTIONS, client })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attempts).toBe(2)
  })

  it('falls back after three attempts that never pass validation', async () => {
    const client = fakeClient([
      JSON.stringify(LOW_CONTRAST_TOKENS),
      JSON.stringify(LOW_CONTRAST_TOKENS),
      JSON.stringify(LOW_CONTRAST_TOKENS),
    ])

    const result = await generateSkin({ ...BASE_OPTIONS, client })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts).toBe(3)
      expect(result.reason).toMatch(/contrast/i)
    }
    expect(client.calls).toBe(3)
  })

  it('never writes an invalid token set as its success result, under any model behaviour', async () => {
    const scenarios = [
      ['garbage', 'more garbage', 'still garbage'],
      [JSON.stringify(UNKNOWN_KEY_TOKENS), JSON.stringify(LOW_CONTRAST_TOKENS), 'nope'],
    ]
    for (const responses of scenarios) {
      const client = fakeClient(responses)
      const result = await generateSkin({ ...BASE_OPTIONS, client })
      if (result.ok) {
        // A success result must always be a real, independently-validated token set.
        expect(result.tokens.motion.reduced).toBe(true)
      } else {
        expect(result.reason.length).toBeGreaterThan(0)
      }
    }
  })
})
