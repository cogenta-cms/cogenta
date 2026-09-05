import type { SkinTokens } from '@cogenta/render'
import { rgbToOklch, rotateHue, withLightness, withMinChroma } from './oklch.js'
import type { ArtLayer, ArtSpec, ColorRGB, Fill } from './render.js'
import { mulberry32 } from './render.js'

/**
 * Ready-made compositions for `demo-art` (D1, `docs/lots/L25-templates-pro.md`).
 * Each preset takes a `palette` — the same shape as `SkinTokens.color`
 * (`packages/create-cogenta/src/blueprints/starting-skins.ts`), so any
 * blueprint's starting skin is a valid palette with no translation step —
 * and returns an {@link ArtSpec} `render.ts` can turn into a PNG.
 *
 * The visual register throughout is deliberately abstract: saturated mesh
 * gradients, gradient-filled geometric accents with real shading, subtle
 * grain — the register of a modern SaaS/agency/portfolio template, never
 * "clip art" and never a fake photograph (ADR-0032's renunciation, made in
 * full).
 *
 * Two rules apply across every preset here, learned from a first pass that
 * looked like an out-of-focus photo of skin rather than a premium gradient:
 *
 * 1. **Derive extra hues in OKLCH, never by mixing toward grey.** Two
 *    saturated sRGB colours mixed together — or mixed toward white/black —
 *    desaturate as a side effect, because sRGB mixing does not preserve
 *    perceptual chroma. `oklch.ts`'s `rotateHue`/`withChroma`/`withLightness`
 *    move hue, chroma and lightness independently, so a "lighter" or
 *    "analogous" colour stays a real colour instead of drifting to mud.
 * 2. **Every hero keeps its left-hand text zone calm.** A title sits over
 *    the left half of a hero in every reference template this lot names
 *    (Astra, Kadence, Linear, Stripe…), so every hero variant below keeps
 *    its mesh points, glows and geometric accents anchored at `x ≳ 0.55` and
 *    keeps the base gradient's own contrast low across the left half —
 *    verified by `test/demo-art/compositions.test.ts`'s "text zone is calm"
 *    check, not just asserted here.
 */

export type Palette = SkinTokens['color']

// ---------------------------------------------------------------- colour helpers

function hexToRgb(hex: string): ColorRGB {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  return { r, g, b }
}

function mix(a: ColorRGB, b: ColorRGB, t: number): ColorRGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

const WHITE: ColorRGB = { r: 1, g: 1, b: 1 }
const BLACK: ColorRGB = { r: 0, g: 0, b: 0 }
const NEAR_BLACK: ColorRGB = { r: 0.05, g: 0.045, b: 0.055 }

function lighten(color: ColorRGB, amount: number): ColorRGB {
  return mix(color, WHITE, amount)
}

function darken(color: ColorRGB, amount: number): ColorRGB {
  return mix(color, BLACK, amount)
}

interface Rgb {
  readonly bg: ColorRGB
  readonly fg: ColorRGB
  readonly accent: ColorRGB
  readonly muted: ColorRGB
  readonly border: ColorRGB
}

function toRgb(palette: Palette): Rgb {
  return {
    bg: hexToRgb(palette.bg),
    fg: hexToRgb(palette.fg),
    accent: hexToRgb(palette.accent),
    muted: hexToRgb(palette.muted),
    border: hexToRgb(palette.border),
  }
}

/** OKLCH's yellow-green band — where even a chroma-floored colour reads as
 * murky "olive"/"army green"/"khaki" rather than vivid, especially at the
 * lower lightness this module's `dark` variants and glow layers often use
 * (`#427000`, the exact byte value a naive −55° rotation of this project's
 * own `store` starting skin's teal accent lands on, is a textbook example).
 * `rotateAwayFromMud` is what keeps a derived hue out of it. */
const MUDDY_HUE_MIN = 80
const MUDDY_HUE_MAX = 150

function isMuddyHue(hueDeg: number): boolean {
  return hueDeg >= MUDDY_HUE_MIN && hueDeg <= MUDDY_HUE_MAX
}

/**
 * Rotates `accentHue` by `degrees` — unless that lands in the muddy
 * yellow-green band (see {@link isMuddyHue}), in which case it rotates the
 * *other* direction by the same magnitude instead.
 *
 * A true 180° complement was tried first and rejected: for a violet or
 * blue-violet accent the antipodal hue sits in the middle of that band —
 * exactly the muddy "olive" a premium gradient must never show, no matter
 * how much chroma is floored under it. A single fixed analogous rotation
 * doesn't generalise either: −55° keeps a violet accent's derived "counter"
 * hue safely out of the band, but the *same* −55° pushes a teal/cyan accent
 * (this project's own `store` starting skin, hue ≈186°) straight into it
 * (≈131°), while +55° lands it at a clean blue-violet (≈241°) instead. Since
 * which direction is safe depends on where the source hue already sits —
 * and an AI-generated skin (L18/L19) can hand this module any hue at all —
 * this checks the actual candidate rather than committing to one sign.
 */
