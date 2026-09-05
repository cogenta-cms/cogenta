import type { SkinTokens } from '@cogenta/render'
import { companionTones, oklchToRgb, rgbToOklch, withChroma, withLightness } from './oklch.js'
import { type ArtLayer, type ArtSpec, type ColorRGB, mulberry32, type Vec2 } from './render.js'

/**
 * Ready-made compositions for `demo-art` (D1/D5, `docs/lots/L25-templates-pro.md`).
 * Each preset takes a `palette` — the same shape as `SkinTokens.color`
 * (`packages/create-cogenta/src/blueprints/starting-skins.ts`), so any
 * blueprint's starting skin is a valid palette with no translation step —
 * and returns an {@link ArtSpec} `render.ts` can turn into a PNG.
 *
 * D5 (2026-09-05, binding): **zero gradients, zero glow, zero blur.** Every
 * composition below is built only from flat, opaque shapes — solid colour
 * fields, crisp geometric marks, dot/line grids, hard-edged bands, a
 * checkerboard, and hard-edged organic blobs — the register of Swiss/
 * editorial flat design (Basecamp, Notion, Stripe's docs illustrations,
 * Apple's marketing graphics), never a "mesh gradient" landing-page look.
 * `render.ts`'s `gradient`/`glow`/`vignette` layer kinds stay defined and
 * tested there (a capability, not a ban) — nothing in this file ever emits
 * one; `test/demo-art/flat-design.test.ts` holds that line.
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
  readonly accentFg: ColorRGB
  readonly muted: ColorRGB
  readonly mutedFg: ColorRGB
  readonly border: ColorRGB
}

function toRgb(palette: Palette): Rgb {
  return {
    bg: hexToRgb(palette.bg),
    fg: hexToRgb(palette.fg),
    accent: hexToRgb(palette.accent),
    accentFg: hexToRgb(palette.accentFg),
    muted: hexToRgb(palette.muted),
    mutedFg: hexToRgb(palette.mutedFg),
    border: hexToRgb(palette.border),
  }
}

/**
 * 2–3 flat "companion tones" derived from a palette's own colours (D5) —
 * never a gradient between them, just discrete, related flat colours a
 * composition can pick from so it isn't limited to `accent` alone.
 */
interface Tones {
  /** `accent` rotated ~34° in OKLCH — a related but clearly distinct flat tone. */
  readonly hue1: ColorRGB
  /** `accent` rotated ~34° the other way. */
  readonly hue2: ColorRGB
  /** A darker `accent`, for a shadow or a deep panel. */
  readonly deep: ColorRGB
  /** A very light neutral, close to `muted` — a calm flat field. */
  readonly pale: ColorRGB
  /** A pale, warm-shifted tone — the base for the "arch & sun" family. */
  readonly warm: ColorRGB
  /** A dark, tinted "ink" — the base for the "editorial mark on dark" family. Not literal black: it keeps a trace of the accent's hue. */
  readonly ink: ColorRGB
}

/**
 * Pulls a hue (degrees) into the amber/terracotta arc used for "warm"
 * compositions, leaving it alone if it's already there. A small rotation of
 * the accent's *own* hue (as `rotateHue` alone would do) keeps a cool accent
 * — a store's teal, say — cool; the "arch & sun"/"warm" family needs its
 * backdrop to read as warm regardless of the palette it was built from, so
 * this clamps to the nearer edge of the warm arc instead of rotating by a
 * fixed offset.
 */
function clampHueToWarmArc(hueDegrees: number): number {
  const warmLow = 25
  const warmHigh = 70
  if (hueDegrees >= warmLow && hueDegrees <= warmHigh) return hueDegrees
  const circularDistance = (a: number, b: number) =>
    Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  return circularDistance(hueDegrees, warmLow) <= circularDistance(hueDegrees, warmHigh)
    ? warmLow
    : warmHigh
}

function buildTones(c: Rgb): Tones {
  const spread = companionTones(c.accent, 2)
  const hue1 = spread[0] ?? c.accent
  const hue2 = spread[1] ?? c.accent
  const accentOklch = rgbToOklch(c.accent)
  const warmHue = clampHueToWarmArc(accentOklch.h)
  return {
    hue1,
    hue2,
    deep: darken(c.accent, 0.22),
    pale: lighten(c.muted, 0.06),
    warm: oklchToRgb({ l: 0.86, c: Math.max(accentOklch.c, 0.08), h: warmHue }),
    ink: withLightness(withChroma(c.accent, 0.4), 0.15),
  }
}

