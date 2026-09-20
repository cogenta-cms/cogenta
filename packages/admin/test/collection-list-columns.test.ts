import { describe, expect, it } from 'vitest'
import { renderFieldValue } from '../src/routes/collection-list.js'
import type { SchemaField } from '../src/schema/types.js'

const formatDate = (iso: string): string => `formatted(${iso})`
const t = (key: string): string => (key === 'common.yes' ? 'Oui' : 'Non')

function field(kind: SchemaField['kind'], name = 'f'): SchemaField {
  return {
    name,
    kind,
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: {},
  } as SchemaField
}

/**
 * An added column used to print whatever the value happened to be, with no
 * idea what kind of field it came from — so a date arrived as
 * `2026-08-30T07:00:00.000Z` two cells away from a "Modifié" column reading
 * "30 août 2026, 09:00", and a rich text body arrived as its Portable Text
 * JSON.
 */
describe('renderFieldValue', () => {
  it('formats a date the same way the rest of the table does', () => {
    expect(renderFieldValue('2026-08-30T07:00:00.000Z', field('datetime'), formatDate, t)).toBe(
      'formatted(2026-08-30T07:00:00.000Z)',
    )
    expect(renderFieldValue('2026-08-30', field('date'), formatDate, t)).toBe(
      'formatted(2026-08-30)',
    )
  })

  it('reads rich text as its text, not as its JSON', () => {
    const body = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 's1', _type: 'span', text: 'Une phrase lisible.', marks: [] }],
      },
    ]
    const shown = renderFieldValue(body, field('richText'), formatDate, t)
    expect(shown).toBe('Une phrase lisible.')
    expect(shown).not.toContain('_type')
  })

  it('says yes or no rather than true or false', () => {
    expect(renderFieldValue(true, field('boolean'), formatDate, t)).toBe('Oui')
    expect(renderFieldValue(false, field('boolean'), formatDate, t)).toBe('Non')
  })

  it('still shows an em dash for nothing at all', () => {
    expect(renderFieldValue(null, field('text'), formatDate, t)).toBe('—')
    expect(renderFieldValue('', field('richText'), formatDate, t)).toBe('—')
  })

  it('leaves a value alone when no field describes it', () => {
    expect(renderFieldValue('plain', undefined, formatDate, t)).toBe('plain')
  })
})
