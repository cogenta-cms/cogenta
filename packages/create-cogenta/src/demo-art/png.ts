import { deflateSync } from 'node:zlib'

/**
 * A minimal PNG encoder — the whole reason `demo-art` exists as zero
 * dependency (D1, `docs/lots/L25-templates-pro.md`). Real photos and SVG
 * (ADR-0017) were both ruled out; this is what is left: encode the RGB
 * canvas `render.ts` produces into a real PNG file `sniffImageFormat`
 * recognises and `wasm-vips` can decode, using nothing beyond `node:zlib`
 * (already a Node built-in — R9/R10, no new dependency, no native code).
 *
 * Deliberately narrow: 8-bit RGB (colour type 2), filter type 0 (`None`) on
 * every scanline, a single IDAT chunk. No palette, no alpha, no
 * interlacing — none of that is needed for an opaque procedural
 * composition, and every byte of complexity not needed is a byte of bug
 * surface not worth carrying.
 */

/** The eight fixed bytes every valid PNG begins with. */
export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// The standard CRC-32 (ISO 3309 / ITU-T V.42) table PNG's own spec mandates
// for every chunk — same polynomial `zlib.crc32`-equivalent code everywhere
// uses, computed once, at module load.
const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] as number
    const tableEntry = CRC_TABLE[(crc ^ byte) & 0xff] as number
    crc = tableEntry ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint32BE(value: number, into: Uint8Array, at: number): void {
  into[at] = (value >>> 24) & 0xff
  into[at + 1] = (value >>> 16) & 0xff
  into[at + 2] = (value >>> 8) & 0xff
  into[at + 3] = value & 0xff
}

/** One length-prefixed, type-tagged, CRC-suffixed PNG chunk. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i)

  const typeAndData = new Uint8Array(4 + data.length)
  typeAndData.set(typeBytes, 0)
  typeAndData.set(data, 4)

  const out = new Uint8Array(4 + typeAndData.length + 4)
  writeUint32BE(data.length, out, 0)
  out.set(typeAndData, 4)
  writeUint32BE(crc32(typeAndData), out, 4 + typeAndData.length)
  return out
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of chunks) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Encodes an 8-bit RGB canvas (`width * height * 3` bytes, row-major, no
 * padding) as a PNG file. Every scanline is prefixed with filter type `0`
 * (`None`) — the simplest legal choice, and the raw data still deflates well
 * for the soft, low-frequency gradients and shapes `render.ts` produces.
 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError(
      `encodePng: width and height must be positive integers, got ${width}x${height}`,
    )
  }
  const expected = width * height * 3
  if (rgb.length !== expected) {
    throw new RangeError(
      `encodePng: expected ${expected} RGB bytes for ${width}x${height}, got ${rgb.length}`,
    )
  }

  const stride = width * 3
  // One extra byte per row for the filter-type prefix (`0` = None).
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    raw.set(rgb.subarray(y * stride, y * stride + stride), rowStart + 1)
  }

  const ihdr = new Uint8Array(13)
  writeUint32BE(width, ihdr, 0)
  writeUint32BE(height, ihdr, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  ihdr[10] = 0 // compression method
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace method: none

  const idatData = deflateSync(raw, { level: 6 })

  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', new Uint8Array(0)),
  ])
}