/**
 * A straight, hairline-thin flat segment between two fractional points —
 * used for grid connectors, editorial rules, and floor lines. `render.ts`
 * only offers a length+rotation `LineLayer`, so this does the point-to-point
 * trigonometry once, in one place, for every composition below.
 */
function segment(
  from: Vec2,
  to: Vec2,
  canvasWidth: number,
  canvasHeight: number,
  thickness: number,
  color: ColorRGB,
  alpha = 1,
): ArtLayer {
  const shorter = Math.min(canvasWidth, canvasHeight)
  const x1 = from[0] * canvasWidth
  const y1 = from[1] * canvasHeight
  const x2 = to[0] * canvasWidth
  const y2 = to[1] * canvasHeight
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthPx = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const center: Vec2 = [(x1 + x2) / 2 / canvasWidth, (y1 + y2) / 2 / canvasHeight]
  return {
    kind: 'line',
    center,
    length: lengthPx / shorter,
    thickness,
    rotation,
    color,
    alpha,
  }
}

// ---------------------------------------------------------------- hero

/**
 * `mesh`/`geometric`/`diagonal`/`radial`/`dark`/`warm` are the names every
 * existing caller compiles against; `grid`/`blocks`/`bands`/`rings`/`ink`/
 * `sun` are the same six families under names that describe what they
 * actually render now that D5 removed the gradients the old names referred
 * to. Both spellings of a given family always render identically.
 */
export type HeroVariant =
  | 'mesh'
  | 'geometric'
  | 'diagonal'
  | 'radial'
  | 'dark'
  | 'warm'
  | 'grid'
  | 'blocks'
  | 'bands'
  | 'rings'
  | 'ink'
  | 'sun'

type HeroFamily = 'grid' | 'blocks' | 'bands' | 'rings' | 'ink' | 'sun'

const HERO_FAMILY: Readonly<Record<HeroVariant, HeroFamily>> = {
  mesh: 'grid',
  grid: 'grid',
  geometric: 'blocks',
  blocks: 'blocks',
  diagonal: 'bands',
  bands: 'bands',
  radial: 'rings',
  rings: 'rings',
  dark: 'ink',
  ink: 'ink',
  warm: 'sun',
  sun: 'sun',
}

const HERO_WIDTH = 1600
const HERO_HEIGHT = 1000

/**
 * A 1600×1000 hero visual. Every theme frames the hero's media beside the
 * title — a picture next to the text, never a backdrop under it — so the
 * composition fills the whole canvas like a poster: an early version kept
 * the left half a single flat colour "for the title" and rendered as a
 * mostly blank frame on every home page. `variant` names one of the flat
 * poster families (the same builders `coverArt` picks from, at hero size);
 * the older names (`mesh`, `geometric`, `diagonal`, `radial`, `dark`, `warm`)
 * stay as aliases so no blueprint needs to change.
 */