function rotateAwayFromMud(accentHue: number, degrees: number): number {
  const candidate = (((accentHue + degrees) % 360) + 360) % 360
  return isMuddyHue(candidate) ? -degrees : degrees
}

/**
 * Three saturated hues derived from one accent, in OKLCH — the palette
 * behind every "mesh"-style composition in this file. `bright` boosts the
 * accent itself; `analogous` rotates ~±36° for a neighbouring hue that
 * still reads as "the same family"; `counter` rotates ~∓55° the *other*
 * way for a cooler contrast — both steered away from the muddy band by
 * {@link rotateAwayFromMud} rather than fixed to one sign. Each hue also
 * has its chroma floored, so a muted starting palette (e.g. a desaturated
 * corporate blue) still produces a genuinely colourful mesh rather than
 * three shades of the same near-grey.
 */
function meshHues(accent: ColorRGB): {
  readonly bright: ColorRGB
  readonly analogous: ColorRGB
  readonly counter: ColorRGB
} {
  const accentHue = rgbToOklch(accent).h
  const analogousDeg = rotateAwayFromMud(accentHue, 36)
  const counterDeg = rotateAwayFromMud(accentHue, -55)
  const bright = withMinChroma(withLightness(accent, 0.05), 0.16)
  const analogous = withMinChroma(withLightness(rotateHue(accent, analogousDeg), 0.08), 0.14)
  const counter = withMinChroma(withLightness(rotateHue(accent, counterDeg), -0.02), 0.14)
  return { bright, analogous, counter }
}

// ---------------------------------------------------------------- hero

export type HeroVariant = 'mesh' | 'geometric' | 'diagonal' | 'radial' | 'dark' | 'warm'

const HERO_WIDTH = 1600
const HERO_HEIGHT = 1000

/**
 * A 1600×1000 hero background. `variant` lets neighbouring blueprints (e.g.
 * two SaaS-flavoured themes) look distinct from the same palette family.
 *
 * Every variant keeps its **left half calm** — low local contrast, close to
 * a flat wash of the palette's own background — so a title and subtitle sit
 * legibly over it; all the "drama" (mesh blobs, glows, shapes, rings) is
 * anchored at `x ≳ 0.55` and fades out well before the centre line.
 */
