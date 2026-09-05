import { encodePng } from './png.js'

/**
 * A signed-distance-field renderer for `demo-art`'s procedural compositions
 * (D1, `docs/lots/L25-templates-pro.md`): soft mesh gradients, gradient-filled
 * geometric accents with drop shadows and specular highlights, subtle grain
 * — the abstract visual register of a modern SaaS/agency/portfolio template,
 * built with nothing beyond arithmetic (no canvas library, no WASM, R9/R10).
 * Every shape is evaluated per pixel through a distance function with a
 * ~1px `smoothstep` edge, so a small composition and a large one look
 * equally crisp.
 *
 * Coordinates on an `ArtLayer` are fractions of the canvas (0–1 for
 * position, roughly 0–1 for size relative to the *shorter* side), which is
 * what lets one `ArtSpec` render at 1600×1000 or at 400×250 without a second
 * definition.
 *
 * Every local shape (disc/ring/rect/line/polygon) and radius-bounded effect
 * (glow) is compiled with its own bounding box, so a small accent shape only
 * costs work over the pixels it can possibly touch — this is what keeps a
 * hero with a dozen shadowed, gradient-filled shapes comfortably inside the
 * performance bound even though it now does noticeably more work per shape
 * than the original flat-colour renderer did.
 */

/** A colour expressed as three 0–1 floats — never a CSS string in this module (that parsing lives in `compositions.ts`, next to the palettes it reads). */
export interface ColorRGB {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** A position or size as a fraction of the canvas: `[x, y]`, both 0–1. */
export type Vec2 = readonly [number, number]

export interface GradientStop {
  readonly at: number
  readonly color: ColorRGB
}

/** A colour blob blended into the base gradient by gaussian falloff — this is what makes a "mesh"/"aurora" background. */
export interface MeshPoint {
  readonly at: Vec2
  readonly color: ColorRGB
  /** Influence radius, fraction of the shorter canvas side. Defaults to 0.35. */
  readonly radius?: number
}

export interface GradientLayer {
  readonly kind: 'gradient'
  /** Degrees; 0 = left→right, 90 = top→bottom. Defaults to 90. */
  readonly angle?: number
  readonly stops: readonly GradientStop[]
  readonly mesh?: readonly MeshPoint[]
}

export interface GlowLayer {
  readonly kind: 'glow'
  readonly center: Vec2
  /** Fraction of the shorter canvas side. */
  readonly radius: number
  readonly color: ColorRGB
  readonly alpha: number
  /** Falloff exponent — higher is a tighter hotspot. Defaults to 2. */
  readonly falloff?: number
}

/**
 * How a shape's interior is coloured: a flat colour, or a gradient computed
 * across the shape's own world-space bounding box. A gradient's direction
 * (`linear`) or hotspot (`radial`'s `focus`) is always in *world* space, not
 * the shape's own rotated local frame — which is what makes "light falls
 * from the top-left" read consistently across a scene even when the shapes
 * themselves are rotated at different angles, exactly like a real light
 * source would.
 */
export type Fill =
  | { readonly type: 'solid'; readonly color: ColorRGB }
  | {
      readonly type: 'linear'
      readonly from: ColorRGB
      readonly to: ColorRGB
      /** Degrees; 0 = left→right, 90 = top→bottom. Defaults to 135 (top-left → bottom-right). */
      readonly angle?: number
    }
  | {
      readonly type: 'radial'
      readonly from: ColorRGB
      readonly to: ColorRGB
      /** Hotspot position within the shape's bounding box, `[0,0]` = top-left corner, `[0.5,0.5]` = centre. Defaults to `[0.35, 0.3]` — an upper-left highlight, the classic "sunlit sphere" placement. */
      readonly focus?: Vec2
    }

/**
 * A soft drop shadow cast by a shape — approximated by evaluating the same
 * signed distance at an offset with a much wider anti-alias band, never a
 * real gaussian blur (no canvas library, R9/R10). Rendered *before* the
 * shape itself, so the shape's own fill paints over the part of the shadow
 * that would fall directly underneath it.
 */
export interface ShapeShadow {
  /** Fraction of the shorter canvas side. */
  readonly offset: Vec2
  /** Blur radius, fraction of the shorter canvas side — the width of the soft edge. */
  readonly blur: number
  readonly alpha: number
  /** Defaults to near-black. */
  readonly color?: ColorRGB
}

/** How a shape composites onto what is already painted. `screen` is what makes overlapping translucent discs look like they glow where they overlap, rather than just look like flat, muddier discs. */
export type BlendMode = 'normal' | 'screen' | 'multiply'

export interface DiscLayer {
  readonly kind: 'disc'
  readonly center: Vec2
  readonly radius: number
  readonly color: ColorRGB
  readonly alpha?: number
  readonly fill?: Fill
  readonly shadow?: ShapeShadow
  readonly blend?: BlendMode
}

export interface RingLayer {
  readonly kind: 'ring'
  readonly center: Vec2
  readonly innerRadius: number
  readonly outerRadius: number
  readonly color: ColorRGB
  readonly alpha?: number
  readonly fill?: Fill
  readonly shadow?: ShapeShadow
  readonly blend?: BlendMode
}

export interface RectLayer {
  readonly kind: 'rect'
  readonly center: Vec2
  readonly width: number
  readonly height: number
  /** Corner radius, fraction of the shorter side. Defaults to 0. A radius equal to half the shorter dimension gives a "stadium"/pill shape — the stand-in this module uses for a capsule body or a squashed contact-shadow ellipse, rather than adding a second shape primitive for it. */
  readonly radius?: number
  /** Degrees. Defaults to 0. */
  readonly rotation?: number
  readonly color: ColorRGB
  readonly alpha?: number
  readonly fill?: Fill
  readonly shadow?: ShapeShadow
  readonly blend?: BlendMode
}

export interface LineLayer {
  readonly kind: 'line'
  readonly center: Vec2
  readonly length: number
  readonly thickness: number
  readonly rotation?: number
  readonly color: ColorRGB
  readonly alpha?: number
}

export interface PolygonLayer {
  readonly kind: 'polygon'
  readonly center: Vec2
  readonly radius: number
  /** 3 or more. */
  readonly sides: number
  readonly rotation?: number
  readonly color: ColorRGB
  readonly alpha?: number
  readonly fill?: Fill
  readonly shadow?: ShapeShadow
  readonly blend?: BlendMode
}

export interface WaveLayer {
  readonly kind: 'wave'
  /** Fraction of canvas height where the wave sits. */
  readonly baseline: number
  /** Fraction of the shorter side. */
  readonly amplitude: number
  /** Full sine cycles across the canvas width. */
  readonly frequency: number
  readonly phase?: number
  readonly color: ColorRGB
  readonly alpha?: number
  /** Which side of the wave edge is filled. Defaults to 'down' (below the edge). */
  readonly direction?: 'up' | 'down'
}

export interface StripesLayer {
  readonly kind: 'stripes'
  /** Degrees. Defaults to 45. */
  readonly angle?: number
  readonly spacing: number
  readonly thickness: number
  readonly color: ColorRGB
  readonly alpha: number
}

export interface DotsLayer {
  readonly kind: 'dots'
  readonly spacing: number
  readonly radius: number
  readonly color: ColorRGB
  readonly alpha: number
}

export interface GrainLayer {
  readonly kind: 'grain'
  /** 0–1, the maximum per-pixel brightness jitter. */
  readonly amount: number
}

export interface VignetteLayer {
  readonly kind: 'vignette'
  /** 0–1, darkening at the corners. */
  readonly strength: number
  readonly color?: ColorRGB
}

export type ArtLayer =
  | GradientLayer
  | GlowLayer
  | DiscLayer
  | RingLayer
  | RectLayer
  | LineLayer
  | PolygonLayer
  | WaveLayer
  | StripesLayer
  | DotsLayer
  | GrainLayer
  | VignetteLayer

export interface ArtSpec {
  readonly width: number
  readonly height: number
  /** Drives every pseudo-random placement (`mulberry32`) — a given seed always renders the same bytes. */
  readonly seed: number
  readonly layers: readonly ArtLayer[]
}

// ---------------------------------------------------------------- prng

/**
 * A tiny, fast, deterministic PRNG (mulberry32) — used by `compositions.ts`
 * to place and vary shapes from a `seed`, never `Math.random()`. Returns a
 * generator of floats in `[0, 1)`.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A deterministic, spatial hash in `[-1, 1]` — grain's per-pixel jitter. Not a placement PRNG (that's `mulberry32`): this needs a value *per pixel*, not a stream. */
function hashNoise(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2654435761)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}

