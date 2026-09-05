import type { SkinTokens } from '@cogenta/render'
import { type ArtLayer, type ArtSpec, type ColorRGB, mulberry32 } from './render.js'

/**
 * Ready-made compositions for `demo-art` (D1, `docs/lots/L25-templates-pro.md`).
 * Each preset takes a `palette` — the same shape as `SkinTokens.color`
 * (`packages/create-cogenta/src/blueprints/starting-skins.ts`), so any
 * blueprint's starting skin is a valid palette with no translation step —
 * and returns an {@link ArtSpec} `render.ts` can turn into a PNG.
 *
 * The visual register throughout is deliberately abstract: soft mesh
 * gradients, a couple of crisp geometric accents, subtle grain — the
 * register of a modern SaaS/agency/portfolio template, never "clip art" and
 * never a fake photograph (ADR-0032's renunciation, made in full).
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

// ---------------------------------------------------------------- hero

export type HeroVariant = 'mesh' | 'geometric' | 'diagonal' | 'radial'

const HERO_WIDTH = 1600
const HERO_HEIGHT = 1000

/** A 1600×1000 hero background. `variant` lets neighbouring blueprints (e.g. two SaaS-flavoured themes) look distinct from the same palette family. */
export function heroArt(palette: Palette, variant: HeroVariant = 'mesh', seed = 1): ArtSpec {
  const c = toRgb(palette)
  const accentSoft = lighten(c.accent, 0.3)
  const accentBright = lighten(c.accent, 0.12)
  const accentDeep = darken(c.accent, 0.2)
  const shadow = mix(c.fg, c.accent, 0.35)
  const rng = mulberry32(seed)

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 120,
      // A genuinely tinted sweep, not a near-neutral wash: the light corner
      // leans toward the palette's own background, the dark corner leans
      // into the accent — this is what keeps the base plausible as "paper"
      // even where no mesh blob reaches it.
      stops: [
        { at: 0, color: lighten(c.bg, 0.02) },
        { at: 0.55, color: mix(c.bg, c.accent, 0.06) },
        { at: 1, color: mix(c.bg, accentDeep, 0.22) },
      ],
      mesh:
        variant === 'mesh'
          ? [
              { at: [0.14, 0.2], color: accentBright, radius: 0.3 },
              { at: [0.84, 0.14], color: shadow, radius: 0.32 },
              { at: [0.68, 0.82], color: accentSoft, radius: 0.36 },
              { at: [0.08, 0.88], color: accentDeep, radius: 0.26 },
            ]
          : [
              {
                at: [0.5 + (rng() - 0.5) * 0.3, 0.5 + (rng() - 0.5) * 0.3],
                color: accentBright,
                radius: 0.34,
              },
            ],
    },
    { kind: 'vignette', strength: 0.2 },
  ]

  if (variant === 'geometric') {
    layers.push(
      {
        kind: 'glow',
        center: [0.82, 0.22],
        radius: 0.55,
        color: accentSoft,
        alpha: 0.45,
        falloff: 1.6,
      },
      {
        kind: 'ring',
        center: [0.86, 0.2],
        innerRadius: 0.16,
        outerRadius: 0.192,
        color: c.accent,
        alpha: 0.55,
      },
      {
        kind: 'rect',
        center: [0.14, 0.82],
        width: 0.22,
        height: 0.22,
        radius: 0.03,
        rotation: 18,
        color: accentSoft,
        alpha: 0.65,
      },
      { kind: 'disc', center: [0.72, 0.72], radius: 0.14, color: c.accent, alpha: 0.28 },
      {
        kind: 'line',
        center: [0.5, 0.08],
        length: 0.9,
        thickness: 0.004,
        rotation: 0,
        color: c.accent,
        alpha: 0.2,
      },
    )
  } else if (variant === 'diagonal') {
    layers.push(
      {
        kind: 'glow',
        center: [0.82, 0.26],
        radius: 0.6,
        color: accentBright,
        alpha: 0.6,
        falloff: 1.4,
      },
      { kind: 'stripes', angle: 32, spacing: 0.09, thickness: 0.022, color: c.fg, alpha: 0.07 },
      { kind: 'disc', center: [0.18, 0.82], radius: 0.16, color: accentDeep, alpha: 0.35 },
    )
  } else if (variant === 'radial') {
    layers.push(
      {
        kind: 'glow',
        center: [0.5, 0.42],
        radius: 0.65,
        color: accentBright,
        alpha: 0.7,
        falloff: 1.15,
      },
      {
        kind: 'ring',
        center: [0.5, 0.42],
        innerRadius: 0.3,
        outerRadius: 0.306,
        color: c.accent,
        alpha: 0.5,
      },
      {
        kind: 'ring',
        center: [0.5, 0.42],
        innerRadius: 0.42,
        outerRadius: 0.424,
        color: c.accent,
        alpha: 0.28,
      },
      {
        kind: 'ring',
        center: [0.5, 0.42],
        innerRadius: 0.52,
        outerRadius: 0.523,
        color: c.accent,
        alpha: 0.14,
      },
    )
  } else {
    layers.push(
      {
        kind: 'glow',
        center: [0.78, 0.2],
        radius: 0.55,
        color: accentBright,
        alpha: 0.55,
        falloff: 1.5,
      },
      { kind: 'disc', center: [0.16, 0.86], radius: 0.14, color: accentDeep, alpha: 0.3 },
    )
  }

  layers.push({ kind: 'grain', amount: 0.014 })

  return { width: HERO_WIDTH, height: HERO_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- cover art

const COVER_WIDTH = 1200
const COVER_HEIGHT = 800

const COVER_PATTERNS: readonly ((c: Rgb, rng: () => number) => ArtLayer[])[] = [
  // 0 — big soft blobs
  (c, rng) => [
    {
      kind: 'gradient',
      angle: 100,
      stops: [
        { at: 0, color: lighten(c.muted, 0.08) },
        { at: 1, color: c.muted },
      ],
      mesh: [
        { at: [0.25 + rng() * 0.15, 0.35], color: lighten(c.accent, 0.2), radius: 0.55 },
        { at: [0.75, 0.7], color: mix(c.accent, c.muted, 0.4), radius: 0.5 },
      ],
    },
    { kind: 'vignette', strength: 0.14 },
  ],
  // 1 — geometric stack
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
      color: lighten(c.muted, 0.05),
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
      alpha: 0.85,
    },
    {
      kind: 'rect',
      center: [0.68, 0.34],
      width: 0.3,
      height: 0.24,
      radius: 0.03,
      rotation: 8,
      color: darken(c.accent, 0.1),
      alpha: 0.75,
    },
  ],
  // 2 — diagonal split
  (c) => [
    {
      kind: 'gradient',
      angle: 45,
      stops: [
        { at: 0, color: c.accent },
        { at: 0.5, color: c.accent },
        { at: 0.5, color: c.muted },
        { at: 1, color: c.muted },
      ],
    },
    { kind: 'stripes', angle: 45, spacing: 0.1, thickness: 0.02, color: c.bg, alpha: 0.06 },
  ],
  // 3 — ring cluster
  (c, rng) => [
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
      center: [0.62, 0.42],
      innerRadius: 0.22,
      outerRadius: 0.235,
      color: c.accent,
      alpha: 0.55,
    },
    {
      kind: 'ring',
      center: [0.62, 0.42],
      innerRadius: 0.3,
      outerRadius: 0.312,
      color: c.accent,
      alpha: 0.3,
    },
    {
      kind: 'disc',
      center: [0.28 + rng() * 0.1, 0.72],
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
  // 5 — dot field
  (c) => [
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
      center: [0.72, 0.3],
      radius: 0.5,
      color: lighten(c.accent, 0.15),
      alpha: 0.4,
      falloff: 1.8,
    },
  ],
]

