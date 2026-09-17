/**
 * The image editor's frame arithmetic (L39), kept apart from the component so
 * it can be tested without a canvas. A frame is in fractions of the turned
 * picture — exactly what `POST /api/media/{id}/edit` expects.
 */

export interface CropRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PixelSize {
  readonly width: number
  readonly height: number
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 }

export const RATIO_PRESETS = ['free', '1:1', '4:3', '3:2', '16:9'] as const

export type RatioPreset = (typeof RATIO_PRESETS)[number]

/** The smallest side a frame may have, as a fraction: small enough to crop a detail, never zero. */
const MIN_SIDE = 0.05

const RATIOS: Readonly<Record<Exclude<RatioPreset, 'free'>, number>> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The picture's size once turned. */
export function turned(size: PixelSize, rotate: 0 | 90 | 180 | 270): PixelSize {
  return rotate === 90 || rotate === 270 ? { width: size.height, height: size.width } : size
}

/** A frame kept inside the picture, no side under the minimum, values rounded to 1/10 000. */
export function clampRect(rect: CropRect): CropRect {
  const round = (value: number): number => Math.round(value * 10_000) / 10_000
  const width = clamp(rect.width, MIN_SIDE, 1)
  const height = clamp(rect.height, MIN_SIDE, 1)
  return {
    x: round(clamp(rect.x, 0, 1 - width)),
    y: round(clamp(rect.y, 0, 1 - height)),
    width: round(width),
    height: round(height),
  }
}

/** The same frame, moved, and stopped at the picture's edges. */
export function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy })
}

/** The largest frame of a ratio, centred; the whole picture when the ratio is free. */
export function rectForRatio(preset: RatioPreset, size: PixelSize): CropRect {
  if (preset === 'free') return FULL_CROP
  const target = RATIOS[preset]
  const actual = size.width / size.height
  const width = actual > target ? target / actual : 1
  const height = actual > target ? 1 : actual / target
  return clampRect({ x: (1 - width) / 2, y: (1 - height) / 2, width, height })
}

/**
 * The frame with one corner dragged by `(dx, dy)`, the opposite corner held.
 * With a fixed ratio, the height follows the width, in pixels of the turned
 * picture, and the frame shrinks rather than leaving the picture.
 */
export function resizeRect(
  rect: CropRect,
  corner: 'nw' | 'ne' | 'sw' | 'se',
  dx: number,
  dy: number,
  preset: RatioPreset,
  size: PixelSize,
): CropRect {
  const west = corner.endsWith('w')
  const north = corner.startsWith('n')
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  let width = clamp(west ? rect.width - dx : rect.width + dx, MIN_SIDE, west ? right : 1 - rect.x)
  let height = clamp(
    north ? rect.height - dy : rect.height + dy,
    MIN_SIDE,
    north ? bottom : 1 - rect.y,
  )

  if (preset !== 'free') {
    const target = RATIOS[preset]
    const maxHeight = north ? bottom : 1 - rect.y
    height = (width * size.width) / target / size.height
    if (height > maxHeight) {
      height = maxHeight
      width = (height * size.height * target) / size.width
    }
    if (height < MIN_SIDE) {
      height = MIN_SIDE
      width = (height * size.height * target) / size.width
    }
  }

  return clampRect({
    x: west ? right - width : rect.x,
    y: north ? bottom - height : rect.y,
    width,
    height,
  })
}