// ---------------------------------------------------------------- math helpers

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Anti-aliased coverage from a signed distance: negative `d` is inside the
 * shape (coverage → 1), positive is outside (coverage → 0), with a soft
 * transition band at the edge (`aa`, in pixels — the default is a crisp
 * ~1px edge; a shadow pass calls this with a much wider `aa` to approximate
 * blur).
 */
function coverage(d: number, aa = 1.25): number {
  return clamp01(0.5 - d / aa)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: ColorRGB, b: ColorRGB, t: number): ColorRGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) }
}

/** Rounded-box SDF, in a frame already centred and de-rotated around the box. */
function sdRoundBox(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const qx = Math.abs(x) - halfW + radius
  const qy = Math.abs(y) - halfH + radius
  const outsideX = Math.max(qx, 0)
  const outsideY = Math.max(qy, 0)
  return (
    Math.sqrt(outsideX * outsideX + outsideY * outsideY) + Math.min(Math.max(qx, qy), 0) - radius
  )
}

type DistanceFn = (px: number, py: number) => number
type FillFn = (px: number, py: number) => ColorRGB

/** A pixel-integer bounding box, `[x0, y0, x1, y1)` — `x1`/`y1` exclusive, always clamped to the canvas. */
type BBox = readonly [number, number, number, number]

function clampBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
  extraMargin = 0,
): BBox {
  const left = Math.max(0, Math.floor(x0 - extraMargin))
  const top = Math.max(0, Math.floor(y0 - extraMargin))
  const right = Math.min(width, Math.ceil(x1 + extraMargin))
  const bottom = Math.min(height, Math.ceil(y1 + extraMargin))
  return [left, top, Math.max(left, right), Math.max(top, bottom)]
}

/** A layer compiled to a bounding box (the only pixels it can possibly affect) and a function that paints one pixel of the shared framebuffer. */
interface CompiledOp {
  readonly bbox: BBox
  readonly apply: (fb: Float32Array, idx: number, px: number, py: number) => void
}

// ---------------------------------------------------------------- pixel ops

function blendOver(
  fb: Float32Array,
  idx: number,
  color: ColorRGB,
  alpha: number,
  mode: BlendMode = 'normal',
): void {
  const a = clamp01(alpha)
  if (a <= 0) return
  const baseR = fb[idx] as number
  const baseG = fb[idx + 1] as number
  const baseB = fb[idx + 2] as number
  let r = color.r
  let g = color.g
  let b = color.b
  if (mode === 'screen') {
    r = 1 - (1 - baseR) * (1 - r)
    g = 1 - (1 - baseG) * (1 - g)
    b = 1 - (1 - baseB) * (1 - b)
  } else if (mode === 'multiply') {
    r = baseR * r
    g = baseG * g
    b = baseB * b
  }
  fb[idx] = baseR * (1 - a) + r * a
  fb[idx + 1] = baseG * (1 - a) + g * a
  fb[idx + 2] = baseB * (1 - a) + b * a
}

/**
 * Builds the per-pixel colour function for a shape's `fill`. `halfW`/`halfH`
 * are the shape's *world-space* bounding-box half-extents (not its local,
 * possibly-rotated half-size) — see {@link Fill}'s own doc comment for why
 * a gradient is computed in world space rather than the shape's own frame.
 */
function makeFillFn(
  fill: Fill | undefined,
  flatColor: ColorRGB,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): FillFn {
  if (fill === undefined) return () => flatColor
  if (fill.type === 'solid') {
    const { color } = fill
    return () => color
  }
  if (fill.type === 'linear') {
    const angleRad = (((fill.angle ?? 135) * Math.PI) / 180) as number
    const dirX = Math.cos(angleRad)
    const dirY = Math.sin(angleRad)
    const span = Math.max(Math.abs(halfW * dirX) + Math.abs(halfH * dirY), 1e-6)
    const { from, to } = fill
    return (px, py) => {
      const t = clamp01(0.5 + ((px - cx) * dirX + (py - cy) * dirY) / (2 * span))
      return lerpColor(from, to, t)
    }
  }
  const focus = fill.focus ?? [0.35, 0.3]
  const fx = cx + (focus[0] * 2 - 1) * halfW
  const fy = cy + (focus[1] * 2 - 1) * halfH
  const maxDist = Math.max(Math.sqrt(halfW * halfW + halfH * halfH), 1e-6)
  const { from, to } = fill
  return (px, py) => {
    const dx = px - fx
    const dy = py - fy
    const t = clamp01(Math.sqrt(dx * dx + dy * dy) / maxDist)
    return lerpColor(from, to, t)
  }
}