export function heroArt(palette: Palette, variant: HeroVariant = 'mesh', seed = 1): ArtSpec {
  const c = toRgb(palette)
  const hues = meshHues(c.accent)
  const rng = mulberry32(seed)

  const layers: ArtLayer[] = []

  if (variant === 'dark') {
    const deepBg = mix(NEAR_BLACK, c.accent, 0.08)
    layers.push(
      {
        kind: 'gradient',
        angle: 110,
        stops: [
          { at: 0, color: lighten(deepBg, 0.02) },
          { at: 1, color: darken(deepBg, 0.12) },
        ],
      },
      {
        kind: 'glow',
        center: [0.86, 0.22],
        radius: 0.55,
        color: hues.bright,
        alpha: 0.55,
        falloff: 1.5,
      },
      {
        kind: 'glow',
        center: [0.72, 0.78],
        radius: 0.5,
        color: hues.counter,
        alpha: 0.4,
        falloff: 1.7,
      },
      {
        kind: 'ring',
        center: [0.84, 0.24],
        innerRadius: 0.15,
        outerRadius: 0.153,
        color: lighten(hues.bright, 0.3),
        alpha: 0.5,
      },
      { kind: 'vignette', strength: 0.32, color: BLACK },
    )
  } else if (variant === 'warm') {
    const cream = mix(WHITE, withMinChroma(rotateHue(c.accent, -8), 0.05), 0.1)
    const warmBlobA = withMinChroma(withLightness(rotateHue(c.accent, -18), 0.08), 0.13)
    const warmBlobB = withMinChroma(withLightness(rotateHue(c.accent, 14), -0.02), 0.14)
    layers.push(
      {
        kind: 'gradient',
        angle: 100,
        stops: [
          { at: 0, color: lighten(cream, 0.03) },
          { at: 1, color: darken(cream, 0.03) },
        ],
        mesh: [
          { at: [0.72, 0.28], color: warmBlobA, radius: 0.4 },
          { at: [0.86, 0.74], color: warmBlobB, radius: 0.38 },
        ],
      },
      {
        kind: 'disc',
        center: [0.9, 0.16],
        radius: 0.16,
        color: lighten(warmBlobA, 0.15),
        alpha: 0.5,
      },
      { kind: 'vignette', strength: 0.1 },
    )
  } else {
    // mesh / geometric / diagonal / radial all share the same calm base: a
    // gentle, mostly-flat wash that leans toward the palette's own bg on
    // the left and only tints toward the accent on the right.
    layers.push({
      kind: 'gradient',
      angle: 0,
      stops: [
        { at: 0, color: lighten(c.bg, 0.015) },
        { at: 0.55, color: c.bg },
        { at: 1, color: mix(c.bg, hues.analogous, 0.14) },
      ],
      mesh:
        variant === 'mesh'
          ? [
              { at: [0.68, 0.22], color: hues.bright, radius: 0.32 },
              { at: [0.9, 0.62], color: hues.counter, radius: 0.34 },
              { at: [0.62, 0.86], color: hues.analogous, radius: 0.3 },
            ]
          : [
              {
                at: [0.72 + (rng() - 0.5) * 0.12, 0.5 + (rng() - 0.5) * 0.3],
                color: hues.bright,
                radius: 0.3,
              },
            ],
    })

    if (variant === 'mesh') {
      // The crisp anchor the flat mesh was missing: a thin ring gives the
      // eye a hard edge to land on amid the soft blobs.
      layers.push(
        {
          kind: 'ring',
          center: [0.78, 0.32],
          innerRadius: 0.22,
          outerRadius: 0.224,
          color: WHITE,
          alpha: 0.4,
        },
        {
          kind: 'ring',
          center: [0.78, 0.32],
          innerRadius: 0.3,
          outerRadius: 0.303,
          color: WHITE,
          alpha: 0.2,
        },
      )
    } else if (variant === 'geometric') {
      layers.push(
        {
          kind: 'glow',
          center: [0.82, 0.22],
          radius: 0.5,
          color: hues.bright,
          alpha: 0.45,
          falloff: 1.6,
        },
        {
          kind: 'ring',
          center: [0.86, 0.2],
          innerRadius: 0.16,
          outerRadius: 0.192,
          color: hues.bright,
          alpha: 0.6,
        },
        {
          kind: 'rect',
          center: [0.7, 0.78],
          width: 0.22,
          height: 0.22,
          radius: 0.03,
          rotation: 18,
          color: hues.analogous,
          fill: {
            type: 'linear',
            from: lighten(hues.analogous, 0.15),
            to: darken(hues.analogous, 0.1),
            angle: 130,
          },
          shadow: { offset: [0.012, 0.014], blur: 0.02, alpha: 0.3 },
          alpha: 0.9,
        },
        {
          kind: 'disc',
          center: [0.6, 0.68],
          radius: 0.12,
          color: hues.counter,
          fill: { type: 'radial', from: lighten(hues.counter, 0.2), to: darken(hues.counter, 0.1) },
          alpha: 0.5,
        },
        {
          kind: 'line',
          center: [0.72, 0.06],
          length: 0.5,
          thickness: 0.004,
          rotation: 0,
          color: hues.bright,
          alpha: 0.25,
        },
      )
    } else if (variant === 'diagonal') {
      layers.push(
        {
          kind: 'glow',
          center: [0.8, 0.26],
          radius: 0.55,
          color: hues.bright,
          alpha: 0.6,
          falloff: 1.4,
        },
        { kind: 'stripes', angle: 32, spacing: 0.09, thickness: 0.022, color: c.fg, alpha: 0.06 },
        { kind: 'disc', center: [0.68, 0.82], radius: 0.15, color: hues.counter, alpha: 0.32 },
      )
    } else {
      // radial
      layers.push(
        {
          kind: 'glow',
          center: [0.68, 0.42],
          radius: 0.5,
          color: hues.bright,
          alpha: 0.65,
          falloff: 1.15,
        },
        {
          kind: 'ring',
          center: [0.68, 0.42],
          innerRadius: 0.24,
          outerRadius: 0.244,
          color: hues.bright,
          alpha: 0.5,
        },
        {
          kind: 'ring',
          center: [0.68, 0.42],
          innerRadius: 0.34,
          outerRadius: 0.343,
          color: hues.bright,
          alpha: 0.28,
        },
        {
          kind: 'ring',
          center: [0.68, 0.42],
          innerRadius: 0.42,
          outerRadius: 0.423,
          color: hues.bright,
          alpha: 0.14,
        },
      )
    }

    layers.push({ kind: 'vignette', strength: 0.16 })
  }

  layers.push({ kind: 'grain', amount: 0.014 })

  return { width: HERO_WIDTH, height: HERO_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- cover art

const COVER_WIDTH = 1200
const COVER_HEIGHT = 800

const COVER_PATTERNS: readonly ((
  c: Rgb,
  hues: ReturnType<typeof meshHues>,
  rng: () => number,
) => ArtLayer[])[] = [
  // 0 — layered translucent discs, screen-blended so overlaps read as glow.
  // Always painted on a deep dark base — screen blending against a light
  // background (most starting palettes) has almost no headroom to lighten
  // toward, so the discs would wash out to near-invisible pastels; against
  // near-black they read as the intended glowing, additive overlaps.
  (c, hues, rng) => [
    {
      kind: 'gradient',
      angle: 100,
      stops: [
        { at: 0, color: mix(NEAR_BLACK, c.accent, 0.05) },
        { at: 1, color: darken(NEAR_BLACK, 0.15) },
      ],
    },
    {
      kind: 'disc',
      center: [0.32 + rng() * 0.1, 0.42],
      radius: 0.32,
      color: hues.bright,
      alpha: 0.7,
      blend: 'screen',
    },
    {
      kind: 'disc',
      center: [0.58, 0.36],
      radius: 0.28,
      color: hues.analogous,
      alpha: 0.65,
      blend: 'screen',
    },
    {
      kind: 'disc',
      center: [0.5, 0.66],
      radius: 0.3,
      color: hues.counter,
      alpha: 0.6,
      blend: 'screen',
    },
  ],
  // 1 — geometric stack, now gradient-filled with real shadows. The
  // underlay "card" is tinted *toward the foreground ink*, not toward
  // white — mixing toward white is invisible against a light palette's own
  // near-white background, which is exactly the palette family most
  // blueprints start from.
  (c) => [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: c.bg },
        { at: 1, color: darken(c.bg, 0.05) },
      ],
    },
    {
      kind: 'rect',
      center: [0.5, 0.62],
      width: 0.9,
      height: 0.55,
      radius: 0.02,
      color: mix(c.muted, c.fg, 0.1),
      alpha: 0.9,
    },
    {
      kind: 'rect',
      center: [0.32, 0.4],
      width: 0.42,
      height: 0.32,
      radius: 0.03,
      rotation: -6,
      color: c.accent,
      fill: {
        type: 'linear',
        from: lighten(c.accent, 0.18),
        to: darken(c.accent, 0.12),
        angle: 130,
      },
      shadow: { offset: [0.012, 0.016], blur: 0.02, alpha: 0.3 },
      alpha: 0.9,
    },
    {
      kind: 'rect',
      center: [0.68, 0.34],
      width: 0.3,
      height: 0.24,
      radius: 0.03,
      rotation: 8,
      color: darken(c.accent, 0.1),
      fill: {
        type: 'linear',
        from: lighten(c.accent, 0.05),
        to: darken(c.accent, 0.2),
        angle: 130,
      },
      shadow: { offset: [0.01, 0.014], blur: 0.018, alpha: 0.26 },
      alpha: 0.9,
    },
  ],
  // 2 — diagonal split: gradient half + solid half + a small accent shape
  (c) => [
    {
      kind: 'gradient',
      angle: 45,
      stops: [
        { at: 0, color: lighten(c.accent, 0.1) },
        { at: 0.5, color: c.accent },
        { at: 0.5, color: c.muted },
        { at: 1, color: c.muted },
      ],
    },
    { kind: 'stripes', angle: 45, spacing: 0.1, thickness: 0.02, color: c.bg, alpha: 0.06 },
    {
      kind: 'polygon',
      center: [0.28, 0.7],
      radius: 0.06,
      sides: 6,
      rotation: 12,
      color: darken(c.muted, 0.1),
      alpha: 0.8,
    },
  ],
  // 3 — concentric rings, offset to a corner rather than centred
  (c, hues, rng) => [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: lighten(c.bg, 0.02) },
        { at: 1, color: c.muted },
      ],
    },
    {
      kind: 'ring',
      center: [0.8, 0.2],
      innerRadius: 0.16,
      outerRadius: 0.172,
      color: hues.bright,
      alpha: 0.6,
    },
    {
      kind: 'ring',
      center: [0.8, 0.2],
      innerRadius: 0.24,
      outerRadius: 0.249,
      color: hues.bright,
      alpha: 0.35,
    },
    {
      kind: 'ring',
      center: [0.8, 0.2],
      innerRadius: 0.32,
      outerRadius: 0.326,
      color: hues.bright,
      alpha: 0.18,
    },
    {
      kind: 'disc',
      center: [0.24 + rng() * 0.1, 0.76],
      radius: 0.1,
      color: darken(c.accent, 0.1),
      alpha: 0.7,
    },
  ],
  // 4 — wave band
  (c) => [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: lighten(c.muted, 0.1) },
        { at: 1, color: c.muted },
      ],
    },
    { kind: 'wave', baseline: 0.62, amplitude: 0.07, frequency: 1.4, color: c.accent, alpha: 0.5 },
    {
      kind: 'wave',
      baseline: 0.78,
      amplitude: 0.05,
      frequency: 1.9,
      phase: 1.2,
      color: darken(c.accent, 0.15),
      alpha: 0.35,
    },
  ],
  // 5 — grid + a single glowing node
  (c, hues) => [
    {
      kind: 'gradient',
      angle: 110,
      stops: [
        { at: 0, color: c.bg },
        { at: 1, color: lighten(c.muted, 0.04) },
      ],
    },
    { kind: 'dots', spacing: 0.055, radius: 0.006, color: c.fg, alpha: 0.14 },
    {
      kind: 'glow',
      center: [0.7, 0.32],
      radius: 0.42,
      color: hues.bright,
      alpha: 0.75,
      falloff: 1.4,
    },
    {
      kind: 'disc',
      center: [0.7, 0.32],
      radius: 0.02,
      color: lighten(hues.bright, 0.3),
      alpha: 0.9,
    },
  ],
  // 6 — a big soft blob behind thin crisp lines
  (c, hues) => [
    {
      kind: 'gradient',
      angle: 100,
      stops: [
        { at: 0, color: lighten(c.muted, 0.06) },
        { at: 1, color: c.muted },
      ],
      mesh: [{ at: [0.62, 0.5], color: hues.analogous, radius: 0.5 }],
    },
    {
      kind: 'line',
      center: [0.5, 0.3],
      length: 1.3,
      thickness: 0.006,
      rotation: 8,
      color: c.fg,
      alpha: 0.15,
    },
    {
      kind: 'line',
      center: [0.5, 0.5],
      length: 1.3,
      thickness: 0.006,
      rotation: 8,
      color: c.fg,
      alpha: 0.2,
    },
    {
      kind: 'line',
      center: [0.5, 0.7],
      length: 1.3,
      thickness: 0.006,
      rotation: 8,
      color: c.fg,
      alpha: 0.15,
    },
  ],
  // 7 — editorial: a flat colour field, one thin rule, one small mark
  (c) => [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: c.accent },
        { at: 1, color: c.accent },
      ],
    },
    {
      kind: 'line',
      center: [0.5, 0.72],
      length: 0.7,
      thickness: 0.006,
      color: darken(c.accent, 0.3),
      alpha: 0.6,
    },
    { kind: 'disc', center: [0.22, 0.28], radius: 0.03, color: lighten(c.accent, 0.4), alpha: 0.9 },
  ],
  // 8 — dark: deep accent-tinted near-black with a glow
  (c, hues) => [
    {
      kind: 'gradient',
      angle: 100,
      stops: [
        { at: 0, color: mix(NEAR_BLACK, c.accent, 0.1) },
        { at: 1, color: darken(NEAR_BLACK, 0.1) },
      ],
    },
    {
      kind: 'glow',
      center: [0.62, 0.4],
      radius: 0.55,
      color: hues.bright,
      alpha: 0.6,
      falloff: 1.5,
    },
    { kind: 'vignette', strength: 0.3, color: BLACK },
  ],
]

