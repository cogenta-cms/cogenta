import type { Rgb, Rgba } from './color.js'
import { aaThreshold, compositeOver, contrastRatio, meetsContrastAa, parseColor } from './color.js'
import type { ContrastFailure } from './errors.js'
import {
  insufficientContrast,
  invalidTokens,
  missingTokens,
  motionNotReduced,
  nonMonotonicScale,
  unknownTokens,
} from './errors.js'
import type { SkinTokens, TokenKind, TokenSpec } from './tokens.js'
import {
  CONTRAST_PAIRS,
  DENSITIES,
  TOKEN_GROUPS,
  TOKEN_SPECS,
  TYPE_SCALE_BASE_INDEX,
  TYPE_SCALE_STEPS,
} from './tokens.js'

/**
 * Skin validation, in hard-refusal mode.
 *
 * The order of the checks is the order in which a failure makes the following
 * checks meaningless: a missing token cannot be measured for contrast, and a
 * malformed colour cannot be given a luminance. Within one check, *all*
 * failures are reported at once — fixing a skin one error per run is exactly
 * the loop an agent should not be put through in L9.
 */

const LENGTH = /^-?(\d+\.?\d*|\.\d+)(px|rem|em|ch|ex|vw|vh|vmin|vmax|%|pt)$/
const DURATION = /^(\d+\.?\d*|\.\d+)(ms|s)$/
/**
 * Token values are interpolated into a stylesheet. Anything that could close a
 * declaration, open a comment, start a request or hide behind a CSS escape is
 * refused — a skin is a shareable JSON file, and it must stay data.
 */
