import { describe, expect, it } from 'vitest'
import { isOnSale } from '../src/catalog/types.js'

/**
 * `isOnSale` (fiche 51 task 5) — pure, so tested directly rather than through
 * a database round trip: the promotion window's edge cases (open start, open
 * end, no compare-at price at all) are logic, not persistence.
 */
describe('isOnSale', () => {
  const now = new Date('2026-06-15T12:00:00.000Z')

  it('is never on sale without a compare-at price, whatever the dates say', () => {
    expect(
      isOnSale(
        { compareAtPriceMinor: null, saleStartsAt: '2020-01-01T00:00:00.000Z', saleEndsAt: null },
        now,
      ),
    ).toBe(false)
  })

  it('is on sale with a compare-at price and no schedule at all', () => {
    expect(isOnSale({ compareAtPriceMinor: 1999, saleStartsAt: null, saleEndsAt: null }, now)).toBe(
      true,
    )
  })

  it('is on sale with only an end date, before that date', () => {
    expect(
      isOnSale(
        { compareAtPriceMinor: 1999, saleStartsAt: null, saleEndsAt: '2026-12-31T00:00:00.000Z' },
        now,
      ),
    ).toBe(true)
  })

  it('is not on sale once the end date has passed', () => {
    expect(
      isOnSale(
        { compareAtPriceMinor: 1999, saleStartsAt: null, saleEndsAt: '2026-01-01T00:00:00.000Z' },
        now,
      ),
    ).toBe(false)
  })

  it('is on sale with only a start date, after that date — an open-ended sale', () => {
    expect(
      isOnSale(
        { compareAtPriceMinor: 1999, saleStartsAt: '2026-01-01T00:00:00.000Z', saleEndsAt: null },
        now,
      ),
    ).toBe(true)
  })

  it('is not on sale before its own start date', () => {
    expect(
      isOnSale(
        { compareAtPriceMinor: 1999, saleStartsAt: '2026-12-01T00:00:00.000Z', saleEndsAt: null },
        now,
      ),
    ).toBe(false)
  })

  it('is on sale exactly inside a closed window', () => {
    expect(
      isOnSale(
        {
          compareAtPriceMinor: 1999,
          saleStartsAt: '2026-06-01T00:00:00.000Z',
          saleEndsAt: '2026-06-30T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(true)
  })
})