/** Compiles a shape's optional drop shadow into its own paint pass — `undefined` when the shape has none, so the caller skips it entirely (never a zero-alpha no-op pass). */
function compileShadowFor(
  shadow: ShapeShadow | undefined,
  distanceFn: DistanceFn,
  shorterSide: number,
): { readonly margin: number; readonly apply: CompiledOp['apply'] } | undefined {
  if (shadow === undefined) return undefined
  const offX = shadow.offset[0] * shorterSide
  const offY = shadow.offset[1] * shorterSide
  const blurPx = Math.max(shadow.blur * shorterSide, 1)
  const color = shadow.color ?? { r: 0.03, g: 0.02, b: 0.02 }
  const { alpha } = shadow
  const margin = Math.abs(offX) + Math.abs(offY) + blurPx * 2
  return {
    margin,
    apply: (fb, idx, px, py) => {
      const d = distanceFn(px - offX, py - offY)
      blendOver(fb, idx, color, coverage(d, blurPx) * alpha)
    },
  }
}

function compileGradient(layer: GradientLayer, width: number, height: number): CompiledOp {
  const angleRad = (((layer.angle ?? 90) * Math.PI) / 180) as number
  const dirX = Math.cos(angleRad)
  const dirY = Math.sin(angleRad)
  const stops = [...layer.stops].sort((a, b) => a.at - b.at)

  function colorAt(t: number): ColorRGB {
    if (stops.length === 0) return { r: 0, g: 0, b: 0 }
    const first = stops[0] as GradientStop
    if (t <= first.at) return first.color
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1] as GradientStop
      const cur = stops[i] as GradientStop
      if (t <= cur.at) {
        const span = cur.at - prev.at
        const localT = span <= 0 ? 0 : clamp01((t - prev.at) / span)
        return lerpColor(prev.color, cur.color, localT)
      }
    }
    return (stops[stops.length - 1] as GradientStop).color
  }

  const shorter = Math.min(width, height)
  const meshPoints = (layer.mesh ?? []).map((point) => ({
    cx: point.at[0] * width,
    cy: point.at[1] * height,
    sigma: Math.max((point.radius ?? 0.35) * shorter, 1),
    color: point.color,
  }))

  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const u = px / width
      const v = py / height
      const t = clamp01(0.5 + ((u - 0.5) * dirX + (v - 0.5) * dirY))
      const base = colorAt(t)
      let r = base.r
      let g = base.g
      let b = base.b

      if (meshPoints.length > 0) {
        let sumW = 0
        let mr = 0
        let mg = 0
        let mb = 0
        for (const point of meshPoints) {
          const dx = px - point.cx
          const dy = py - point.cy
          const d2 = dx * dx + dy * dy
          const s2 = point.sigma * point.sigma
          const w = Math.exp(-d2 / (2 * s2))
          sumW += w
          mr += w * point.color.r
          mg += w * point.color.g
          mb += w * point.color.b
        }
        if (sumW > 0.0005) {
          const mixT = clamp01(sumW)
          const meshR = mr / sumW
          const meshG = mg / sumW
          const meshB = mb / sumW
          r = r * (1 - mixT) + meshR * mixT
          g = g * (1 - mixT) + meshG * mixT
          b = b * (1 - mixT) + meshB * mixT
        }
      }

      fb[idx] = r
      fb[idx + 1] = g
      fb[idx + 2] = b
    },
  }
}

function compileGlow(layer: GlowLayer, width: number, height: number): CompiledOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const falloff = layer.falloff ?? 2
  const { color, alpha } = layer
  const margin = 1
  return {
    bbox: clampBox(
      cx - radiusPx,
      cy - radiusPx,
      cx + radiusPx,
      cy + radiusPx,
      width,
      height,
      margin,
    ),
    apply: (fb, idx, px, py) => {
      const dx = px - cx
      const dy = py - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const t = clamp01(1 - dist / radiusPx)
      if (t <= 0) return
      blendOver(fb, idx, color, alpha * t ** falloff)
    },
  }
}

