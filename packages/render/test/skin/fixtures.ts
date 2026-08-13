import type { SkinTokens } from '../../src/skin/index.js'

/**
 * A valid skin. Every refusal test starts from this and breaks exactly one
 * thing, so a test that fails names the rule that fired.
 */
export const VALID_SKIN: SkinTokens = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f1f2f4',
    mutedFg: '#4b5057',
    border: '#d7dade',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '2px', md: '6px', lg: '12px' },
  motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 6px 20px rgba(0, 0, 0, 0.12)' },
}

/** A deep copy the caller may mutate freely. */
export function skin(): {
  color: Record<string, unknown>
  font: Record<string, unknown>
  space: Record<string, unknown>
  radius: Record<string, unknown>
  motion: Record<string, unknown>
  shadow: Record<string, unknown>
} {
  return JSON.parse(JSON.stringify(VALID_SKIN)) as ReturnType<typeof skin>
}

/**
 * Boundary colours, measured with the WCAG formula. They are the point of the
 * exercise: a validator that only refuses obviously bad colours is worthless.
 */
export const BOUNDARY = {
  /** #71796f on white — 4.5000:1, the exact AA floor for normal text. */
  exactlyAa: '#71796f',
  /** #777777 on white — 4.4781:1, just under. */
  justUnderAa: '#777777',
  /** #8e95a6 on white — 3.0001:1, the AA floor for large text only. */
  largeTextOnly: '#8e95a6',
  white: '#ffffff',
} as const
