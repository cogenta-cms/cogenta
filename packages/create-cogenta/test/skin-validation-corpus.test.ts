import { validateSkin } from '@cogenta/render'
import { describe, expect, it } from 'vitest'

/**
 * "Validation | Corpus de skins générés, taux de rejet mesuré." The
 * acceptance-critical property of L9 task 7 is the validation gate's
 * discriminating power, not any one LLM's output quality — this corpus
 * proves `validateSkin` (`@cogenta/render`, reused wholesale, not
 * reimplemented) correctly separates valid candidates from one deliberately
 * broken in each of its failure categories.
 */

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

const DARK_VALID_TOKENS = {
  ...VALID_TOKENS,
  color: {
    bg: '#0b0d12',
    fg: '#f4f6fb',
    accent: '#7aa2ff',
    accentFg: '#03050c',
    muted: '#161a22',
    mutedFg: '#c3c9d6',
    border: '#2a3040',
  },
}

const WARM_VALID_TOKENS = {
  ...VALID_TOKENS,
  color: {
    bg: '#fff8f0',
    fg: '#2a1a0a',
    accent: '#b5460a',
    accentFg: '#ffffff',
    muted: '#f3e4d3',
    mutedFg: '#5a3d22',
    border: '#e3c9a8',
  },
  font: { ...VALID_TOKENS.font, scale: 1.333 },
}

interface Candidate {
  readonly label: string
  readonly tokens: unknown
  readonly shouldPass: boolean
  readonly expectedCode?: string
}

const CORPUS: readonly Candidate[] = [
  { label: 'production default', tokens: VALID_TOKENS, shouldPass: true },
  { label: 'dark theme, real palette', tokens: DARK_VALID_TOKENS, shouldPass: true },
  { label: 'warm theme, larger scale', tokens: WARM_VALID_TOKENS, shouldPass: true },
  {
    label: 'missing motion group entirely',
    tokens: (() => {
      const { motion: _drop, ...rest } = VALID_TOKENS
      return rest
    })(),
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_MISSING',
  },
  {
    label: 'unknown top-level key',
    tokens: { ...VALID_TOKENS, glow: true },
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_UNKNOWN',
  },
  {
    label: 'unknown nested key',
    tokens: { ...VALID_TOKENS, color: { ...VALID_TOKENS.color, highlight: '#ff0000' } },
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_UNKNOWN',
  },
  {
    label: 'length token with no unit',
    tokens: { ...VALID_TOKENS, radius: { ...VALID_TOKENS.radius, sm: '4' } },
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_INVALID',
  },
  {
    label: 'CSS injection attempt in a token value',
    tokens: {
      ...VALID_TOKENS,
      shadow: { ...VALID_TOKENS.shadow, sm: '0 0 0 red; } body { display: none' },
    },
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_INVALID',
  },
  {
    label: 'near-invisible foreground on background',
    tokens: { ...VALID_TOKENS, color: { ...VALID_TOKENS.color, fg: '#fefefe' } },
    shouldPass: false,
    expectedCode: 'SKIN_CONTRAST_INSUFFICIENT',
  },
  {
    label: 'accent text on accent background, same colour',
    tokens: {
      ...VALID_TOKENS,
      color: { ...VALID_TOKENS.color, accentFg: VALID_TOKENS.color.accent },
    },
    shouldPass: false,
    expectedCode: 'SKIN_CONTRAST_INSUFFICIENT',
  },
  {
    label: 'type scale ratio of 1 (flat, non-monotonic)',
    tokens: { ...VALID_TOKENS, font: { ...VALID_TOKENS.font, scale: 1 } },
    shouldPass: false,
    expectedCode: 'SKIN_SCALE_NOT_MONOTONIC',
  },
  {
    label: 'type scale ratio below 1 (inverted)',
    tokens: { ...VALID_TOKENS, font: { ...VALID_TOKENS.font, scale: 0.8 } },
    shouldPass: false,
    expectedCode: 'SKIN_SCALE_NOT_MONOTONIC',
  },
  {
    label: 'motion.reduced set to false',
    tokens: { ...VALID_TOKENS, motion: { ...VALID_TOKENS.motion, reduced: false } },
    shouldPass: false,
    expectedCode: 'SKIN_MOTION_NOT_REDUCED',
  },
  {
    label: 'not a JSON object at all',
    tokens: 'a lovely calm blue theme',
    shouldPass: false,
    expectedCode: 'SKIN_TOKEN_INVALID',
  },
]

describe('validateSkin corpus (measured rejection rate)', () => {
  it('accepts every valid candidate and rejects every deliberately broken one, on the code its category predicts', () => {
    let accepted = 0
    let rejected = 0

    for (const candidate of CORPUS) {
      if (candidate.shouldPass) {
        expect(() => validateSkin(candidate.tokens), candidate.label).not.toThrow()
        accepted += 1
        continue
      }
      let caught: unknown
      try {
        validateSkin(candidate.tokens)
      } catch (error) {
        caught = error
      }
      expect(caught, `${candidate.label} should have been rejected`).toBeDefined()
      if (candidate.expectedCode !== undefined) {
        expect((caught as { code?: string }).code, candidate.label).toBe(candidate.expectedCode)
      }
      rejected += 1
    }

    const total = CORPUS.length
    const rejectionRate = rejected / total
    // The corpus is built with more broken candidates than valid ones on
    // purpose (each failure category gets its own case) — this is not a
    // claim about real model output, just proof the gate discriminates.
    expect(accepted).toBe(3)
    expect(rejected).toBe(total - 3)
    expect(rejectionRate).toBeGreaterThan(0.5)
    expect(rejectionRate).toBeLessThan(1)
  })
})
