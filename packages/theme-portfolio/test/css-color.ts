/**
 * A small, honest evaluator for the exact CSS colour grammar `tokens.css`
 * uses — `var()`, `light-dark()`, `color-mix(in oklab, …)` and relative
 * `oklch(from …)` — so the design system's contrast can be *computed* from the
 * real stylesheet instead of asserted from a comment.
 *
 * It is deliberately not a CSS parser. It understands the four functions this
 * theme writes and refuses anything else loudly, which is the point: a value
 * added to `tokens.css` in a form this cannot evaluate fails the test rather
 * than slipping past it unchecked.
 *
 * Shared verbatim with `@cogenta/theme-canonical`'s own `test/css-color.ts` —
 * this is test infrastructure, not part of the theme contract, so there is no
 * `@cogenta/theme-kit` home for it and no reason to invent one for a single
 * shared file used only by tests.
 */

export type Scheme = 'light' | 'dark'

/** Gamma-encoded sRGB, each channel 0..1. Alpha is carried for `transparent`. */
export interface Srgb {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
  readonly alpha: number
}

const TRANSPARENT: Srgb = { r: 0, g: 0, b: 0, alpha: 0 }

export function parseHex(value: string): Srgb {
  const digits = value.replace('#', '')
  const expanded =
    digits.length === 3
      ? [...digits].map((digit) => `${digit}${digit}`).join('')
      : digits.slice(0, 6)
  const channel = (offset: number): number =>
    Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
  return { r: channel(0), g: channel(2), b: channel(4), alpha: 1 }
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function fromLinear(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, value))
}

interface Oklab {
  readonly L: number
  readonly a: number
  readonly b: number
  readonly alpha: number
}

export function toOklab(color: Srgb): Oklab {
  const r = toLinear(color.r)
  const g = toLinear(color.g)
  const b = toLinear(color.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: color.alpha,
  }
}

export function fromOklab(color: Oklab): Srgb {
  const l = (color.L + 0.3963377774 * color.a + 0.2158037573 * color.b) ** 3
  const m = (color.L - 0.1055613458 * color.a - 0.0638541728 * color.b) ** 3
  const s = (color.L - 0.0894841775 * color.a - 1.291485548 * color.b) ** 3
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: color.alpha,
  }
}

export function toOklch(color: Srgb): Oklch {
  const lab = toOklab(color)
  const c = Math.hypot(lab.a, lab.b)
  const h = c < 1e-6 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360
  return { l: lab.L, c, h, alpha: lab.alpha }
}

export function fromOklch(color: Oklch): Srgb {
  const radians = (color.h * Math.PI) / 180
  return fromOklab({
    L: color.l,
    a: color.c * Math.cos(radians),
    b: color.c * Math.sin(radians),
    alpha: color.alpha,
  })
}

/** WCAG 2.x relative luminance, on gamma-encoded sRGB. */
export function luminance(color: Srgb): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b)
}

export function contrast(foreground: Srgb, background: Srgb): number {
  const a = luminance(foreground)
  const b = luminance(background)
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/** Splits `a, b(c, d), e` on top-level commas only. */
function splitArguments(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of input) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  parts.push(current.trim())
  return parts
}

/** The body of `name(...)`, or `null` when `input` is not that call. */
function callBody(input: string, name: string): string | null {
  if (!input.startsWith(`${name}(`) || !input.endsWith(')')) return null
  return input.slice(name.length + 1, -1)
}

function mix(a: Srgb, aWeight: number, b: Srgb, bWeight: number): Srgb {
  const total = aWeight + bWeight
  const first = aWeight / total
  const second = bWeight / total
  const left = toOklab(a)
  const right = toOklab(b)
  return fromOklab({
    L: left.L * first + right.L * second,
    a: left.a * first + right.a * second,
    b: left.b * first + right.b * second,
    alpha: left.alpha * first + right.alpha * second,
  })
}