/** A family of nine visibly different layouts from one palette, picked deterministically by `seed`. */
export function coverArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const hues = meshHues(c.accent)
  const rng = mulberry32(seed)
  const patternIndex = Math.floor(rng() * COVER_PATTERNS.length) % COVER_PATTERNS.length
  const build = COVER_PATTERNS[patternIndex] as (typeof COVER_PATTERNS)[number]
  const layers = build(c, hues, rng)
  layers.push({ kind: 'grain', amount: 0.01 })
  return { width: COVER_WIDTH, height: COVER_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- avatar

const AVATAR_SIZE = 600

/**
 * A 600×600 abstract "person" mark: a disc (head) over an arc (shoulders) —
 * never a real photo of a person. Across 8 seeds the backdrop and mark hue
 * rotate through even 45° steps in OKLCH, so a roster of demo authors reads
 * as eight distinct people rather than eight recolours of the same grey.
 */
export function avatarArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const hueStep = ((seed - 1) * 45) % 360
  const mark = withMinChroma(withLightness(rotateHue(c.accent, hueStep), 0.02), 0.14)
  const backdropA = withMinChroma(withLightness(rotateHue(c.accent, hueStep - 20), 0.28), 0.08)
  const backdropB = withMinChroma(withLightness(rotateHue(c.accent, hueStep + 25), 0.05), 0.1)

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 115,
      stops: [
        { at: 0, color: backdropA },
        { at: 1, color: backdropB },
      ],
    },
    {
      kind: 'disc',
      center: [0.5, 0.5],
      radius: 0.62,
      color: lighten(c.bg, 0.02),
      alpha: 0.85,
      fill: { type: 'radial', from: lighten(backdropA, 0.15), to: backdropB, focus: [0.5, 0.5] },
    },
    // Shoulders: the bottom half of a large disc, clipped by the frame edge.
    {
      kind: 'disc',
      center: [0.5, 1.05],
      radius: 0.5,
      color: mark,
      alpha: 1,
      fill: { type: 'linear', from: lighten(mark, 0.08), to: darken(mark, 0.1), angle: 90 },
    },
    // Head.
    {
      kind: 'disc',
      center: [0.5, 0.4],
      radius: 0.19,
      color: mark,
      alpha: 1,
      fill: {
        type: 'radial',
        from: lighten(mark, 0.18),
        to: darken(mark, 0.08),
        focus: [0.35, 0.3],
      },
    },
    { kind: 'vignette', strength: 0.2 },
    { kind: 'grain', amount: 0.015 },
  ]

  return { width: AVATAR_SIZE, height: AVATAR_SIZE, seed, layers }
}

