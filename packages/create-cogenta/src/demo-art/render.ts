import { encodePng } from './png.js'

/**
 * A signed-distance-field renderer for `demo-art`'s procedural compositions
 * (D1, `docs/lots/L25-templates-pro.md`): soft mesh gradients, anti-aliased
 * geometric accents, subtle grain — the abstract visual register of a modern
 * SaaS/agency/portfolio template, built with nothing beyond arithmetic (no
 * canvas library, no WASM, R9/R10). Every shape is evaluated per pixel
 * through a distance function with a ~1px `smoothstep` edge, so a small
 * composition and a large one look equally crisp.
 *
 * Coordinates on an `ArtLayer` are fractions of the canvas (0–1 for
 * position, roughly 0–1 for size relative to the *shorter* side), which is
 * what lets one `ArtSpec` render at 1600×1000 or at 400×250 without a second
 * definition.
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

export interface DiscLayer {
  readonly kind: 'disc'
  readonly center: Vec2
  readonly radius: number
  readonly color: ColorRGB
  readonly alpha?: number
}

export interface RingLayer {
  readonly kind: 'ring'
  readonly center: Vec2
  readonly innerRadius: number
  readonly outerRadius: number
  readonly color: ColorRGB
  readonly alpha?: number
}

export interface RectLayer {
  readonly kind: 'rect'
  readonly center: Vec2
  readonly width: number
  readonly height: number
  /** Corner radius, fraction of the shorter side. Defaults to 0. */
  readonly radius?: number
  /** Degrees. Defaults to 0. */
  readonly rotation?: number
  readonly color: ColorRGB
  readonly alpha?: number
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
  /**
   * Optional bounding box (fractions of the shorter canvas side, like
   * {@link RectLayer}) — omit for a full-canvas grid. Confining the grid is
   * what lets a hero composition keep its calm left zone untouched while
   * still using a dot grid on the right (D5's "grid & node" family).
   */
  readonly center?: Vec2
  readonly width?: number
  readonly height?: number
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

/** A single flat colour covering the whole canvas — the honest "solid background" primitive (D5: never a one-stop `gradient` standing in for a fill). */
export interface FillLayer {
  readonly kind: 'fill'
  readonly color: ColorRGB
}

/**
 * Two or more flat colours tiled edge-to-edge across the *whole* canvas as
 * hard-edged bands (a "colour block"/"stripe band" composition, D5) — never
 * a blend between them, only a crisp ~1px anti-aliased seam at each
 * boundary. Distinct from {@link StripesLayer}, which paints a repeating
 * pattern *over* whatever is beneath at partial alpha; a `bands` layer
 * replaces every pixel it covers (the whole canvas) with one of its own
 * colours.
 */
export interface BandsLayer {
  readonly kind: 'bands'
  /** Degrees; 0 = vertical bands (left→right), 90 = horizontal bands (top→bottom). Defaults to 90. */
  readonly angle?: number
  readonly colors: readonly ColorRGB[]
  /** Total number of bands across the canvas. Defaults to `colors.length` (each colour once); a higher count repeats the palette. */
  readonly count?: number
  /** 0–1 fraction of one band's width to shift the whole sequence by — seed-driven variety without changing the band count. */
  readonly phase?: number
}

/**
 * A coarse checkerboard of flat cells, bounded to a rectangular region —
 * "a coarse pattern block partially covering a solid field" (D5's
 * checker/half-tone family). Cells outside the region are left untouched,
 * so this is meant to sit *over* a {@link FillLayer} or another shape, not
 * to replace the whole canvas.
 */
export interface CheckerLayer {
  readonly kind: 'checker'
  readonly center: Vec2
  /** Fraction of the shorter canvas side. */
  readonly width: number
  /** Fraction of the shorter canvas side. */
  readonly height: number
  /** Cell size, fraction of the shorter canvas side. */
  readonly cell: number
  /** Degrees. Defaults to 0. */
  readonly rotation?: number
  readonly color: ColorRGB
  readonly alpha?: number
}

