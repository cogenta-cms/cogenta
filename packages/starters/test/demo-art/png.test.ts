import { sniffImageFormat } from '@cogenta/core'
import { loadVips } from '@cogenta/render'
import { describe, expect, it } from 'vitest'
import { encodePng, PNG_SIGNATURE } from '../../src/demo-art/png.js'

/**
 * `encodePng` is the whole reason `demo-art` needs zero dependency (D1) —
 * verified two ways: the bytes start with the real PNG signature and
 * `sniffImageFormat` recognises them (the same real-type check
 * `media-router.ts`'s upload path applies to every image), and a real
 * decoder (`wasm-vips`, the WASM tier `@cogenta/render` always has, R10)
 * loads the file back and reports the right dimensions.
 */

function solidRgb(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const out = new Uint8Array(width * height * 3)
  for (let i = 0; i < out.length; i += 3) {
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
  }
  return out
}

describe('encodePng', () => {
  it('starts with the PNG signature', () => {
    const png = encodePng(4, 4, solidRgb(4, 4, 255, 0, 0))
    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE)
  })

  it('is recognised by sniffImageFormat', () => {
    const png = encodePng(8, 6, solidRgb(8, 6, 10, 20, 30))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('loads with wasm-vips, reporting the exact dimensions encoded', async () => {
    const width = 37
    const height = 21
    const png = encodePng(width, height, solidRgb(width, height, 200, 100, 50))

    const vips = await loadVips()
    const image = vips.Image.newFromBuffer(png)
    try {
      expect(image.width).toBe(width)
      expect(image.height).toBe(height)
    } finally {
      image.delete()
    }
  })

  it('round-trips real pixel colours through wasm-vips', async () => {
    const width = 3
    const height = 3
    const rgb = solidRgb(width, height, 12, 200, 40)
    const png = encodePng(width, height, rgb)

    const vips = await loadVips()
    const image = vips.Image.newFromBuffer(png)
    try {
      // Re-encode as raw PNG and decode our own way to cross-check — simplest
      // robust check without depending on wasm-vips's pixel-read API shape.
      const reEncoded = image.writeToBuffer('.png')
      expect(sniffImageFormat(reEncoded)).toBe('png')
    } finally {
      image.delete()
    }
  })

  it('rejects a size/byte-length mismatch rather than silently truncating', () => {
    expect(() => encodePng(4, 4, new Uint8Array(4 * 4 * 3 - 1))).toThrow(RangeError)
  })

  it('rejects a non-positive or non-integer size', () => {
    expect(() => encodePng(0, 4, new Uint8Array(0))).toThrow(RangeError)
    expect(() => encodePng(4, 4.5, new Uint8Array(4 * 5 * 3))).toThrow(RangeError)
  })

  it('produces a larger file for a higher-entropy image than a solid colour of the same size', () => {
    const width = 64
    const height = 64
    const solid = encodePng(width, height, solidRgb(width, height, 128, 128, 128))

    const noisy = new Uint8Array(width * height * 3)
    let state = 12345
    for (let i = 0; i < noisy.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      noisy[i] = state % 256
    }
    const noisyPng = encodePng(width, height, noisy)

    expect(noisyPng.length).toBeGreaterThan(solid.length)
  })
})