export function heroArt(palette: Palette, variant: HeroVariant = 'mesh', seed = 1): ArtSpec {
  const c = toRgb(palette)
  const tones = buildTones(c)
  const rng = mulberry32(seed)
  const family = HERO_FAMILY[variant]

  let layers: ArtLayer[]
  switch (family) {
    case 'grid':
      layers = gridNodeCover(c, tones, rng)
      break
    case 'blocks':
      layers = colourBlockCover(c, tones, rng)
      break
    case 'bands':
      layers = stripeBandCover(c, tones, rng)
      break
    case 'rings':
      layers = concentricCover(c, tones, rng)
      break
    case 'ink':
      layers = editorialMarkCover(c, tones, rng)
      break
    default:
      layers = archSunCover(c, tones, rng)
  }

  return { width: HERO_WIDTH, height: HERO_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- cover art

const COVER_WIDTH = 1200
const COVER_HEIGHT = 800

function colourBlockCover(c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const angle = rng() < 0.5 ? 0 : 90
  const threeTone = rng() < 0.5
  const colors = threeTone ? [tones.pale, c.accent, tones.hue2] : [tones.pale, c.accent]
  const accentCenter: Vec2 = [0.24 + rng() * 0.1, 0.72 + rng() * 0.06]
  const accentIsDisc = rng() < 0.5
  return [
    { kind: 'bands', angle, colors, count: colors.length },
    accentIsDisc
      ? { kind: 'disc', center: accentCenter, radius: 0.09, color: tones.deep, alpha: 1 }
      : {
          kind: 'rect',
          center: accentCenter,
          width: 0.16,
          height: 0.16,
          radius: 0.02,
          color: tones.deep,
          alpha: 1,
        },
  ]
}

function gridNodeCover(c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const a: Vec2 = [0.28 + rng() * 0.08, 0.32 + rng() * 0.08]
  const b: Vec2 = [0.6 + rng() * 0.08, 0.5]
  const d: Vec2 = [0.46 + rng() * 0.08, 0.76 + rng() * 0.06]
  return [
    { kind: 'fill', color: c.bg },
    { kind: 'dots', spacing: 0.05, radius: 0.006, color: c.border, alpha: 0.55 },
    segment(a, b, COVER_WIDTH, COVER_HEIGHT, 0.004, c.mutedFg, 0.45),
    segment(b, d, COVER_WIDTH, COVER_HEIGHT, 0.004, c.mutedFg, 0.45),
    { kind: 'disc', center: b, radius: 0.045, color: c.accent, alpha: 1 },
    { kind: 'disc', center: a, radius: 0.02, color: tones.hue1, alpha: 1 },
    { kind: 'disc', center: d, radius: 0.02, color: tones.deep, alpha: 1 },
  ]
}

function stripeBandCover(_c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const angles = [0, 45, 90, 135] as const
  const angle = angles[Math.floor(rng() * angles.length) % angles.length] ?? 0
  return [
    {
      kind: 'bands',
      angle,
      colors: [tones.hue2, tones.hue1, tones.deep],
      count: 3 + Math.floor(rng() * 2),
    },
  ]
}

function concentricCover(_c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const center: Vec2 = [0.62 + rng() * 0.08, 0.42 + rng() * 0.08]
  return [
    { kind: 'fill', color: tones.pale },
    { kind: 'ring', center, innerRadius: 0.16, outerRadius: 0.176, color: tones.deep, alpha: 1 },
    { kind: 'ring', center, innerRadius: 0.23, outerRadius: 0.242, color: tones.hue1, alpha: 1 },
    {
      kind: 'disc',
      center: [0.24 + rng() * 0.08, 0.74],
      radius: 0.07,
      color: tones.deep,
      alpha: 1,
    },
  ]
}

function editorialMarkCover(c: Rgb, _tones: Tones, rng: () => number): ArtLayer[] {
  const markKind = Math.floor(rng() * 3) % 3
  let mark: ArtLayer
  if (markKind === 0) {
    mark = {
      kind: 'polygon',
      center: [0.7, 0.62],
      radius: 0.18,
      sides: 3,
      rotation: 0,
      color: c.accent,
      alpha: 1,
    }
  } else if (markKind === 1) {
    // Centred exactly on the bottom edge: only the top half of the disc is on-canvas — a semicircle for free.
    mark = { kind: 'disc', center: [0.72, 1], radius: 0.32, color: c.accent, alpha: 1 }
  } else {
    // Centred exactly on a corner: only one quarter of the disc is on-canvas.
    mark = { kind: 'disc', center: [1, 1], radius: 0.4, color: c.accent, alpha: 1 }
  }
  return [
    { kind: 'fill', color: c.bg },
    segment([0.12, 0.18], [0.5, 0.18], COVER_WIDTH, COVER_HEIGHT, 0.004, c.fg, 0.8),
    mark,
  ]
}

function isometricStackCover(c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const shadow = mix(c.fg, tones.pale, 0.7)
  const originX = 0.4 + rng() * 0.06
  const originY = 0.4 + rng() * 0.06
  const step = 0.12 + rng() * 0.03
  const tilt = rng() < 0.5 ? 1 : -1
  const positions: readonly Vec2[] = [
    [originX, originY],
    [originX + step, originY + step * 0.85],
    [originX + step * 2, originY + step * 1.7],
  ]
  const palette = [tones.hue2, c.accent, tones.deep]
  // A seed-driven rotation of which colour lands on which card, so two
  // seeds landing on this family don't just shift position — they read as
  // genuinely different stacks.
  const shift = Math.floor(rng() * palette.length)
  const colors = palette.map((_, i) => palette[(i + shift) % palette.length] ?? c.accent)
  const layers: ArtLayer[] = [{ kind: 'fill', color: tones.pale }]
  positions.forEach((pos, i) => {
    const rotation = tilt * (i - 1) * (4 + rng() * 4)
    layers.push(
      {
        kind: 'rect',
        center: [pos[0] + 0.015, pos[1] + 0.02],
        width: 0.34,
        height: 0.22,
        radius: 0.02,
        rotation,
        color: shadow,
        alpha: 0.3,
      },
      {
        kind: 'rect',
        center: pos,
        width: 0.34,
        height: 0.22,
        radius: 0.02,
        rotation,
        color: colors[i] ?? c.accent,
        alpha: 1,
      },
    )
  })
  return layers
}

function archSunCover(c: Rgb, tones: Tones, rng: () => number): ArtLayer[] {
  const center: Vec2 = [0.42 + rng() * 0.16, 0.5 + rng() * 0.12]
  const radius = 0.18 + rng() * 0.08
  const sunColor = rng() < 0.5 ? c.accent : tones.hue1

  const layers: ArtLayer[] = [
    { kind: 'fill', color: tones.warm },
    { kind: 'disc', center, radius, color: sunColor, alpha: 1 },
  ]
  if (rng() < 0.7) {
    layers.push({
      kind: 'ring',
      center,
      innerRadius: radius + 0.04,
      outerRadius: radius + 0.05,
      color: tones.deep,
      alpha: 0.6,
    })
  }
  // The ground band crops the sun at ~60% of its radius below centre —
  // enough of an arch to read as sunrise/sunset, never the full disc.
  const groundHeight = 0.5
  const horizonY = center[1] + radius * 0.6
  layers.push({
    kind: 'rect',
    center: [0.5, horizonY + groundHeight / 2],
    width: 1.6,
    height: groundHeight,
    color: tones.deep,
    alpha: 1,
  })
  return layers
}

function checkerCover(c: Rgb, rng: () => number): ArtLayer[] {
  return [
    { kind: 'fill', color: c.bg },
    {
      kind: 'checker',
      center: [0.66, 0.5],
      width: 0.9,
      height: 1.05,
      cell: 0.045,
      rotation: rng() < 0.5 ? 0 : 8,
      color: c.accent,
      alpha: 0.85,
    },
  ]
}

function duotoneBlobCover(tones: Tones, rng: () => number): ArtLayer[] {
  const jitter = () => (rng() - 0.5) * 0.05
  return [
    { kind: 'fill', color: tones.pale },
    {
      kind: 'blob',
      points: [
        { at: [0.32 + jitter(), 0.38 + jitter()], radius: 0.28 },
        { at: [0.5 + jitter(), 0.3 + jitter()], radius: 0.22 },
        { at: [0.4 + jitter(), 0.55 + jitter()], radius: 0.2 },
      ],
      smoothing: 0.09,
      color: tones.hue1,
      alpha: 1,
    },
    {
      kind: 'blob',
      points: [
        { at: [0.68 + jitter(), 0.62 + jitter()], radius: 0.26 },
        { at: [0.82 + jitter(), 0.7 + jitter()], radius: 0.2 },
      ],
      smoothing: 0.08,
      color: tones.deep,
      alpha: 1,
    },
  ]
}

const COVER_FAMILIES: readonly ((c: Rgb, tones: Tones, rng: () => number) => ArtLayer[])[] = [
  colourBlockCover,
  gridNodeCover,
  stripeBandCover,
  concentricCover,
  editorialMarkCover,
  isometricStackCover,
  archSunCover,
  (c, _tones, rng) => checkerCover(c, rng),
  (_c, tones, rng) => duotoneBlobCover(tones, rng),
]

/** A family of ≥8 visibly different, flat layouts from one palette, picked deterministically by `seed` (D5: colour blocks, grid & node, stripe bands, concentric rings, editorial marks, isometric stacks, arch & sun, checker/half-tone, duotone blobs). */
export function coverArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const tones = buildTones(c)
  const rng = mulberry32(seed)
  const familyIndex = Math.floor(rng() * COVER_FAMILIES.length) % COVER_FAMILIES.length
  const build = COVER_FAMILIES[familyIndex] as (typeof COVER_FAMILIES)[number]
  const layers = build(c, tones, rng)
  return { width: COVER_WIDTH, height: COVER_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- avatar

const AVATAR_SIZE = 600

/** A 600×600 abstract "person" mark: a disc (head) over a disc (shoulders, cropped by the frame edge) on a flat companion-tone field — never a real photo of a person. */
export function avatarArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const tones = buildTones(c)
  const rng = mulberry32(seed)

  const field = rng() < 0.5 ? tones.pale : mix(c.muted, tones.hue2, 0.25)
  const mark = rng() < 0.5 ? c.accent : tones.deep

  const layers: ArtLayer[] = [
    { kind: 'fill', color: field },
    { kind: 'disc', center: [0.5, 1.08], radius: 0.52, color: mark, alpha: 1 },
    { kind: 'disc', center: [0.5, 0.4], radius: 0.2, color: mark, alpha: 1 },
  ]
  if (rng() < 0.5) {
    layers.push({
      kind: 'ring',
      center: [0.5, 0.5],
      innerRadius: 0.42,
      outerRadius: 0.432,
      color: c.border,
      alpha: 0.7,
    })
  }

  return { width: AVATAR_SIZE, height: AVATAR_SIZE, seed, layers }
}

// ---------------------------------------------------------------- logo

const LOGO_WIDTH = 400
const LOGO_HEIGHT = 160

/** A 400×160 neutral, abstract wordmark stand-in — a geometric mark plus two bars, always in flat mid-grey so it reads as a client logo in a logo strip, never a real brand. 8 distinct marks across seeds. */
export function logoArt(seed = 1): ArtSpec {
  const rng = mulberry32(seed)
  const grey: ColorRGB = { r: 0.42, g: 0.44, b: 0.47 }
  const markKind = Math.floor(rng() * 8) % 8
  const center: Vec2 = [0.16, 0.5]

  let mark: ArtLayer
  switch (markKind) {
    case 0:
      mark = {
        kind: 'polygon',
        center,
        radius: 0.24,
        sides: 3,
        rotation: 0,
        color: grey,
        alpha: 0.85,
      }
      break
    case 1:
      mark = {
        kind: 'ring',
        center,
        innerRadius: 0.16,
        outerRadius: 0.24,
        color: grey,
        alpha: 0.85,
      }
      break
    case 2:
      mark = {
        kind: 'rect',
        center,
        width: 0.32,
        height: 0.32,
        radius: 0.06,
        rotation: 8,
        color: grey,
        alpha: 0.85,
      }
      break
    case 3:
      mark = {
        kind: 'polygon',
        center,
        radius: 0.24,
        sides: 6,
        rotation: 0,
        color: grey,
        alpha: 0.85,
      }
      break
    case 4:
      mark = {
        kind: 'rect',
        center,
        width: 0.3,
        height: 0.3,
        radius: 0.02,
        rotation: 45,
        color: grey,
        alpha: 0.85,
      }
      break
    case 5:
      mark = { kind: 'disc', center, radius: 0.22, color: grey, alpha: 0.85 }
      break
    case 6:
      mark = {
        kind: 'polygon',
        center,
        radius: 0.24,
        sides: 3,
        rotation: 90,
        color: grey,
        alpha: 0.85,
      }
      break
    default:
      mark = { kind: 'disc', center, radius: 0.22, color: grey, alpha: 0.85 }
  }

  const layers: ArtLayer[] = [{ kind: 'fill', color: WHITE }, mark]
  if (markKind === 7) {
    // A white bar crops the disc into a "circle + bar" mark distinct from case 5's plain disc.
    layers.push({
      kind: 'rect',
      center,
      width: 0.07,
      height: 0.32,
      color: WHITE,
      alpha: 1,
    })
  }
  layers.push(
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
  )

  return { width: LOGO_WIDTH, height: LOGO_HEIGHT, seed, layers }
}

// ---------------------------------------------------------------- product

const PRODUCT_SIZE = 1000

/** A 1000×1000 centred, flat stylised object — a store's demo catalogue. Hard offset shadows (a darker solid shape, never blurred), a solid or two-tone backdrop, a floor line, one flat highlight shape per object. 6 shapes across seeds. */
export function productArt(palette: Palette, seed = 1): ArtSpec {
  const c = toRgb(palette)
  const tones = buildTones(c)
  const rng = mulberry32(seed)

  const objectColor = rng() < 0.5 ? c.accent : tones.deep
  const shape = Math.floor(rng() * 6) % 6
  const backdrop = rng() < 0.5 ? c.muted : tones.pale
  const twoTone = rng() < 0.5
  const shadowColor = mix(c.fg, backdrop, 0.55)

  const layers: ArtLayer[] = twoTone
    ? [{ kind: 'bands', angle: 90, colors: [backdrop, darken(backdrop, 0.06)], count: 2 }]
    : [{ kind: 'fill', color: backdrop }]

  layers.push(segment([0.14, 0.78], [0.86, 0.78], PRODUCT_SIZE, PRODUCT_SIZE, 0.004, c.border, 0.8))

  switch (shape) {
    case 0: {
      // Bottle/capsule.
      layers.push(
        {
          kind: 'rect',
          center: [0.52, 0.55],
          width: 0.22,
          height: 0.58,
          radius: 0.11,
          color: shadowColor,
          alpha: 0.3,
        },
        {
          kind: 'rect',
          center: [0.5, 0.53],
          width: 0.22,
          height: 0.58,
          radius: 0.11,
          color: objectColor,
          alpha: 1,
        },
        {
          kind: 'rect',
          center: [0.5, 0.22],
          width: 0.09,
          height: 0.1,
          radius: 0.02,
          color: objectColor,
          alpha: 1,
        },
      )
      break
    }
    case 1: {
      // Box.
      layers.push(
        {
          kind: 'rect',
          center: [0.53, 0.55],
          width: 0.42,
          height: 0.42,
          radius: 0.03,
          color: shadowColor,
          alpha: 0.3,
        },
        {
          kind: 'rect',
          center: [0.5, 0.52],
          width: 0.42,
          height: 0.42,
          radius: 0.03,
          color: objectColor,
          alpha: 1,
        },
        segment(
          [0.5, 0.31],
          [0.5, 0.73],
          PRODUCT_SIZE,
          PRODUCT_SIZE,
          0.006,
          lighten(objectColor, 0.3),
          0.6,
        ),
      )
      break
    }
    case 2: {
      // Sphere, flattened, with a crescent highlight (a lighter disc partly re-covered by an object-coloured disc).
      const radius = 0.28
      layers.push(
        { kind: 'disc', center: [0.53, 0.55], radius, color: shadowColor, alpha: 0.3 },
        { kind: 'disc', center: [0.5, 0.52], radius, color: objectColor, alpha: 1 },
        {
          kind: 'disc',
          center: [0.5 - radius * 0.35, 0.52 - radius * 0.35],
          radius: radius * 0.36,
          color: lighten(objectColor, 0.4),
          alpha: 1,
        },
        {
          kind: 'disc',
          center: [0.5 - radius * 0.22, 0.52 - radius * 0.22],
          radius: radius * 0.3,
          color: objectColor,
          alpha: 1,
        },
      )
      break
    }
    case 3: {
      // Ring.
      layers.push(
        {
          kind: 'ring',
          center: [0.53, 0.55],
          innerRadius: 0.2,
          outerRadius: 0.3,
          color: shadowColor,
          alpha: 0.3,
        },
        {
          kind: 'ring',
          center: [0.5, 0.52],
          innerRadius: 0.2,
          outerRadius: 0.3,
          color: objectColor,
          alpha: 1,
        },
      )
      break
    }
    case 4: {
      // Stacked cards.
      const positions: readonly Vec2[] = [
        [0.44, 0.62],
        [0.5, 0.52],
        [0.56, 0.42],
      ]
      const colors = [tones.hue2, tones.hue1, objectColor]
      positions.forEach((pos, i) => {
        const rotation = (i - 1) * 6
        layers.push(
          {
            kind: 'rect',
            center: [pos[0] + 0.02, pos[1] + 0.03],
            width: 0.34,
            height: 0.22,
            radius: 0.02,
            rotation,
            color: shadowColor,
            alpha: 0.25,
          },
          {
            kind: 'rect',
            center: pos,
            width: 0.34,
            height: 0.22,
            radius: 0.02,
            rotation,
            color: colors[i] ?? objectColor,
            alpha: 1,
          },
        )
      })
      break
    }
    default: {
      // Hexagonal tile.
      layers.push(
        {
          kind: 'polygon',
          center: [0.53, 0.55],
          radius: 0.28,
          sides: 6,
          rotation: 0,
          color: shadowColor,
          alpha: 0.3,
        },
        {
          kind: 'polygon',
          center: [0.5, 0.52],
          radius: 0.28,
          sides: 6,
          rotation: 0,
          color: objectColor,
          alpha: 1,
        },
        {
          kind: 'polygon',
          center: [0.5, 0.52],
          radius: 0.12,
          sides: 6,
          rotation: 0,
          color: lighten(objectColor, 0.3),
          alpha: 1,
        },
      )
    }
  }

  return { width: PRODUCT_SIZE, height: PRODUCT_SIZE, seed, layers }
}