// ---------------------------------------------------------------- logo

const LOGO_WIDTH = 400
const LOGO_HEIGHT = 160

const LOGO_MARK_COUNT = 8

function buildLogoMark(kind: number, grey: ColorRGB, rng: () => number): readonly ArtLayer[] {
  const center: readonly [number, number] = [0.16, 0.5]
  switch (kind) {
    case 0: {
      // Circle-in-square: a filled square with a white circle "cut" from its centre.
      return [
        { kind: 'rect', center, width: 0.32, height: 0.32, radius: 0.05, color: grey, alpha: 0.85 },
        { kind: 'disc', center, radius: 0.11, color: WHITE, alpha: 1 },
      ]
    }
    case 1: {
      // Three stacked bars.
      return [0, 1, 2].map((i) => ({
        kind: 'rect' as const,
        center: [center[0], center[1] - 0.14 + i * 0.14] as const,
        width: 0.3,
        height: 0.07,
        radius: 0.02,
        color: grey,
        alpha: 0.85 - i * 0.08,
      }))
    }
    case 2: {
      // A chevron: two thick diagonal strokes forming "<".
      return [
        {
          kind: 'line',
          center: [0.19, 0.38],
          length: 0.22,
          thickness: 0.045,
          rotation: 55,
          color: grey,
          alpha: 0.85,
        },
        {
          kind: 'line',
          center: [0.19, 0.62],
          length: 0.22,
          thickness: 0.045,
          rotation: -55,
          color: grey,
          alpha: 0.85,
        },
      ]
    }
    case 3: {
      return [
        { kind: 'polygon', center, radius: 0.22, sides: 6, rotation: 0, color: grey, alpha: 0.85 },
      ]
    }
    case 4: {
      // Two overlapping discs, Venn-diagram style. Plain alpha, not
      // `screen`: a logo strip sits on a near-white card, and screen
      // blending a grey disc onto white is a no-op — it stays white.
      return [
        {
          kind: 'disc',
          center: [center[0] - 0.06, center[1]],
          radius: 0.16,
          color: grey,
          alpha: 0.5,
        },
        {
          kind: 'disc',
          center: [center[0] + 0.06, center[1]],
          radius: 0.16,
          color: grey,
          alpha: 0.5,
        },
      ]
    }
    case 5: {
      // A slash: one thick diagonal stroke.
      return [
        {
          kind: 'line',
          center,
          length: 0.38,
          thickness: 0.06,
          rotation: 35,
          color: grey,
          alpha: 0.85,
        },
      ]
    }
    case 6: {
      // A dot grid: nine individual discs, bounded to the mark's own area
      // (never a canvas-tiling `dots` layer, which would spill across the
      // whole wordmark).
      const layers: ArtLayer[] = []
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          layers.push({
            kind: 'disc',
            center: [center[0] - 0.09 + col * 0.09, center[1] - 0.09 + row * 0.09],
            radius: 0.025,
            color: grey,
            alpha: 0.8,
          })
        }
      }
      return layers
    }
    default: {
      // A triangle — anti-aliased edges stand in for "rounded" corners; a
      // true rounded-corner polygon SDF is out of scope for this module.
      return [
        {
          kind: 'polygon',
          center,
          radius: 0.24,
          sides: 3,
          rotation: Math.floor(rng() * 3) * 5,
          color: grey,
          alpha: 0.85,
        },
      ]
    }
  }
}

