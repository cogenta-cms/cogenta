import { createPng } from './png.js'

/**
 * Every image the suite uses is painted here, at run time.
 *
 * Nothing binary is committed: a fixture whose content nobody can read is a
 * fixture nobody can reason about, and "the crop kept the red quadrant" is only
 * an assertion if something in the repository says where the red is.
 */

export const PALETTE = {
  red: [220, 30, 30],
  green: [30, 200, 30],
  blue: [30, 30, 220],
  yellow: [230, 220, 40],
} as const satisfies Record<string, readonly [number, number, number]>

/**
 * Four flat quadrants — red, green, blue, yellow, clockwise from top left.
 *
 * Flat on purpose, because every resampling filter leaves a flat area flat: the colour
 * that comes back names the region that survived the crop, whatever the codec
 * did in between.
 */
export function quadrantPng(size = 400): Uint8Array {
  return createPng(size, size, (x, y) => {
    const half = size / 2
    const colour =
      y < half ? (x < half ? PALETTE.red : PALETTE.green) : x < half ? PALETTE.blue : PALETTE.yellow
    return [colour[0], colour[1], colour[2], 255]
  })
}

/** A landscape gradient: enough detail that a resize has something to lose. */
export function gradientPng(width = 800, height = 600): Uint8Array {
  return createPng(width, height, (x, y) => [
    Math.round((x / width) * 255),
    Math.round((y / height) * 255),
    128,
    255,
  ])
}

/** Half transparent, so that "what happens on the way to JPEG" is observable. */
export function transparentPng(width = 200, height = 200): Uint8Array {
  return createPng(width, height, (x) => (x < width / 2 ? [10, 10, 10, 255] : [10, 10, 10, 0]))
}

/**
 * Big enough that libvips works in tiles rather than in one buffer, which is the
 * path a real hero image takes and the one a naive implementation gets wrong.
 */
export function largePng(): Uint8Array {
  return gradientPng(2400, 1600)
}

/** A PNG header followed by nonsense: announces a format it cannot deliver. */
export function corruptPng(): Uint8Array {
  const bytes = new Uint8Array(512)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (let index = 8; index < bytes.length; index += 1) bytes[index] = (index * 37) % 251
  return bytes
}

/** A real PNG with its second half missing — the classic interrupted upload. */
export function truncatedPng(): Uint8Array {
  const whole = gradientPng(300, 300)
  return whole.subarray(0, Math.floor(whole.length / 2))
}

/** A format Cogenta refuses rather than resizes. */
export function gifBytes(): Uint8Array {
  const header = [...'GIF89a'].map((character) => character.charCodeAt(0))
  return Uint8Array.from([...header, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00])
}
