import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  applyBasisPoints,
  assertCurrency,
  assertMinor,
  assertSameCurrency,
  distribute,
  formatMoney,
  minorUnitExponent,
} from '../src/money.js'

describe('money in minor units', () => {
  it('refuses a decimal amount rather than rounding it silently', () => {
    expect(() => assertMinor(12.5, 'A price')).toThrowError(/whole number of minor units/u)
  })

  it('refuses a negative amount, because a refund is its own record', () => {
    expect(() => assertMinor(-1, 'A price')).toThrowError(/cannot be negative/u)
  })

  it('refuses an amount too large for exact integer arithmetic', () => {
    expect(() => assertMinor(Number.MAX_SAFE_INTEGER + 2, 'A price')).toThrowError(/exactly/u)
  })

  it('accepts zero, because a free line is a line', () => {
    expect(assertMinor(0, 'A price')).toBe(0)
  })

  it('reports a currency mismatch as a mismatch, never as a conversion', () => {
    expect(() => assertSameCurrency('EUR', 'USD')).toThrowError(/Cannot combine EUR with USD/u)
    expect(assertSameCurrency('eur', 'EUR')).toBe('EUR')
  })

  it('refuses anything that is not a three-letter code', () => {
    expect(() => assertCurrency('euro')).toThrowError(/not a currency code/u)
    const thrown = ((): unknown => {
      try {
        assertCurrency('€')
        return null
      } catch (error) {
        return error
      }
    })()
    expect(isCogentaError(thrown) && thrown.code).toBe('COMMERCE_CURRENCY_INVALID')
  })

  it('knows the currencies whose minor unit is not a hundredth', () => {
    expect(minorUnitExponent('JPY')).toBe(0)
    expect(minorUnitExponent('KWD')).toBe(3)
    expect(minorUnitExponent('EUR')).toBe(2)
    expect(minorUnitExponent('xyz')).toBe(2)
  })
})

describe('applying a rate in basis points', () => {
  it('computes 20 % VAT on 19.99 as 4.00, not 3.998', () => {
    expect(applyBasisPoints(1999, 2000)).toBe(400)
  })

  it('rounds half up, the way an invoice does', () => {
    // 5 % of 0.10 is exactly 0.005 — half a cent, which becomes a cent.
    expect(applyBasisPoints(10, 500)).toBe(1)
  })

  it('never loses precision the way a float rate would', () => {
    // 0.1 + 0.2 style: 2000 basis points of 3 cents is 0.6, so 1 after rounding.
    expect(applyBasisPoints(3, 2000)).toBe(1)
    expect(applyBasisPoints(0, 2000)).toBe(0)
  })

  it('refuses a fractional rate, which is how a float sneaks back in', () => {
    expect(() => applyBasisPoints(100, 20.5)).toThrowError(/basis points/u)
  })
})

describe('distributing an amount over lines', () => {
  it('hands out every last minor unit, never one more or fewer', () => {
    const shares = distribute(100, [1, 1, 1])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100)
    expect(shares).toEqual([34, 33, 33])
  })

  it('gives the remainder to the largest weights first', () => {
    expect(distribute(10, [5, 3, 2])).toEqual([5, 3, 2])
    expect(distribute(7, [1, 1])).toEqual([4, 3])
  })

  it('returns zeroes rather than dividing by zero when nothing has weight', () => {
    expect(distribute(500, [0, 0])).toEqual([0, 0])
    expect(distribute(500, [])).toEqual([])
  })

  it('is exact on the case a naive per-line rounding gets wrong', () => {
    // Three lines, a one-cent discount: naive rounding gives 0, 0, 0.
    const shares = distribute(1, [100, 100, 100])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1)
  })
})

describe('formatting for a human', () => {
  it('shows a yen amount with no decimals and a euro amount with two', () => {
    expect(formatMoney({ amountMinor: 1999, currency: 'EUR' }, 'en-US')).toBe('€19.99')
    expect(formatMoney({ amountMinor: 1999, currency: 'JPY' }, 'en-US')).toBe('¥1,999')
  })
})