/** A 400×160 neutral, abstract wordmark stand-in — a geometric mark plus two bars, always in neutral greys so it reads as a client logo in a logo strip, never a real brand. Eight distinct mark shapes across seeds. */
export function logoArt(seed = 1): ArtSpec {
  const rng = mulberry32(seed)
  const grey: ColorRGB = { r: 0.42, g: 0.44, b: 0.47 }
  const markKind = Math.floor(rng() * LOGO_MARK_COUNT) % LOGO_MARK_COUNT

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: WHITE },
        { at: 1, color: WHITE },
      ],
    },
    ...buildLogoMark(markKind, grey, rng),
    {
      kind: 'rect',
      center: [0.52, 0.42],
      width: 0.5,
      height: 0.14,
      radius: 0.02,
      color: grey,
      alpha: 0.55,
    },
    {
      kind: 'rect',
      center: [0.46, 0.62],
      width: 0.36,
      height: 0.1,
      radius: 0.02,
      color: grey,
      alpha: 0.35,
    },
  ]

  return { width: LOGO_WIDTH, height: LOGO_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- product

const PRODUCT_SIZE = 1000
const PRODUCT_OBJECT_COUNT = 6

/** A pill/"stadium" rect — `radius` equal to half the shorter dimension — the module's stand-in for a capsule body or a squashed contact-shadow ellipse. */
function stadium(
  center: readonly [number, number],
  width: number,
  height: number,
  color: ColorRGB,
  extra: Partial<
    Pick<Extract<ArtLayer, { kind: 'rect' }>, 'fill' | 'shadow' | 'alpha' | 'rotation'>
  > = {},
): ArtLayer {
  return {
    kind: 'rect',
    center,
    width,
    height,
    radius: height / 2,
    color,
    ...extra,
  }
}

function buildProductObject(
  shape: number,
  objectColor: ColorRGB,
  rng: () => number,
): {
  readonly object: readonly ArtLayer[]
  readonly specular: ArtLayer
  readonly contactWidth: number
} {
  const lit: Fill = {
    type: 'linear',
    from: lighten(objectColor, 0.22),
    to: darken(objectColor, 0.16),
    angle: 128,
  }
  const shadow = { offset: [0.014, 0.018] as const, blur: 0.03, alpha: 0.32 }

  switch (shape) {
    case 0: {
      // Rounded card / box.
      const object: ArtLayer = {
        kind: 'rect',
        center: [0.5, 0.5],
        width: 0.44,
        height: 0.5,
        radius: 0.07,
        rotation: -4,
        color: objectColor,
        fill: lit,
        shadow,
      }
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.36, 0.3],
        radius: 0.22,
        color: WHITE,
        alpha: 0.35,
        falloff: 1.8,
      }
      return { object: [object], specular, contactWidth: 0.4 }
    }
    case 1: {
      // Capsule / bottle: a stadium body with a narrower stadium neck.
      const body = stadium([0.5, 0.56], 0.32, 0.42, objectColor, { fill: lit, shadow })
      const neck = stadium([0.5, 0.28], 0.14, 0.16, darken(objectColor, 0.1), {
        fill: {
          type: 'linear',
          from: lighten(objectColor, 0.1),
          to: darken(objectColor, 0.2),
          angle: 90,
        },
      })
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.4, 0.4],
        radius: 0.16,
        color: WHITE,
        alpha: 0.3,
        falloff: 2,
      }
      return { object: [body, neck], specular, contactWidth: 0.3 }
    }
    case 2: {
      // Sphere with radial shading.
      const object: ArtLayer = {
        kind: 'disc',
        center: [0.5, 0.5],
        radius: 0.28,
        color: objectColor,
        fill: {
          type: 'radial',
          from: lighten(objectColor, 0.3),
          to: darken(objectColor, 0.22),
          focus: [0.32, 0.28],
        },
        shadow,
      }
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.4, 0.36],
        radius: 0.13,
        color: WHITE,
        alpha: 0.55,
        falloff: 2.2,
      }
      return { object: [object], specular, contactWidth: 0.42 }
    }
    case 3: {
      // Stacked cards, fanned slightly.
      const back: ArtLayer = {
        kind: 'rect',
        center: [0.54, 0.56],
        width: 0.4,
        height: 0.46,
        radius: 0.05,
        rotation: 10,
        color: darken(objectColor, 0.18),
        fill: {
          type: 'linear',
          from: lighten(objectColor, 0.02),
          to: darken(objectColor, 0.26),
          angle: 128,
        },
      }
      const mid: ArtLayer = {
        kind: 'rect',
        center: [0.49, 0.53],
        width: 0.4,
        height: 0.46,
        radius: 0.05,
        rotation: -3,
        color: darken(objectColor, 0.06),
        fill: {
          type: 'linear',
          from: lighten(objectColor, 0.1),
          to: darken(objectColor, 0.14),
          angle: 128,
        },
      }
      const front: ArtLayer = {
        kind: 'rect',
        center: [0.47, 0.5],
        width: 0.4,
        height: 0.46,
        radius: 0.05,
        rotation: -12,
        color: objectColor,
        fill: lit,
        shadow,
      }
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.34, 0.32],
        radius: 0.16,
        color: WHITE,
        alpha: 0.35,
        falloff: 2,
      }
      return { object: [back, mid, front], specular, contactWidth: 0.5 }
    }
    case 4: {
      // Torus / ring with shading.
      const object: ArtLayer = {
        kind: 'ring',
        center: [0.5, 0.5],
        innerRadius: 0.16,
        outerRadius: 0.3,
        color: objectColor,
        fill: {
          type: 'linear',
          from: lighten(objectColor, 0.2),
          to: darken(objectColor, 0.18),
          angle: 128,
        },
        shadow,
      }
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.38, 0.32],
        radius: 0.1,
        color: WHITE,
        alpha: 0.4,
        falloff: 2.4,
      }
      return { object: [object], specular, contactWidth: 0.44 }
    }
    default: {
      // Hexagonal tile.
      const object: ArtLayer = {
        kind: 'polygon',
        center: [0.5, 0.5],
        radius: 0.3,
        sides: 6,
        rotation: 10 + rng() * 10,
        color: objectColor,
        fill: lit,
        shadow,
      }
      const specular: ArtLayer = {
        kind: 'glow',
        center: [0.38, 0.32],
        radius: 0.14,
        color: WHITE,
        alpha: 0.32,
        falloff: 2,
      }
      return { object: [object], specular, contactWidth: 0.4 }
    }
  }
}