/**
 * An organic, hard-edged blob: one or more circles fused by a smooth
 * minimum of their signed distances (Ottosson/Quilez's `smoothMin`), so
 * overlapping circles read as one continuous silhouette rather than two
 * discs — the "duotone photo-like abstraction" family (D5). The join
 * between circles is organic; the *outer* edge stays the same crisp ~1px
 * anti-aliased boundary as every other flat shape here — there is no blur
 * anywhere in this layer.
 */
export interface BlobLayer {
  readonly kind: 'blob'
  readonly points: readonly { readonly at: Vec2; readonly radius: number }[]
  /** How far apart two circles can be and still fuse into one organic silhouette, fraction of the shorter canvas side. Defaults to 0.05. */
  readonly smoothing?: number
  readonly color: ColorRGB
  readonly alpha?: number
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
  | FillLayer
  | BandsLayer
  | CheckerLayer
  | BlobLayer

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
 * ~1px transition band at the edge (`aa`, in pixels).
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

// ---------------------------------------------------------------- pixel ops

/** Mutates `pixel` (RGB, mutable 3-length array) in place — the compiled per-pixel effect of one layer. */
type PixelOp = (pixel: Float32Array, px: number, py: number) => void

function blendOver(pixel: Float32Array, color: ColorRGB, alpha: number): void {
  const a = clamp01(alpha)
  if (a <= 0) return
  pixel[0] = (pixel[0] as number) * (1 - a) + color.r * a
  pixel[1] = (pixel[1] as number) * (1 - a) + color.g * a
  pixel[2] = (pixel[2] as number) * (1 - a) + color.b * a
}

function compileGradient(layer: GradientLayer, width: number, height: number): PixelOp {
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

  return (pixel, px, py) => {
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

    pixel[0] = r
    pixel[1] = g
    pixel[2] = b
  }
}

function compileGlow(layer: GlowLayer, width: number, height: number): PixelOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const falloff = layer.falloff ?? 2
  const { color, alpha } = layer
  return (pixel, px, py) => {
    const dx = px - cx
    const dy = py - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const t = clamp01(1 - dist / radiusPx)
    if (t <= 0) return
    blendOver(pixel, color, alpha * t ** falloff)
  }
}

