import type { ColorRGB } from './render.js'

/**
 * A tiny, self-contained sRGB↔OKLCH conversion (Björn Ottosson's published
 * OKLab matrices — https://bottosson.github.io/posts/oklab/), used to derive
 * a handful of flat *companion tones* from a palette's `accent` (D5,
 * `docs/lots/L25-templates-pro.md`): a hue rotation in a perceptually even
 * space, so a rotated tone reads as "clearly related, clearly distinct"
 * rather than the muddy result a naive RGB hue shift gives on a saturated
 * accent. No dependency: this is arithmetic, not a colour library.
 *
 * Every function here returns a single, flat `ColorRGB` — never a gradient
 * or an interpolation across two colours. Composing *two or three* of these
 * flat outputs (in `compositions.ts`) is what D5 calls "companion tones",
 * not a smooth colour ramp.
 */

export interface Oklch {
  readonly l: number
  readonly c: number
  /** Degrees, 0–360. */
  readonly h: number
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  const clamped = value < 0 ? 0 : value
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** sRGB (0–1 per channel) → OKLCH. */
export function rgbToOklch(rgb: ColorRGB): Oklch {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bComponent = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(a * a + bComponent * bComponent)
  let h = (Math.atan2(bComponent, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

/** OKLCH → sRGB (0–1 per channel, clamped — an out-of-gamut request degrades to the nearest displayable colour rather than throwing). */
export function oklchToRgb(oklch: Oklch): ColorRGB {
  const hRad = (oklch.h * Math.PI) / 180
  const a = oklch.c * Math.cos(hRad)
  const b = oklch.c * Math.sin(hRad)

  const l_ = oklch.l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = oklch.l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = oklch.l - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return {
    r: clamp01(linearToSrgb(r)),
    g: clamp01(linearToSrgb(g)),
    b: clamp01(linearToSrgb(bLinear)),
  }
}

/** Rotates a colour's hue by `degrees` in OKLCH, keeping its lightness and chroma — the flat "same family, different colour" move. */
export function rotateHue(rgb: ColorRGB, degrees: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  const h = (((oklch.h + degrees) % 360) + 360) % 360
  return oklchToRgb({ ...oklch, h })
}

/** Returns the same hue and chroma at a different lightness (0–1). */
export function withLightness(rgb: ColorRGB, l: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  return oklchToRgb({ ...oklch, l: clamp01(l) })
}

/** Scales chroma by `factor` (0 desaturates fully to grey, 1 leaves it unchanged). */
export function withChroma(rgb: ColorRGB, factor: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  return oklchToRgb({ ...oklch, c: Math.max(oklch.c * factor, 0) })
}

/**
 * Two or three flat tones related to `rgb` by hue rotation — never a
 * gradient between them. Used to build a "colour block"/"duotone" family
 * from nothing but a palette's `accent`, so every blueprint's demo art has
 * more than one flat colour to work with without inventing a second accent.
 */
export function companionTones(rgb: ColorRGB, count: 2 | 3 = 3): readonly ColorRGB[] {
  const spread = 34
  if (count === 2) return [rotateHue(rgb, spread), rotateHue(rgb, -spread)]
  return [rotateHue(rgb, spread), rotateHue(rgb, -spread), rotateHue(rgb, 150)]
}