/**
 * A 1000×1000 centred abstract "object" on a soft backdrop, for a store's
 * demo catalogue — six object families in rotation across seeds (rounded
 * card, capsule, sphere, stacked cards, torus, hexagonal tile), each
 * gradient-shaded, drop-shadowed, and lifted by a specular highlight so it
 * reads as a stylised 3D product render rather than a flat coloured shape.
 */
export function productArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const rng = mulberry32(seed)
  const objectColor = withMinChroma(mix(c.accent, c.fg, rng() * 0.15), 0.1)
  const shape = Math.floor(rng() * PRODUCT_OBJECT_COUNT) % PRODUCT_OBJECT_COUNT
  const { object, specular, contactWidth } = buildProductObject(shape, objectColor, rng)

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: lighten(c.muted, 0.12) },
        { at: 1, color: darken(c.muted, 0.04) },
      ],
    },
    // Horizon: a thin line grounding the backdrop as a floor rather than an infinite void.
    {
      kind: 'line',
      center: [0.5, 0.78],
      length: 1,
      thickness: 0.002,
      rotation: 0,
      color: darken(c.muted, 0.18),
      alpha: 0.35,
    },
    {
      kind: 'glow',
      center: [0.5, 0.38],
      radius: 0.55,
      color: lighten(c.bg, 0.06),
      alpha: 0.45,
      falloff: 1.7,
    },
    // Contact shadow: a squashed stadium, not a disc, under the object's base.
    stadium([0.5, 0.79], contactWidth, contactWidth * 0.14, darken(c.muted, 0.16), { alpha: 0.4 }),
    ...object,
    specular,
    { kind: 'vignette', strength: 0.14 },
    { kind: 'grain', amount: 0.012 },
  ]

  return { width: PRODUCT_SIZE, height: PRODUCT_SIZE, seed, layers }
}