function compileDisc(layer: DiscLayer, width: number, height: number): CompiledOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const alphaMul = layer.alpha ?? 1
  const blend = layer.blend ?? 'normal'
  const { color } = layer
  const fillFn = makeFillFn(layer.fill, color, cx, cy, radiusPx, radiusPx)
  const distanceFn: DistanceFn = (px, py) => {
    const dx = px - cx
    const dy = py - cy
    return Math.sqrt(dx * dx + dy * dy) - radiusPx
  }
  const shadow = compileShadowFor(layer.shadow, distanceFn, Math.min(width, height))
  const margin = 3
  return {
    bbox: clampBox(
      cx - radiusPx,
      cy - radiusPx,
      cx + radiusPx,
      cy + radiusPx,
      width,
      height,
      margin + (shadow?.margin ?? 0),
    ),
    apply: (fb, idx, px, py) => {
      if (shadow) shadow.apply(fb, idx, px, py)
      const d = distanceFn(px, py)
      blendOver(fb, idx, fillFn(px, py), coverage(d) * alphaMul, blend)
    },
  }
}

function compileRing(layer: RingLayer, width: number, height: number): CompiledOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const s = Math.min(width, height)
  const inner = layer.innerRadius * s
  const outer = layer.outerRadius * s
  const alphaMul = layer.alpha ?? 1
  const blend = layer.blend ?? 'normal'
  const { color } = layer
  const fillFn = makeFillFn(layer.fill, color, cx, cy, outer, outer)
  // The shadow follows the ring's outer silhouette only — a torus's cast
  // shadow is dominated by its outer edge, and approximating the hole too
  // would need a second, subtractive pass for a detail no one will notice
  // in an abstract product shot.
  const shadowDistanceFn: DistanceFn = (px, py) => {
    const dx = px - cx
    const dy = py - cy
    return Math.sqrt(dx * dx + dy * dy) - outer
  }
  const shadow = compileShadowFor(layer.shadow, shadowDistanceFn, s)
  const margin = 3
  return {
    bbox: clampBox(
      cx - outer,
      cy - outer,
      cx + outer,
      cy + outer,
      width,
      height,
      margin + (shadow?.margin ?? 0),
    ),
    apply: (fb, idx, px, py) => {
      if (shadow) shadow.apply(fb, idx, px, py)
      const dx = px - cx
      const dy = py - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const alpha = Math.min(coverage(dist - outer), coverage(inner - dist)) * alphaMul
      blendOver(fb, idx, fillFn(px, py), alpha, blend)
    },
  }
}

function compileRoundedBox(
  center: Vec2,
  boxWidth: number,
  boxHeight: number,
  radiusFrac: number,
  rotationDeg: number,
  color: ColorRGB,
  alphaMul: number,
  width: number,
  height: number,
  extra?: {
    readonly fill?: Fill | undefined
    readonly shadow?: ShapeShadow | undefined
    readonly blend?: BlendMode | undefined
  },
): CompiledOp {
  const cx = center[0] * width
  const cy = center[1] * height
  const s = Math.min(width, height)
  const halfW = (boxWidth * s) / 2
  const halfH = (boxHeight * s) / 2
  const radius = Math.min(radiusFrac * s, Math.min(halfW, halfH))
  const rot = (-rotationDeg * Math.PI) / 180
  const cosA = Math.cos(rot)
  const sinA = Math.sin(rot)
  const distanceFn: DistanceFn = (px, py) => {
    const dx0 = px - cx
    const dy0 = py - cy
    const dx = dx0 * cosA - dy0 * sinA
    const dy = dx0 * sinA + dy0 * cosA
    return sdRoundBox(dx, dy, halfW, halfH, radius)
  }
  // AABB of a rotated box — world-space half-extents, also what a world-space fill gradient is computed across.
  const extentX = Math.abs(halfW * cosA) + Math.abs(halfH * sinA)
  const extentY = Math.abs(halfW * sinA) + Math.abs(halfH * cosA)
  const blend = extra?.blend ?? 'normal'
  const fillFn = makeFillFn(extra?.fill, color, cx, cy, extentX, extentY)
  const shadow = compileShadowFor(extra?.shadow, distanceFn, s)
  const margin = 3
  return {
    bbox: clampBox(
      cx - extentX,
      cy - extentY,
      cx + extentX,
      cy + extentY,
      width,
      height,
      margin + (shadow?.margin ?? 0),
    ),
    apply: (fb, idx, px, py) => {
      if (shadow) shadow.apply(fb, idx, px, py)
      const d = distanceFn(px, py)
      blendOver(fb, idx, fillFn(px, py), coverage(d) * alphaMul, blend)
    },
  }
}

