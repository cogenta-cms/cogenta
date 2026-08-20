import { describe, expect, it } from 'vitest'
import { defineCollection } from '../src/define-collection.js'
import { f } from '../src/fields.js'
import { newId } from '../src/id.js'
import {
  isSystemFieldName,
  SYSTEM_FIELD_DESCRIPTORS,
  SYSTEM_FIELD_NAMES,
  systemFieldsSchema,
} from '../src/system-fields.js'
import { collectionEntrySchema, collectionInputSchema } from '../src/validation.js'

const page = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: { title: f.text({ required: true }) },
  permissions: { read: ['public'] },
})

function systemValues(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: newId(),
    createdAt: '2026-08-13T10:00:00Z',
    updatedAt: '2026-08-13T10:00:00Z',
    createdBy: null,
    updatedBy: null,
    status: 'draft',
    deletedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    locale: 'fr',
    translationOf: null,
    version: 1,
    provenance: 'human',
    provenanceDetail: null,
    ...overrides,
  }
}

describe('system fields', () => {
  it('declares the fourteen fields of the contract, in the order the contract lists them', () => {
    expect(SYSTEM_FIELD_NAMES).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'status',
      'deletedAt',
      'reviewState',
      'assignedReviewer',
      'locale',
      'translationOf',
      'version',
      'provenance',
      'provenanceDetail',
    ])
  })

  it('keeps reviewState orthogonal to status rather than adding a status value (`schema@2.1`, ADR-0027)', () => {
    expect(SYSTEM_FIELD_NAMES).toContain('reviewState')
    const pendingButDraft = systemValues({ status: 'draft', reviewState: 'pending' })
    expect(systemFieldsSchema.safeParse(pendingButDraft).success).toBe(true)
    expect(systemFieldsSchema.safeParse(systemValues({ status: 'pending' })).success).toBe(false)
    expect(systemFieldsSchema.safeParse(systemValues({ reviewState: 'submitted' })).success).toBe(
      false,
    )
  })

  it('keeps deletedAt orthogonal to status rather than adding a status value', () => {
    // ADR-0022's central design point, asserted rather than assumed: a trashed
    // entry remembers what it was, and no `switch` on ContentStatus silently
    // grew a case it does not handle.
    expect(SYSTEM_FIELD_NAMES).toContain('deletedAt')
    const trashedButPublished = systemValues({
      status: 'published',
      deletedAt: '2026-08-16T10:00:00Z',
    })
    expect(systemFieldsSchema.safeParse(trashedButPublished).success).toBe(true)
    expect(systemFieldsSchema.safeParse(systemValues({ status: 'trashed' })).success).toBe(false)
  })

  it('describes every system field for the admin, and none that does not exist', () => {
    expect(SYSTEM_FIELD_DESCRIPTORS.map((descriptor) => descriptor.name)).toEqual([
      ...SYSTEM_FIELD_NAMES,
    ])
    expect(SYSTEM_FIELD_DESCRIPTORS.every((descriptor) => descriptor.readOnly)).toBe(true)
  })

  it('recognises a system name, and only a system name', () => {
    expect(isSystemFieldName('provenance')).toBe(true)
    expect(isSystemFieldName('title')).toBe(false)
  })

  it('requires provenance on every entry — it is never optional', () => {
    const withoutProvenance = systemValues()
    delete withoutProvenance.provenance

    expect(systemFieldsSchema.safeParse(withoutProvenance).success).toBe(false)
    expect(systemFieldsSchema.safeParse(systemValues({ provenance: null })).success).toBe(false)
  })

  it('accepts the three provenance values and nothing else', () => {
    for (const value of ['human', 'assisted', 'generated']) {
      expect(systemFieldsSchema.safeParse(systemValues({ provenance: value })).success).toBe(true)
    }
    expect(systemFieldsSchema.safeParse(systemValues({ provenance: 'robot' })).success).toBe(false)
  })

  it('records who generated a piece of content, when provenance is not human', () => {
    const parsed = systemFieldsSchema.parse(
      systemValues({
        provenance: 'generated',
        provenanceDetail: { agent: 'editor', model: 'local', at: '2026-08-13T10:00:00Z' },
      }),
    )

    expect(parsed.provenanceDetail?.agent).toBe('editor')
  })

  it('accepts a translation pointing at its source entry', () => {
    const source = newId()
    const parsed = systemFieldsSchema.parse(systemValues({ locale: 'en', translationOf: source }))

    expect(parsed.translationOf).toBe(source)
  })

  it('refuses a status outside the four of the contract', () => {
    expect(systemFieldsSchema.safeParse(systemValues({ status: 'pending' })).success).toBe(false)
  })
})

describe('system fields on a collection', () => {
  it('adds them to every entry, without the collection declaring anything', () => {
    const entry = collectionEntrySchema(page).parse({ ...systemValues(), title: 'Hello' })

    expect(entry).toMatchObject({ title: 'Hello', provenance: 'human', version: 1 })
  })

  it('refuses an entry missing its system fields', () => {
    expect(collectionEntrySchema(page).safeParse({ title: 'Hello' }).success).toBe(false)
  })

  it('keeps them out of what an author may send, since the runtime owns them', () => {
    const input = collectionInputSchema(page)

    expect(input.safeParse({ title: 'Hello' }).success).toBe(true)
    expect(input.safeParse({ title: 'Hello', status: 'published' }).success).toBe(false)
  })

  it('refuses an unknown key rather than dropping the editor’s work in silence', () => {
    expect(collectionInputSchema(page).safeParse({ title: 'Hello', titel: 'typo' }).success).toBe(
      false,
    )
  })
})
