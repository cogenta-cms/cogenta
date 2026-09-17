import { CogentaError, type FocalPoint } from '@cogenta/core'
import { z } from 'zod'

/**
 * Cropping and rotating an image in place (L39), the pure half: what a
 * request asks for, where the untouched original is kept, and where the focal
 * point lands once the picture has turned and been cropped.
 */

export type QuarterTurn = 0 | 90 | 180 | 270

/** A crop rectangle in fractions of the rotated picture: `0..1`, origin top-left. */
export interface EditCrop {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ImageEdit {
  readonly rotate: QuarterTurn
  /** `null`: the whole rotated picture. */
  readonly crop: EditCrop | null
}

const EPSILON = 1e-6

const editSchema = z
  .object({
    rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().gt(0).max(1),
        height: z.number().gt(0).max(1),
      })
      .nullable()
      .optional(),
  })
  .strict()

export function parseImageEdit(body: unknown): ImageEdit {
  const result = editSchema.safeParse(body)
  const crop = result.success ? (result.data.crop ?? null) : null
  if (
    !result.success ||
    (crop !== null && (crop.x + crop.width > 1 + EPSILON || crop.y + crop.height > 1 + EPSILON))
  ) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'An image edit is a quarter turn and an optional crop inside the picture.',
      hint: 'Send { "rotate": 0 | 90 | 180 | 270, "crop": { "x", "y", "width", "height" } } with fractions of the rotated picture.',
    })
  }
  return { rotate: result.data.rotate, crop }
}

/** Whether an edit changes nothing — the whole picture, unturned. */
export function isIdentityEdit(edit: ImageEdit): boolean {
  if (edit.rotate !== 0) return false
  const crop = edit.crop
  return (
    crop === null ||
    (crop.x < EPSILON && crop.y < EPSILON && crop.width > 1 - EPSILON && crop.height > 1 - EPSILON)
  )
}

/** Where the untouched original of an edited asset is kept. Its existence is what "edited" means. */
export function originalCopyKey(id: string): string {
  return `media-originals/${id}/original`
}

/** The edit last applied, kept beside the original so a focal point can be carried back to it. */
export function lastEditKey(id: string): string {
  return `media-originals/${id}/edit.json`
}

function rotatePoint(point: FocalPoint, rotate: QuarterTurn): FocalPoint {
  switch (rotate) {
    case 90:
      return { x: 1 - point.y, y: point.x }
    case 180:
      return { x: 1 - point.x, y: 1 - point.y }
    case 270:
      return { x: point.y, y: 1 - point.x }
    default:
      return point
  }
}

const inverseTurn: Readonly<Record<QuarterTurn, QuarterTurn>> = { 0: 0, 90: 270, 180: 180, 270: 90 }

/** The focal point of the original, carried through `edit`; `null` when the crop leaves it out. */
export function focalThroughEdit(focal: FocalPoint | null, edit: ImageEdit): FocalPoint | null {
  if (focal === null) return null
  const turned = rotatePoint(focal, edit.rotate)
  const crop = edit.crop
  if (crop === null) return turned
  const x = (turned.x - crop.x) / crop.width
  const y = (turned.y - crop.y) / crop.height
  if (x < -EPSILON || x > 1 + EPSILON || y < -EPSILON || y > 1 + EPSILON) return null
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

/** The inverse: a focal point set on the edited picture, in the original's coordinates. */
export function focalBeforeEdit(focal: FocalPoint | null, edit: ImageEdit): FocalPoint | null {
  if (focal === null) return null
  const crop = edit.crop
  const uncropped =
    crop === null ? focal : { x: crop.x + focal.x * crop.width, y: crop.y + focal.y * crop.height }
  return rotatePoint(uncropped, inverseTurn[edit.rotate])
}

export function parseStoredEdit(raw: string): ImageEdit | null {
  try {
    return parseImageEdit(JSON.parse(raw))
  } catch {
    return null
  }
}