function compileRect(layer: RectLayer, width: number, height: number): CompiledOp {
  return compileRoundedBox(
    layer.center,
    layer.width,
    layer.height,
    layer.radius ?? 0,
    layer.rotation ?? 0,
    layer.color,
    layer.alpha ?? 1,
    width,
    height,
    { fill: layer.fill, shadow: layer.shadow, blend: layer.blend },
  )
}

function compileLine(layer: LineLayer, width: number, height: number): CompiledOp {
  return compileRoundedBox(
    layer.center,
    layer.length,
    layer.thickness,
    layer.thickness / 2,
    layer.rotation ?? 0,
    layer.color,
    layer.alpha ?? 1,
    width,
    height,
  )
}

function compilePolygon(layer: PolygonLayer, width: number, height: number): CompiledOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const sides = Math.max(3, Math.floor(layer.sides))
  const rot = (((layer.rotation ?? 0) - 90) * Math.PI) / 180
  const angleStep = (2 * Math.PI) / sides
  const apothem = radiusPx * Math.cos(Math.PI / sides)
  const alphaMul = layer.alpha ?? 1
  const blend = layer.blend ?? 'normal'
  const { color } = layer
  const fillFn = makeFillFn(layer.fill, color, cx, cy, radiusPx, radiusPx)
  const distanceFn: DistanceFn = (px, py) => {
    const dx = px - cx
    const dy = py - cy
    let a = Math.atan2(dy, dx) - rot
    a -= angleStep * Math.round(a / angleStep)
    const r = Math.sqrt(dx * dx + dy * dy)
    return r * Math.cos(a) - apothem
  }
  const shadow = compileShadowFor(layer.shadow, distanceFn, Math.min(width, height))
  const margin = 3
  return {
    bbox: clampBox(
      cx - radiusPx,
      cy - radiusPx,
      cx + radiusPx,
      cy + radiusPx,
      width,
      height,
      margin + (shadow?.margin ?? 0),
    ),
    apply: (fb, idx, px, py) => {
      if (shadow) shadow.apply(fb, idx, px, py)
      const d = distanceFn(px, py)
      blendOver(fb, idx, fillFn(px, py), coverage(d) * alphaMul, blend)
    },
  }
}

function compileWave(layer: WaveLayer, width: number, height: number): CompiledOp {
  const s = Math.min(width, height)
  const baselinePx = layer.baseline * height
  const amplitudePx = layer.amplitude * s
  const { frequency } = layer
  const phase = layer.phase ?? 0
  const direction = layer.direction ?? 'down'
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const u = px / width
      const edgeY = baselinePx + amplitudePx * Math.sin(2 * Math.PI * frequency * u + phase)
      const d = direction === 'down' ? edgeY - py : py - edgeY
      blendOver(fb, idx, color, coverage(d) * alphaMul)
    },
  }
}

function compileStripes(layer: StripesLayer, width: number, height: number): CompiledOp {
  const s = Math.min(width, height)
  const angleRad = (((layer.angle ?? 45) * Math.PI) / 180) as number
  const spacingPx = Math.max(layer.spacing * s, 1)
  const thicknessPx = layer.thickness * s
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const { color, alpha: alphaMul } = layer
  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const t = px * cosA + py * sinA
      let phase = t % spacingPx
      if (phase < 0) phase += spacingPx
      const d = Math.abs(phase - spacingPx / 2) - thicknessPx / 2
      blendOver(fb, idx, color, coverage(d) * alphaMul)
    },
  }
}

function compileDots(layer: DotsLayer, width: number, height: number): CompiledOp {
  const s = Math.min(width, height)
  const spacingPx = Math.max(layer.spacing * s, 1)
  const radiusPx = layer.radius * s
  const { color, alpha: alphaMul } = layer
  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const cellX = Math.floor(px / spacingPx)
      const cellY = Math.floor(py / spacingPx)
      const centerX = (cellX + 0.5) * spacingPx
      const centerY = (cellY + 0.5) * spacingPx
      const dx = px - centerX
      const dy = py - centerY
      const d = Math.sqrt(dx * dx + dy * dy) - radiusPx
      blendOver(fb, idx, color, coverage(d) * alphaMul)
    },
  }
}