/** A family of ≥6 visibly different covers from one palette, picked deterministically by `seed`. */
export function coverArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const rng = mulberry32(seed)
  const patternIndex = Math.floor(rng() * COVER_PATTERNS.length) % COVER_PATTERNS.length
  const build = COVER_PATTERNS[patternIndex] as (typeof COVER_PATTERNS)[number]
  const layers = build(c, rng)
  layers.push({ kind: 'grain', amount: 0.01 })
  return { width: COVER_WIDTH, height: COVER_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- avatar

const AVATAR_SIZE = 600

/** A 600×600 abstract "person" mark: a disc (head) over an arc (shoulders) — never a real photo of a person. */
export function avatarArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const rng = mulberry32(seed)
  const hue = mix(c.accent, c.fg, 0.15 + rng() * 0.1)

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 115,
      stops: [
        { at: 0, color: lighten(c.muted, 0.06) },
        { at: 1, color: c.muted },
      ],
    },
    { kind: 'disc', center: [0.5, 0.5], radius: 0.62, color: lighten(c.bg, 0.02), alpha: 0.9 },
    // Shoulders: the bottom half of a large disc, clipped by the frame edge.
    { kind: 'disc', center: [0.5, 1.05], radius: 0.5, color: hue, alpha: 1 },
    // Head.
    { kind: 'disc', center: [0.5, 0.4], radius: 0.19, color: hue, alpha: 1 },
    { kind: 'vignette', strength: 0.2 },
    { kind: 'grain', amount: 0.015 },
  ]

  return { width: AVATAR_SIZE, height: AVATAR_SIZE, seed, layers }
}

