import { describe, expect, it } from 'vitest'
import { encodeQr, QrTooLongError } from '../src/lib/qr-encode.js'

describe('encodeQr', () => {
  it('picks the smallest version that holds the text (21 modules for a short one)', () => {
    expect(encodeQr('hello')).toHaveLength(21)
  })

  it('grows with the text', () => {
    expect(encodeQr('x'.repeat(150)).length).toBeGreaterThan(41)
  })

  it('draws the three finder patterns in the corners', () => {
    const rows = encodeQr('otpauth://totp/Cogenta:me@example.test?secret=JBSWY3DPEHPK3PXP')
    const last = rows.length - 1
    for (const [x, y] of [
      [0, 0],
      [last - 6, 0],
      [0, last - 6],
    ] as const) {
      // 7×7 ring, light ring, 3×3 core.
      expect(rows[y]?.[x]).toBe(true)
      expect(rows[y + 6]?.[x + 6]).toBe(true)
      expect(rows[y + 1]?.[x + 1]).toBe(false)
      expect(rows[y + 3]?.[x + 3]).toBe(true)
    }
  })

  it('refuses text beyond its capacity rather than drawing a broken code', () => {
    expect(() => encodeQr('z'.repeat(214))).toThrow(QrTooLongError)
  })
})
