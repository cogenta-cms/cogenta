import { CogentaError } from '@cogenta/core'
import { formatRatio } from './color.js'

/**
 * Every refusal here names what failed and by how much. "Skin invalid" is
 * useless to whoever must fix it — and in L9 the author is a model, which can
 * only correct what the message actually measures.
 */

export interface ContrastFailure {
  readonly foreground: string
  readonly background: string
  readonly foregroundValue: string
  readonly backgroundValue: string
  readonly ratio: number
  readonly required: number
}

export function missingTokens(paths: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'SKIN_TOKEN_MISSING',
    message: `Skin is missing ${paths.length} token${paths.length === 1 ? '' : 's'}: ${paths.join(', ')}`,
    hint: 'The skin token set of contract D is closed: every token must be present. Copy the missing entries from the theme default tokens.json and give them a value.',
    details: { tokens: paths },
  })
}

export function unknownTokens(paths: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'SKIN_TOKEN_UNKNOWN',
    message: `Skin declares ${paths.length} token${paths.length === 1 ? '' : 's'} that contract D does not define: ${paths.join(', ')}`,
    hint: 'A skin may only set the frozen token set. Presentation that is not a token belongs to the theme, not to the skin.',
    details: { tokens: paths },
  })
}

export function invalidTokens(issues: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'SKIN_TOKEN_INVALID',
    message: `Skin has ${issues.length} invalid token value${issues.length === 1 ? '' : 's'}:\n${issues.map((i) => `  ${i}`).join('\n')}`,
    hint: 'Colours must be hex, rgb() or hsl(); lengths and durations must carry a unit; no token value may contain CSS syntax such as ; { } or url().',
    details: { issues },
  })
}

/** Names each failing pair, its measured ratio, and the shortfall. */
export function insufficientContrast(failures: readonly ContrastFailure[]): CogentaError {
  const lines = failures.map(
    (f) =>
      `  color.${f.foreground} (${f.foregroundValue}) on color.${f.background} (${f.backgroundValue}) is ${formatRatio(f.ratio)}, needs ${f.required.toFixed(1)}:1 — short by ${(f.required - f.ratio).toFixed(2)}`,
  )
  return new CogentaError({
    code: 'SKIN_CONTRAST_INSUFFICIENT',
    message: `Skin fails WCAG 2.2 AA contrast on ${failures.length} pair${failures.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    hint: 'Darken the foreground or lighten the background until the ratio reaches the required value. Contrast is checked at registration precisely so an unreadable skin never reaches a visitor.',
    details: {
      failures: failures.map((f) => ({
        pair: `${f.foreground}/${f.background}`,
        ratio: Number(f.ratio.toFixed(4)),
        required: f.required,
      })),
    },
  })
}

export function nonMonotonicScale(sizes: readonly number[], scale: number): CogentaError {
  return new CogentaError({
    code: 'SKIN_SCALE_NOT_MONOTONIC',
    message: `Typographic scale of ratio ${scale} is not strictly increasing: computed steps are ${sizes.join(', ')}`,
    hint: 'font.scale must be greater than 1 so that each step is larger than the previous one. A ratio of 1 or below collapses the heading hierarchy.',
    details: { scale, sizes },
  })
}

export function motionNotReduced(): CogentaError {
  return new CogentaError({
    code: 'SKIN_MOTION_NOT_REDUCED',
    message: 'Skin declares motion.reduced = false.',
    hint: 'motion.reduced must be true: honouring prefers-reduced-motion is an accessibility requirement, not a skin preference. The generated stylesheet zeroes the motion duration under that media query.',
    details: { token: 'motion.reduced' },
  })
}