// ---------------------------------------------------------------- logo

const LOGO_WIDTH = 400
const LOGO_HEIGHT = 160

/** A 400×160 neutral, abstract wordmark stand-in — a geometric mark plus two or three bars, always in neutral greys so it reads as a client logo in a logo strip, never a real brand. */
export function logoArt(seed = 1): ArtSpec {
  const rng = mulberry32(seed)
  const grey: ColorRGB = { r: 0.42, g: 0.44, b: 0.47 }
  const markKind = Math.floor(rng() * 3)

  const mark: ArtLayer =
    markKind === 0
      ? {
          kind: 'polygon',
          center: [0.16, 0.5],
          radius: 0.24,
          sides: 3,
          rotation: 0,
          color: grey,
          alpha: 0.85,
        }
      : markKind === 1
        ? {
            kind: 'ring',
            center: [0.16, 0.5],
            innerRadius: 0.16,
            outerRadius: 0.24,
            color: grey,
            alpha: 0.85,
          }
        : {
            kind: 'rect',
            center: [0.16, 0.5],
            width: 0.32,
            height: 0.32,
            radius: 0.06,
            rotation: 8,
            color: grey,
            alpha: 0.85,
          }

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: WHITE },
        { at: 1, color: WHITE },
      ],
    },
    mark,
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

/** A 1000×1000 centred abstract "object" on a soft backdrop, for a store's demo catalogue. */
export function productArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const rng = mulberry32(seed)
  const objectColor = mix(c.accent, c.fg, rng() * 0.2)
  const shape = Math.floor(rng() * 3)

  const object: ArtLayer =
    shape === 0
      ? {
          kind: 'rect',
          center: [0.5, 0.52],
          width: 0.42,
          height: 0.5,
          radius: 0.06,
          rotation: -4,
          color: objectColor,
          alpha: 1,
        }
      : shape === 1
        ? {
            kind: 'polygon',
            center: [0.5, 0.52],
            radius: 0.3,
            sides: 6,
            rotation: 10,
            color: objectColor,
            alpha: 1,
          }
        : { kind: 'disc', center: [0.5, 0.52], radius: 0.28, color: objectColor, alpha: 1 }

  const layers: ArtLayer[] = [
    {
      kind: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: lighten(c.muted, 0.1) },
        { at: 1, color: c.muted },
      ],
    },
    { kind: 'disc', center: [0.5, 0.86], radius: 0.36, color: darken(c.muted, 0.06), alpha: 0.4 },
    {
      kind: 'glow',
      center: [0.5, 0.4],
      radius: 0.6,
      color: lighten(c.bg, 0.05),
      alpha: 0.5,
      falloff: 1.6,
    },
    object,
    {
      kind: 'rect',
      center: [0.5, 0.52],
      width: 0.16,
      height: 0.16,
      radius: 0.02,
      rotation: shape === 1 ? 10 : 0,
      color: lighten(objectColor, 0.35),
      alpha: 0.4,
    },
    { kind: 'vignette', strength: 0.16 },
    { kind: 'grain', amount: 0.012 },
  ]

  return { width: PRODUCT_SIZE, height: PRODUCT_SIZE, seed, layers }
}