/** `0.74`, `l`, `c`, `h`, or `calc(c * 0.85)` — the whole channel grammar used. */
function channel(expression: string, base: Oklch): number {
  const trimmed = expression.trim()
  const literal = Number.parseFloat(trimmed)
  if (!Number.isNaN(literal) && /^[0-9.]+$/.test(trimmed)) return literal
  if (trimmed === 'l') return base.l
  if (trimmed === 'c') return base.c
  if (trimmed === 'h') return base.h
  const calc = callBody(trimmed, 'calc')
  if (calc !== null) {
    const match = /^([lch])\s*\*\s*([0-9.]+)$/.exec(calc.trim())
    if (match !== null) {
      return channel(match[1] as string, base) * Number.parseFloat(match[2] as string)
    }
  }
  throw new Error(`css-color: unsupported channel expression "${expression}"`)
}

export interface EvaluateOptions {
  readonly scheme: Scheme
  /** Custom property name (with the leading dashes) to its declared value. */
  readonly variables: ReadonlyMap<string, string>
}

export function evaluate(expression: string, options: EvaluateOptions): Srgb {
  const input = expression.trim().replace(/\s+/g, ' ')

  if (input === 'transparent') return TRANSPARENT
  if (input.startsWith('#')) return parseHex(input)

  const variable = callBody(input, 'var')
  if (variable !== null) {
    const [name, ...fallback] = splitArguments(variable)
    const declared = options.variables.get(name as string)
    if (declared !== undefined) return evaluate(declared, options)
    if (fallback.length > 0) return evaluate(fallback.join(','), options)
    throw new Error(`css-color: "${name}" is referenced but never declared`)
  }

  const scheme = callBody(input, 'light-dark')
  if (scheme !== null) {
    const [light, dark] = splitArguments(scheme)
    return evaluate((options.scheme === 'dark' ? dark : light) as string, options)
  }

  const mixed = callBody(input, 'color-mix')
  if (mixed !== null) {
    const [space, first, second] = splitArguments(mixed)
    if (space !== 'in oklab') {
      throw new Error(`css-color: only "in oklab" is supported, got "${space}"`)
    }
    const parse = (part: string): { readonly color: string; readonly weight: number | null } => {
      const match = /^(.*?)\s+([0-9.]+)%$/.exec(part)
      return match === null
        ? { color: part, weight: null }
        : { color: match[1] as string, weight: Number.parseFloat(match[2] as string) }
    }
    const left = parse(first as string)
    const right = parse(second as string)
    // CSS normalises an omitted percentage to whatever the other one leaves.
    const leftWeight = left.weight ?? (right.weight === null ? 50 : 100 - right.weight)
    const rightWeight = right.weight ?? 100 - leftWeight
    return mix(
      evaluate(left.color, options),
      leftWeight,
      evaluate(right.color, options),
      rightWeight,
    )
  }

  const relative = callBody(input, 'oklch')
  if (relative !== null) {
    const match = /^from (.+)$/.exec(relative)
    if (match === null) {
      throw new Error(`css-color: only relative "oklch(from …)" is supported, got "${input}"`)
    }
    // The source colour is a `var(--…)` call; the three channels follow it.
    const rest = match[1] as string
    const closing = rest.indexOf(')')
    const source = rest.slice(0, closing + 1)
    const channels = rest.slice(closing + 1).trim()
    const base = toOklch(evaluate(source, options))
    // `calc(c * 0.7)` contains a space, so split on top-level spaces only.
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const character of channels) {
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
      if (character === ' ' && depth === 0) {
        if (current !== '') parts.push(current)
        current = ''
        continue
      }
      current += character
    }
    if (current !== '') parts.push(current)
    const [l, c, h] = parts
    return fromOklch({
      l: channel(l as string, base),
      c: channel(c as string, base),
      h: channel(h as string, base),
      alpha: base.alpha,
    })
  }

  throw new Error(`css-color: unsupported expression "${input}"`)
}
