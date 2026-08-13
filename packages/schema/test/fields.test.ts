import { describe, expect, it } from 'vitest'
import { f, MEDIA_ACCEPT_KINDS } from '../src/fields.js'
import { newId } from '../src/id.js'
import { fieldSchema } from '../src/validation.js'

/** A valid rich text document, reused by several cases. */
const document = [
  {
    _key: 'a',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'a1', _type: 'span', text: 'Hello', marks: [] }],
    markDefs: [],
  },
]

describe('field constructors', () => {
  it('records the kind of every field type of the contract', () => {
    expect(f.text().kind).toBe('text')
    expect(f.richText().kind).toBe('richText')
    expect(f.slug().kind).toBe('slug')
    expect(f.number().kind).toBe('number')
    expect(f.boolean().kind).toBe('boolean')
    expect(f.date().kind).toBe('date')
    expect(f.datetime().kind).toBe('datetime')
    expect(f.media().kind).toBe('media')
    expect(f.relation({ to: 'author' }).kind).toBe('relation')
    expect(f.select({ options: ['a'] }).kind).toBe('select')
    expect(f.json().kind).toBe('json')
    expect(f.geo().kind).toBe('geo')
    expect(f.color().kind).toBe('color')
    expect(f.blocks().kind).toBe('blocks')
  })

  it('keeps the options the author gave and omits the ones they did not', () => {
    const field = f.text({ max: 200, required: true })

    expect(field.options).toEqual({ max: 200 })
    expect(field.required).toBe(true)
    expect('localized' in field).toBe(false)
  })

  it('defaults a relation to restrict, so deleting an author cannot erase articles', () => {
    expect(f.relation({ to: 'author' }).options.onDelete).toBe('restrict')
  })

  it('keeps an explicit onDelete', () => {
    expect(f.relation({ to: 'tag', onDelete: 'cascade' }).options.onDelete).toBe('cascade')
  })

  it('accepts every kind of media unless the author narrows it', () => {
    expect(f.media().options.accept).toEqual(MEDIA_ACCEPT_KINDS)
    expect(f.media({ accept: ['image'] }).options.accept).toEqual(['image'])
  })

  it('widens bare select options into value/label choices', () => {
    expect(
      f.select({ options: ['draft', { value: 'live', label: 'Live' }] }).options.options,
    ).toEqual([{ value: 'draft' }, { value: 'live', label: 'Live' }])
  })

  it('allows the whole block vocabulary unless the author restricts it', () => {
    expect(f.blocks().options.allow).toBe('*')
    expect(f.blocks({ allow: ['hero'] }).options.allow).toEqual(['hero'])
  })

  it('treats localized as admin metadata, leaving the field otherwise untouched', () => {
    const field = f.text({ localized: true })

    expect(field.localized).toBe(true)
    expect(field.options).toEqual({})
  })
})

describe('field validation — accepted values', () => {
  it.each([
    ['text', f.text({ required: true, max: 5 }), 'short'],
    ['richText', f.richText({ required: true }), document],
    ['slug', f.slug({ required: true }), 'hello-world-2'],
    ['number', f.number({ required: true, min: 1 }), 3.5],
    ['boolean', f.boolean({ required: true }), false],
    ['date', f.date({ required: true }), '2026-08-13'],
    ['datetime', f.datetime({ required: true }), '2026-08-13T10:00:00Z'],
    ['media', f.media({ required: true }), newId()],
    ['relation', f.relation({ to: 'author', required: true }), newId()],
    ['select', f.select({ options: ['a', 'b'], required: true }), 'b'],
    ['json', f.json({ required: true }), { nested: [1, 'two', true, null] }],
    ['geo', f.geo({ required: true }), { lat: 48.85, lng: 2.35 }],
    ['color', f.color({ required: true }), '#1a2b3c'],
    ['blocks', f.blocks({ required: true }), [{ _key: 'k1', _type: 'hero', title: 'Hi' }]],
  ])('accepts a valid %s value', (_kind, field, value) => {
    expect(fieldSchema(field).safeParse(value).success).toBe(true)
  })
})

describe('field validation — rejected values', () => {
  it.each([
    ['text over its maximum length', f.text({ required: true, max: 3 }), 'toolong'],
    [
      'rich text using h1, which the contract excludes',
      f.richText({ required: true }),
      [{ _key: 'a', _type: 'block', style: 'h1', children: [], markDefs: [] }],
    ],
    ['rich text holding HTML instead of a document', f.richText({ required: true }), '<p>no</p>'],
    ['a slug with spaces', f.slug({ required: true }), 'not a slug'],
    ['a slug in capitals', f.slug({ required: true }), 'Not-A-Slug'],
    ['a fractional integer', f.number({ required: true, integer: true }), 1.5],
    ['a number below its minimum', f.number({ required: true, min: 10 }), 9],
    ['a date carrying a time', f.date({ required: true }), '2026-08-13T10:00:00Z'],
    ['a datetime without an offset', f.datetime({ required: true }), '2026-08-13 10:00'],
    ['a media reference that is not an id', f.media({ required: true }), 'cover.jpg'],
    ['a choice outside the declared options', f.select({ options: ['a'], required: true }), 'z'],
    ['a value JSON cannot represent', f.json({ required: true }), { when: undefined }],
    ['a latitude off the globe', f.geo({ required: true }), { lat: 120, lng: 0 }],
    ['a colour that is not hex', f.color({ required: true }), 'rebeccapurple'],
    ['a block without a stable key', f.blocks({ required: true }), [{ _type: 'hero' }]],
    [
      'a block outside the allowed list',
      f.blocks({ required: true, allow: ['hero'] }),
      [{ _key: 'k1', _type: 'gallery' }],
    ],
  ])('rejects %s', (_case, field, value) => {
    expect(fieldSchema(field).safeParse(value).success).toBe(false)
  })

  it('reports the custom validate message as the reason for the refusal', () => {
    const field = f.text({
      required: true,
      validate: (value) => (String(value).startsWith('C') ? true : 'must start with a C'),
    })

    const result = fieldSchema(field).safeParse('nope')

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('must start with a C')
  })
})

describe('field validation — optionality', () => {
  it('refuses an absent value on a required field', () => {
    expect(fieldSchema(f.text({ required: true })).safeParse(undefined).success).toBe(false)
  })

  it('normalises an absent optional value to null', () => {
    expect(fieldSchema(f.text()).parse(undefined)).toBeNull()
    expect(fieldSchema(f.text()).parse(null)).toBeNull()
  })

  it('normalises an absent to-many value to an empty list, never null', () => {
    expect(fieldSchema(f.relation({ to: 'tag', many: true })).parse(undefined)).toEqual([])
    expect(fieldSchema(f.blocks()).parse(null)).toEqual([])
  })

  it('reads required on a to-many field as at least one value', () => {
    const field = f.relation({ to: 'tag', many: true, required: true })

    expect(fieldSchema(field).safeParse([]).success).toBe(false)
    expect(fieldSchema(field).safeParse([newId()]).success).toBe(true)
  })
})
