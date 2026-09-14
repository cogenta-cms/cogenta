import { describe, expect, it } from 'vitest'
import { eventTimeOf, factsOf, hoursOf } from '../src/render/details.js'
import { giftsOf, isBreakdown, shareOf } from '../src/render/figures.js'

describe('reading an event’s time', () => {
  it('takes the start from the usual field names', () => {
    for (const name of ['startsAt', 'start', 'date', 'eventDate']) {
      expect(eventTimeOf({ [name]: '2026-10-22T18:30:00.000Z' })?.start.iso, name).toBe(
        '2026-10-22T18:30:00.000Z',
      )
    }
  })

  it('ignores anything that is not a date, and an end before the start', () => {
    expect(eventTimeOf({ date: 'next Thursday' })).toBeUndefined()
    expect(eventTimeOf({ date: 42 })).toBeUndefined()
    expect(
      eventTimeOf({ date: '2026-10-22T18:30:00.000Z', endsAt: '2026-10-21T10:00:00.000Z' })?.end,
    ).toBeUndefined()
  })

  it('writes the hours in UTC, the time the editor typed, whatever the server’s zone', () => {
    const time = eventTimeOf({
      date: '2026-10-22T18:30:00.000Z',
      endsAt: '2026-10-22T22:00:00.000Z',
    })
    expect(time && hoursOf(time, 'en')).toBe('6:30 PM to 10:00 PM')
    expect(time && hoursOf(time, 'fr')).toBe('de 18:30 à 22:00')
  })

  it('writes no hours for a bare date', () => {
    const time = eventTimeOf({ date: '2026-10-22' })
    expect(time?.start.hasTime).toBe(false)
    expect(time && hoursOf(time, 'en')).toBeUndefined()
  })
})

describe('the practical details', () => {
  it('lists only what the entry says, in the order a visitor looks for it', () => {
    const facts = factsOf(
      { cost: 'Free', location: 'The Old Library', schedule: 'Thursdays', audience: 'Anyone' },
      'en',
    )
    expect(facts.map((fact) => fact.key)).toEqual(['when', 'where', 'audience', 'cost'])
  })

  it('links a contact that is an email address or a telephone number, and nothing else', () => {
    expect(factsOf({ contact: 'hello@commonground.org.uk' }, 'en')[0]?.href).toBe(
      'mailto:hello@commonground.org.uk',
    )
    expect(factsOf({ contact: '01632 960418' }, 'en')[0]?.href).toBe('tel:01632960418')
    expect(factsOf({ contact: 'Ask at the desk' }, 'en')[0]?.href).toBeUndefined()
  })

  it('names an address on its own as an address', () => {
    expect(factsOf({ address: '220 Elm Street' }, 'en')[0]?.label).toBe('Address')
  })
})

describe('shares of a whole', () => {
  it('reads a percentage with its sign in the value or in the unit', () => {
    expect(shareOf('38%', undefined)).toBe(38)
    expect(shareOf('38', '%')).toBe(38)
    expect(shareOf('12,5 %', undefined)).toBe(12.5)
    expect(shareOf('£38', undefined)).toBeUndefined()
  })

  it('takes percentages for a breakdown only when they add up to a whole', () => {
    expect(isBreakdown([{ value: '60%' }, { value: '41%' }])).toBe(true)
    expect(isBreakdown([{ value: '60%' }, { value: '20%' }])).toBe(false)
    expect(isBreakdown([{ value: '100%' }])).toBe(false)
    expect(isBreakdown([{ value: '60%' }, { value: '40' }])).toBe(false)
  })
})

describe('what a gift pays for', () => {
  it('finds consecutive sentences that start with an amount, with the text around them', () => {
    const list = giftsOf(
      'We plan ahead. £5 a month buys bread. €12 pays for vegetables. Thank you.',
    )
    expect(list).toEqual({
      lead: 'We plan ahead.',
      gifts: [
        { amount: '£5 a month', text: 'buys bread.' },
        { amount: '€12', text: 'pays for vegetables.' },
      ],
      tail: 'Thank you.',
    })
  })

  it('leaves a text with one amount or none as a paragraph', () => {
    expect(giftsOf('£5 buys bread for one Thursday.')).toBeUndefined()
    expect(giftsOf('Our coordinator answers every message.')).toBeUndefined()
    expect(giftsOf(undefined)).toBeUndefined()
  })
})