function compileGrain(layer: GrainLayer, width: number, height: number, seed: number): CompiledOp {
  const { amount } = layer
  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const delta = hashNoise(Math.floor(px), Math.floor(py), seed) * amount
      fb[idx] = (fb[idx] as number) + delta
      fb[idx + 1] = (fb[idx + 1] as number) + delta
      fb[idx + 2] = (fb[idx + 2] as number) + delta
    },
  }
}

function compileVignette(layer: VignetteLayer, width: number, height: number): CompiledOp {
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const { strength } = layer
  const color = layer.color ?? { r: 0, g: 0, b: 0 }
  return {
    bbox: [0, 0, width, height],
    apply: (fb, idx, px, py) => {
      const dx = px - cx
      const dy = py - cy
      const t = clamp01(Math.sqrt(dx * dx + dy * dy) / maxDist)
      const smooth = t * t * (3 - 2 * t)
      blendOver(fb, idx, color, strength * smooth)
    },
  }
}

function compileLayer(layer: ArtLayer, width: number, height: number, seed: number): CompiledOp {
  switch (layer.kind) {
    case 'gradient':
      return compileGradient(layer, width, height)
    case 'glow':
      return compileGlow(layer, width, height)
    case 'disc':
      return compileDisc(layer, width, height)
    case 'ring':
      return compileRing(layer, width, height)
    case 'rect':
      return compileRect(layer, width, height)
    case 'line':
      return compileLine(layer, width, height)
    case 'polygon':
      return compilePolygon(layer, width, height)
    case 'wave':
      return compileWave(layer, width, height)
    case 'stripes':
      return compileStripes(layer, width, height)
    case 'dots':
      return compileDots(layer, width, height)
    case 'grain':
      return compileGrain(layer, width, height, seed)
    case 'vignette':
      return compileVignette(layer, width, height)
    /* c8 ignore next 2 -- exhaustive switch over a closed union */
    default:
      return { bbox: [0, 0, 0, 0], apply: () => undefined }
  }
}

function toByte(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value
  return Math.round(clamped * 255)
}

/**
 * Renders an `ArtSpec` to a linear RGB framebuffer (each channel an
 * unclamped float — grain and additive glows can legitimately push a value
 * outside 0–1 mid-render, clamped only once, at the very end). Every layer
 * is painted over only the pixels its own bounding box says it can reach,
 * in declaration order, onto a framebuffer that starts fully black — the
 * same "paint in order" semantics the original always-full-canvas loop had,
 * just without paying for pixels a small shape can never touch.
 */
function renderToFramebuffer(spec: ArtSpec): {
  readonly width: number
  readonly height: number
  readonly fb: Float32Array
} {
  const { width, height, seed } = spec
  const fb = new Float32Array(width * height * 3)
  const compiled = spec.layers.map((layer) => compileLayer(layer, width, height, seed))

  for (const { bbox, apply } of compiled) {
    const [x0, y0, x1, y1] = bbox
    for (let y = y0; y < y1; y++) {
      const py = y + 0.5
      const rowOffset = y * width * 3
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5
        apply(fb, rowOffset + x * 3, px, py)
      }
    }
  }

  return { width, height, fb }
}

/**
 * Renders an `ArtSpec` to raw, byte-clamped RGB — exposed (alongside the PNG
 * path) so a test can measure real pixel statistics — e.g. "is the left
 * half of this hero calm enough to put a title on" — without round-tripping
 * through a PNG decoder that this package has no other reason to depend on.
 */
export function renderRgb(spec: ArtSpec): {
  readonly width: number
  readonly height: number
  readonly rgb: Uint8Array
} {
  const { width, height, fb } = renderToFramebuffer(spec)
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < rgb.length; i++) rgb[i] = toByte(fb[i] as number)
  return { width, height, rgb }
}

/** Renders an `ArtSpec` to a PNG buffer. Deterministic: the same spec always produces the same bytes. */
export function renderArt(spec: ArtSpec): Uint8Array {
  const { width, height, rgb } = renderRgb(spec)
  return encodePng(width, height, rgb)
}