const CSS_UNSAFE = /[;{}<>@\\]|\/\*|\*\/|url\s*\(|expression\s*\(|image-set\s*\(/i
const MAX_VALUE_LENGTH = 200

/** Colours used as a background: their alpha cannot be resolved, so it must be 1. */
const BACKGROUND_ROLES = new Set<string>(CONTRAST_PAIRS.map((pair) => pair.background))

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function path(spec: TokenSpec): string {
  return `${spec.group}.${spec.name}`
}

interface ValueCheck {
  readonly issue: string | null
}

function checkValue(spec: TokenSpec, value: unknown): ValueCheck {
  const at = path(spec)
  if (spec.kind === 'boolean') {
    return { issue: typeof value === 'boolean' ? null : `${at}: expected true or false` }
  }
  if (spec.kind === 'ratio') {
    return {
      issue:
        typeof value === 'number' && Number.isFinite(value) && value > 0
          ? null
          : `${at}: expected a finite number greater than 0`,
    }
  }
  if (typeof value !== 'string') {
    return { issue: `${at}: expected a string` }
  }
  if (value.trim() === '') {
    return { issue: `${at}: must not be empty` }
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return { issue: `${at}: must be at most ${MAX_VALUE_LENGTH} characters` }
  }
  if (CSS_UNSAFE.test(value)) {
    return { issue: `${at}: contains CSS syntax that is not allowed in a token value` }
  }
  return { issue: checkStringKind(spec.kind, at, value) }
}

function checkStringKind(kind: TokenKind, at: string, value: string): string | null {
  switch (kind) {
    case 'length':
      return LENGTH.test(value.trim()) || value.trim() === '0'
        ? null
        : `${at}: expected a CSS length with a unit, such as 0.25rem`
    case 'duration':
      return DURATION.test(value.trim())
        ? null
        : `${at}: expected a CSS duration with a unit, such as 200ms`
    case 'density':
      return DENSITIES.some((d) => d === value)
        ? null
        : `${at}: expected one of ${DENSITIES.join(', ')}`
    case 'color':
      return checkColor(at, value)
    default:
      return null
  }
}

function checkColor(at: string, value: string): string | null {
  const parsed = parseColor(value)
  if (parsed === null) {
    return `${at}: expected a hex, rgb() or hsl() colour`
  }
  const name = at.slice('color.'.length)
  if (BACKGROUND_ROLES.has(name) && parsed.a < 1) {
    return `${at}: must be fully opaque, because contrast against an unknown backdrop cannot be measured`
  }
  return null
}

interface Structure {
  readonly missing: string[]
  readonly unknown: string[]
  readonly issues: string[]
  readonly values: Map<string, unknown>
}

function readStructure(input: unknown): Structure {
  const missing: string[] = []
  const unknown: string[] = []
  const issues: string[] = []
  const values = new Map<string, unknown>()

  const root = asRecord(input)
  if (root === null) {
    return {
      missing: [],
      unknown: [],
      issues: ['(root): expected a JSON object of tokens'],
      values,
    }
  }

  for (const key of Object.keys(root)) {
    if (!TOKEN_GROUPS.some((group) => group === key)) {
      unknown.push(key)
    }
  }

  for (const group of TOKEN_GROUPS) {
    const specs = TOKEN_SPECS.filter((spec) => spec.group === group)
    const raw = asRecord(root[group])
    if (raw === null) {
      // A missing or malformed group is reported token by token: the author
      // needs the list of what to write, not the name of the container.
      for (const spec of specs) {
        missing.push(path(spec))
      }
      continue
    }
    const known = new Set(specs.map((spec) => spec.name))
    for (const key of Object.keys(raw)) {
      if (!known.has(key)) {
        unknown.push(`${group}.${key}`)
      }
    }
    for (const spec of specs) {
      const value = raw[spec.name]
      if (value === undefined || value === null) {
        missing.push(path(spec))
        continue
      }
      const { issue } = checkValue(spec, value)
      if (issue !== null) {
        issues.push(issue)
        continue
      }
      values.set(path(spec), value)
    }
  }

  return { missing, unknown, issues, values }
}

/** Numeric part of a validated CSS length. The unit is carried separately. */
function lengthValue(raw: string): { amount: number; unit: string } {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(.*)$/.exec(raw.trim())
  return { amount: Number(match?.[1] ?? '0'), unit: (match?.[2] ?? '').trim() }
}

/**
 * The typographic scale a skin actually produces. Validation runs on this
 * computed array rather than on `font.scale` alone: what must be monotone is
 * the ladder the theme renders, and checking the ladder catches a bad ratio,
 * a non-finite one, and any future change to how steps are derived.
 */
export function computeTypeScale(tokens: SkinTokens): Record<string, string> {
  const { amount, unit } = lengthValue(tokens.font.baseSize)
  const sizes: Record<string, string> = {}
  TYPE_SCALE_STEPS.forEach((step, index) => {
    const size = amount * tokens.font.scale ** (index - TYPE_SCALE_BASE_INDEX)
    sizes[step] = `${round(size)}${unit}`
  })
  return sizes
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function typeScaleSizes(tokens: SkinTokens): number[] {
  const { amount } = lengthValue(tokens.font.baseSize)
  return TYPE_SCALE_STEPS.map((_, index) =>
    round(amount * tokens.font.scale ** (index - TYPE_SCALE_BASE_INDEX)),
  )
}

function checkContrast(tokens: SkinTokens): ContrastFailure[] {
  const failures: ContrastFailure[] = []
  for (const pair of CONTRAST_PAIRS) {
    const fgValue = tokens.color[pair.foreground]
    const bgValue = tokens.color[pair.background]
    const fg = parseColor(fgValue)
    const bg = parseColor(bgValue)
    if (fg === null || bg === null) {
      continue
    }
    const ratio = contrastRatio(resolve(fg, bg), bg)
    const required = aaThreshold(pair.size)
    if (!meetsContrastAa(ratio, pair.size)) {
      failures.push({
        foreground: pair.foreground,
        background: pair.background,
        foregroundValue: fgValue,
        backgroundValue: bgValue,
        ratio,
        required,
      })
    }
  }
  return failures
}

function resolve(foreground: Rgba, background: Rgb): Rgb {
  return foreground.a >= 1 ? foreground : compositeOver(foreground, background)
}

/**
 * Validates a skin and returns it typed. Throws a `CogentaError` on the first
 * failing category, listing every failure in that category.
 */
export function validateSkin(input: unknown): SkinTokens {
  const { missing, unknown, issues, values } = readStructure(input)

  if (missing.length > 0) {
    throw missingTokens(missing)
  }
  if (unknown.length > 0) {
    throw unknownTokens(unknown)
  }
  if (issues.length > 0) {
    throw invalidTokens(issues)
  }

  // Every token is present and well-formed, so the shape is now known.
  const tokens = buildTokens(values)

  const failures = checkContrast(tokens)
  if (failures.length > 0) {
    throw insufficientContrast(failures)
  }

  const sizes = typeScaleSizes(tokens)
  const monotone = sizes.every((size, index) => index === 0 || size > (sizes[index - 1] ?? 0))
  if (!monotone) {
    throw nonMonotonicScale(sizes, tokens.font.scale)
  }

  if (!tokens.motion.reduced) {
    throw motionNotReduced()
  }

  return tokens
}

function text(values: Map<string, unknown>, at: string): string {
  const value = values.get(at)
  return typeof value === 'string' ? value : ''
}

function buildTokens(values: Map<string, unknown>): SkinTokens {
  const scale = values.get('font.scale')
  const reduced = values.get('motion.reduced')
  const density = text(values, 'space.density')
  return {
    color: {
      bg: text(values, 'color.bg'),
      fg: text(values, 'color.fg'),
      accent: text(values, 'color.accent'),
      accentFg: text(values, 'color.accentFg'),
      muted: text(values, 'color.muted'),
      mutedFg: text(values, 'color.mutedFg'),
      border: text(values, 'color.border'),
    },
    font: {
      sans: text(values, 'font.sans'),
      serif: text(values, 'font.serif'),
      mono: text(values, 'font.mono'),
      scale: typeof scale === 'number' ? scale : Number.NaN,
      baseSize: text(values, 'font.baseSize'),
    },
    space: {
      unit: text(values, 'space.unit'),
      density: DENSITIES.find((d) => d === density) ?? 'comfortable',
    },
    radius: {
      sm: text(values, 'radius.sm'),
      md: text(values, 'radius.md'),
      lg: text(values, 'radius.lg'),
    },
    motion: {
      duration: text(values, 'motion.duration'),
      easing: text(values, 'motion.easing'),
      reduced: reduced === true,
    },
    shadow: {
      sm: text(values, 'shadow.sm'),
      md: text(values, 'shadow.md'),
    },
  }
}
