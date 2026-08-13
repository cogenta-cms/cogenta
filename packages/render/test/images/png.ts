import { deflateSync, inflateSync } from 'node:zlib'

/**
 * A PNG codec for the tests, in about a hundred lines and with no dependency.
 *
 * The tests need *real* images — the project forbids mocking what it is testing,
 * and a hand-written byte array is not an image — but committing binary fixtures
 * would leave nobody able to say what is in them. Generating them means every
 * expectation in the suite ("the crop kept the red quadrant") is checkable
 * against the code that painted it.
 *
 * The decoder exists for the same reason: proving a focal crop kept the right
 * part of the picture means looking at the pixels that came back, and doing that
 * with the driver under test would be proving the driver with itself.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i += 1) body[i] = type.charCodeAt(i)
  body.set(data, 4)

  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(body, 4)
  view.setUint32(8 + data.length, crc32(body))
  return out
}

export type Painter = (x: number, y: number) => readonly [number, number, number, number]

/** RGBA pixels, row-major, four bytes per pixel. */
export function paint(width: number, height: number, painter: Painter): Uint8Array {
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = painter(x, y)
      const offset = (y * width + x) * 4
      pixels[offset] = r
      pixels[offset + 1] = g
      pixels[offset + 2] = b
      pixels[offset + 3] = a
    }
  }
  return pixels
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA

  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    // Level 1: these are test fixtures, and a 2400x1600 image at level 9 costs
    // more wall-clock time than the transform the test is actually measuring.
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 1 }))),
    chunk('IEND', new Uint8Array(0)),
  ]

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const png = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

export function createPng(width: number, height: number, painter: Painter): Uint8Array {
  return encodePng(width, height, paint(width, height, painter))
}

export interface DecodedPng {
  readonly width: number
  readonly height: number
  /** Always RGBA, whatever the file's colour type. */
  readonly pixels: Uint8Array
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  let colourType = 6
  let depth = 8
  const idat: Uint8Array[] = []

  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      depth = data[8] ?? 8
      colourType = data[9] ?? 6
    }
    if (type === 'IDAT') idat.push(data)
    if (type === 'IEND') break

    offset += 12 + length
  }

  const channels = CHANNELS[colourType]
  if (channels === undefined || depth !== 8) {
    throw new Error(`Unsupported PNG: colour type ${colourType}, depth ${depth}`)
  }

  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((part) => Buffer.from(part)))))
  const stride = width * channels
  const lines = new Uint8Array(height * stride)

  let read = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read] ?? 0
    read += 1
    for (let i = 0; i < stride; i += 1) {
      const value = raw[read + i] ?? 0
      const left = i >= channels ? (lines[y * stride + i - channels] ?? 0) : 0
      const up = y > 0 ? (lines[(y - 1) * stride + i] ?? 0) : 0
      const upLeft = y > 0 && i >= channels ? (lines[(y - 1) * stride + i - channels] ?? 0) : 0

      const restored =
        filter === 0
          ? value
          : filter === 1
            ? value + left
            : filter === 2
              ? value + up
              : filter === 3
                ? value + ((left + up) >> 1)
                : value + paeth(left, up, upLeft)
      lines[y * stride + i] = restored & 0xff
    }
    read += stride
  }

  const pixels = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const source = index * channels
    const target = index * 4
    const grey = lines[source] ?? 0
    if (channels <= 2) {
      pixels[target] = grey
      pixels[target + 1] = grey
      pixels[target + 2] = grey
      pixels[target + 3] = channels === 2 ? (lines[source + 1] ?? 255) : 255
    } else {
      pixels[target] = lines[source] ?? 0
      pixels[target + 1] = lines[source + 1] ?? 0
      pixels[target + 2] = lines[source + 2] ?? 0
      pixels[target + 3] = channels === 4 ? (lines[source + 3] ?? 255) : 255
    }
  }

  return { width, height, pixels }
}

export interface Region {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Mean RGB of a region. Resampling blurs edges, averages survive it. */
export function averageColour(image: DecodedPng, region?: Region): [number, number, number] {
  const area = region ?? { left: 0, top: 0, width: image.width, height: image.height }
  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let y = area.top; y < area.top + area.height; y += 1) {
    for (let x = area.left; x < area.left + area.width; x += 1) {
      const offset = (y * image.width + x) * 4
      r += image.pixels[offset] ?? 0
      g += image.pixels[offset + 1] ?? 0
      b += image.pixels[offset + 2] ?? 0
      count += 1
    }
  }

  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

/** Which of the named colours a measured one is closest to. */
export function nearestName(
  measured: readonly [number, number, number],
  palette: Readonly<Record<string, readonly [number, number, number]>>,
): string {
  let best = ''
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [name, colour] of Object.entries(palette)) {
    const distance = colour.reduce(
      (sum, channel, index) => sum + ((measured[index] ?? 0) - channel) ** 2,
      0,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}
