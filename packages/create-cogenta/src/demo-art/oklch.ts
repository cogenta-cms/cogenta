import type { ColorRGB } from './render.js'

/**
 * A minimal sRGB↔OKLCH converter (Björn Ottosson's OKLab, in its polar
 * form) — zero dependency (R9/R10), the same "arithmetic only" discipline as
 * the rest of `demo-art`. This is what lets `compositions.ts` derive a
 * second and third hue from one palette accent by *rotating hue in a
 * perceptually uniform space* — an analogous hue, a cool counterpoint, a
 * lightness step — instead of the old trick of mixing toward grey, which is
 * what made the first `mesh` hero read as a muddy, desaturated blur: mixing
 * two saturated sRGB colours together, or toward white/black, drags the
 * *hue* toward grey as a side effect, not just the lightness or chroma.
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 */

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  if (c <= 0) return 0
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

/** A colour in OKLCH: `l` (0–1 lightness), `c` (chroma, unbounded but typically 0–0.4 for sRGB), `h` (hue, degrees 0–360). */
export interface OklchColor {
  readonly l: number
  readonly c: number
  readonly h: number
}

/** Converts an sRGB colour (each channel 0–1) to OKLCH. */
export function rgbToOklch(rgb: ColorRGB): OklchColor {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(a * a + bb * bb)
  let hue = (Math.atan2(bb, a) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { l: L, c: chroma, h: hue }
}

/** Converts an OKLCH colour back to sRGB (each channel clamped to 0–1: an out-of-gamut chroma/lightness combination is clipped, never left to overflow a PNG byte). */
export function oklchToRgb(color: OklchColor): ColorRGB {
  const hRad = (color.h * Math.PI) / 180
  const a = color.c * Math.cos(hRad)
  const b = color.c * Math.sin(hRad)

  const l = color.l + 0.3963377774 * a + 0.2158037573 * b
  const m = color.l - 0.1055613458 * a - 0.0638541728 * b
  const s = color.l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l * l * l
  const m3 = m * m * m
  const s3 = s * s * s

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bChannel = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return {
    r: clamp01(linearToSrgb(r)),
    g: clamp01(linearToSrgb(g)),
    b: clamp01(linearToSrgb(bChannel)),
  }
}

/** Rotates a colour's hue by `degrees` in OKLCH, keeping its lightness and chroma — the "analogous hue" / "complementary" move `compositions.ts` uses to derive extra mesh hues from one accent. */
export function rotateHue(rgb: ColorRGB, degrees: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  const hue = (((oklch.h + degrees) % 360) + 360) % 360
  return oklchToRgb({ ...oklch, h: hue })
}

/** Scales a colour's chroma by `factor` (0 desaturates to grey at the same lightness; >1 boosts saturation). */
export function withChroma(rgb: ColorRGB, factor: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  return oklchToRgb({ ...oklch, c: Math.max(0, oklch.c * factor) })
}

/** Nudges a colour's lightness by `delta` (−1..1), keeping hue and chroma — a lightness *step*, not a mix toward white/black, which is what keeps a "lighter" or "darker" mesh hue from drifting toward grey. */
export function withLightness(rgb: ColorRGB, delta: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  return oklchToRgb({ ...oklch, l: clamp01(oklch.l + delta) })
}

/** Sets a colour's chroma to an absolute floor (never *less* saturated than `min`) — used to guarantee a derived hue reads as a real colour, not a pastel near-grey, regardless of how muted the source accent was. */
export function withMinChroma(rgb: ColorRGB, min: number): ColorRGB {
  const oklch = rgbToOklch(rgb)
  return oklchToRgb({ ...oklch, c: Math.max(oklch.c, min) })
}