function compileDisc(layer: DiscLayer, width: number, height: number): PixelOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    const dx = px - cx
    const dy = py - cy
    const d = Math.sqrt(dx * dx + dy * dy) - radiusPx
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileRing(layer: RingLayer, width: number, height: number): PixelOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const s = Math.min(width, height)
  const inner = layer.innerRadius * s
  const outer = layer.outerRadius * s
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    const dx = px - cx
    const dy = py - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const alpha = Math.min(coverage(dist - outer), coverage(inner - dist)) * alphaMul
    blendOver(pixel, color, alpha)
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
): PixelOp {
  const cx = center[0] * width
  const cy = center[1] * height
  const s = Math.min(width, height)
  const halfW = (boxWidth * s) / 2
  const halfH = (boxHeight * s) / 2
  const radius = Math.min(radiusFrac * s, Math.min(halfW, halfH))
  const rot = (-rotationDeg * Math.PI) / 180
  const cosA = Math.cos(rot)
  const sinA = Math.sin(rot)
  return (pixel, px, py) => {
    const dx0 = px - cx
    const dy0 = py - cy
    const dx = dx0 * cosA - dy0 * sinA
    const dy = dx0 * sinA + dy0 * cosA
    const d = sdRoundBox(dx, dy, halfW, halfH, radius)
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileRect(layer: RectLayer, width: number, height: number): PixelOp {
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
  )
}

function compileLine(layer: LineLayer, width: number, height: number): PixelOp {
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

function compilePolygon(layer: PolygonLayer, width: number, height: number): PixelOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const radiusPx = layer.radius * Math.min(width, height)
  const sides = Math.max(3, Math.floor(layer.sides))
  const rot = (((layer.rotation ?? 0) - 90) * Math.PI) / 180
  const angleStep = (2 * Math.PI) / sides
  const apothem = radiusPx * Math.cos(Math.PI / sides)
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    const dx = px - cx
    const dy = py - cy
    let a = Math.atan2(dy, dx) - rot
    a -= angleStep * Math.round(a / angleStep)
    const r = Math.sqrt(dx * dx + dy * dy)
    const d = r * Math.cos(a) - apothem
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileWave(layer: WaveLayer, width: number, height: number): PixelOp {
  const s = Math.min(width, height)
  const baselinePx = layer.baseline * height
  const amplitudePx = layer.amplitude * s
  const { frequency } = layer
  const phase = layer.phase ?? 0
  const direction = layer.direction ?? 'down'
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    const u = px / width
    const edgeY = baselinePx + amplitudePx * Math.sin(2 * Math.PI * frequency * u + phase)
    const d = direction === 'down' ? edgeY - py : py - edgeY
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileStripes(layer: StripesLayer, width: number, height: number): PixelOp {
  const s = Math.min(width, height)
  const angleRad = (((layer.angle ?? 45) * Math.PI) / 180) as number
  const spacingPx = Math.max(layer.spacing * s, 1)
  const thicknessPx = layer.thickness * s
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const { color, alpha: alphaMul } = layer
  return (pixel, px, py) => {
    const t = px * cosA + py * sinA
    let phase = t % spacingPx
    if (phase < 0) phase += spacingPx
    const d = Math.abs(phase - spacingPx / 2) - thicknessPx / 2
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileDots(layer: DotsLayer, width: number, height: number): PixelOp {
  const s = Math.min(width, height)
  const spacingPx = Math.max(layer.spacing * s, 1)
  const radiusPx = layer.radius * s
  const { color, alpha: alphaMul } = layer
  const bounds =
    layer.center !== undefined && layer.width !== undefined && layer.height !== undefined
      ? {
          cx: layer.center[0] * width,
          cy: layer.center[1] * height,
          halfW: (layer.width * s) / 2,
          halfH: (layer.height * s) / 2,
        }
      : undefined
  return (pixel, px, py) => {
    if (
      bounds &&
      (Math.abs(px - bounds.cx) > bounds.halfW || Math.abs(py - bounds.cy) > bounds.halfH)
    ) {
      return
    }
    const cellX = Math.floor(px / spacingPx)
    const cellY = Math.floor(py / spacingPx)
    const centerX = (cellX + 0.5) * spacingPx
    const centerY = (cellY + 0.5) * spacingPx
    const dx = px - centerX
    const dy = py - centerY
    const d = Math.sqrt(dx * dx + dy * dy) - radiusPx
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileFill(layer: FillLayer): PixelOp {
  const { color } = layer
  return (pixel) => {
    pixel[0] = color.r
    pixel[1] = color.g
    pixel[2] = color.b
  }
}

function compileBands(layer: BandsLayer, width: number, height: number): PixelOp {
  const angleRad = (((layer.angle ?? 90) * Math.PI) / 180) as number
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)

  const corners: readonly Vec2[] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const [cx, cy] of corners) {
    const t = cx * cosA + cy * sinA
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  const range = Math.max(hi - lo, 1)
  const colors = layer.colors
  const bandCount = Math.max(Math.floor(layer.count ?? colors.length), 1)
  const spacing = range / bandCount
  const phasePx = (layer.phase ?? 0) * spacing
  const aa = 1.25

  function pick(index: number): ColorRGB {
    const n = colors.length
    return colors[((index % n) + n) % n] as ColorRGB
  }

  return (pixel, px, py) => {
    const t = px * cosA + py * sinA - lo + phasePx
    const pos = t / spacing
    const index = Math.floor(pos)
    const frac = pos - index
    const distNext = (1 - frac) * spacing
    const distPrev = frac * spacing
    let color = pick(index)
    if (distNext < aa) {
      color = lerpColor(color, pick(index + 1), coverage(distNext, aa))
    } else if (distPrev < aa) {
      color = lerpColor(color, pick(index - 1), coverage(distPrev, aa))
    }
    pixel[0] = color.r
    pixel[1] = color.g
    pixel[2] = color.b
  }
}

function compileChecker(layer: CheckerLayer, width: number, height: number): PixelOp {
  const cx = layer.center[0] * width
  const cy = layer.center[1] * height
  const s = Math.min(width, height)
  const halfW = (layer.width * s) / 2
  const halfH = (layer.height * s) / 2
  const rot = (-(layer.rotation ?? 0) * Math.PI) / 180
  const cosA = Math.cos(rot)
  const sinA = Math.sin(rot)
  const cellPx = Math.max(layer.cell * s, 1)
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    const dx0 = px - cx
    const dy0 = py - cy
    const dx = dx0 * cosA - dy0 * sinA
    const dy = dx0 * sinA + dy0 * cosA
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) return
    const cellX = Math.floor((dx + halfW) / cellPx)
    const cellY = Math.floor((dy + halfH) / cellPx)
    if ((cellX + cellY) % 2 !== 0) return
    blendOver(pixel, color, alphaMul)
  }
}

/** iq's polynomial smooth minimum — the organic join between two circles that still leaves a hard (non-blurred) final silhouette edge. */
function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return lerp(b, a, h) - k * h * (1 - h)
}

function compileBlob(layer: BlobLayer, width: number, height: number): PixelOp {
  const s = Math.min(width, height)
  const k = Math.max((layer.smoothing ?? 0.05) * s, 0.0001)
  const points = layer.points.map((point) => ({
    cx: point.at[0] * width,
    cy: point.at[1] * height,
    r: point.radius * s,
  }))
  const alphaMul = layer.alpha ?? 1
  const { color } = layer
  return (pixel, px, py) => {
    let d = Number.POSITIVE_INFINITY
    for (const point of points) {
      const dx = px - point.cx
      const dy = py - point.cy
      const dPoint = Math.sqrt(dx * dx + dy * dy) - point.r
      d = d === Number.POSITIVE_INFINITY ? dPoint : smoothMin(d, dPoint, k)
    }
    blendOver(pixel, color, coverage(d) * alphaMul)
  }
}

function compileGrain(layer: GrainLayer, seed: number): PixelOp {
  const { amount } = layer
  return (pixel, px, py) => {
    const delta = hashNoise(Math.floor(px), Math.floor(py), seed) * amount
    pixel[0] = (pixel[0] as number) + delta
    pixel[1] = (pixel[1] as number) + delta
    pixel[2] = (pixel[2] as number) + delta
  }
}

function compileVignette(layer: VignetteLayer, width: number, height: number): PixelOp {
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const { strength } = layer
  const color = layer.color ?? { r: 0, g: 0, b: 0 }
  return (pixel, px, py) => {
    const dx = px - cx
    const dy = py - cy
    const t = clamp01(Math.sqrt(dx * dx + dy * dy) / maxDist)
    const smooth = t * t * (3 - 2 * t)
    blendOver(pixel, color, strength * smooth)
  }
}

function compileLayer(layer: ArtLayer, width: number, height: number, seed: number): PixelOp {
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
      return compileGrain(layer, seed)
    case 'vignette':
      return compileVignette(layer, width, height)
    case 'fill':
      return compileFill(layer)
    case 'bands':
      return compileBands(layer, width, height)
    case 'checker':
      return compileChecker(layer, width, height)
    case 'blob':
      return compileBlob(layer, width, height)
    /* c8 ignore next 2 -- exhaustive switch over a closed union */
    default:
      return () => undefined
  }
}

function toByte(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value
  return Math.round(clamped * 255)
}

/** Renders an `ArtSpec` to a PNG buffer. Deterministic: the same spec always produces the same bytes. */
export function renderArt(spec: ArtSpec): Uint8Array {
  const { width, height, seed } = spec
  const ops = spec.layers.map((layer) => compileLayer(layer, width, height, seed))
  const rgb = new Uint8Array(width * height * 3)
  const pixel = new Float32Array(3)

  for (let y = 0; y < height; y++) {
    const py = y + 0.5
    const rowOffset = y * width * 3
    for (let x = 0; x < width; x++) {
      const px = x + 0.5
      pixel[0] = 0
      pixel[1] = 0
      pixel[2] = 0
      for (const op of ops) op(pixel, px, py)
      const idx = rowOffset + x * 3
      rgb[idx] = toByte(pixel[0] as number)
      rgb[idx + 1] = toByte(pixel[1] as number)
      rgb[idx + 2] = toByte(pixel[2] as number)
    }
  }

  return encodePng(width, height, rgb)
}
