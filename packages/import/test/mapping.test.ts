import { CogentaError } from '@cogenta/core'
import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { proposeFieldMapping, resolveMapping } from '../src/mapping.js'

const note = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.text({ multiline: true }),
  },
  permissions: { read: ['public'], create: ['admin'], update: ['admin'], delete: ['admin'] },
})

describe('proposeFieldMapping', () => {
  it('matches source headers to target fields case-insensitively', () => {
    const mapping = proposeFieldMapping(['Title', 'BODY', 'Author'], note)
    expect(mapping).toEqual({
      targetCollection: 'note',
      fields: { Title: 'title', BODY: 'body', Author: null },
    })
  })
})

describe('resolveMapping', () => {
  it('resolves a valid mapping into a source→target map, ignored fields set aside', () => {
    const resolved = resolveMapping(
      { targetCollection: 'note', fields: { Title: 'title', Author: null } },
      [note],
    )
    expect(resolved.collection.name).toBe('note')
    expect(resolved.fields.get('Title')).toBe('title')
    expect(resolved.ignored).toEqual(['Author'])
  })

  it('refuses a mapping naming a collection the site does not declare', () => {
    expect(() => resolveMapping({ targetCollection: 'ghost', fields: {} }, [note])).toThrow(
      CogentaError,
    )
  })

  it('refuses a mapping pointing at a field the target collection does not declare', () => {
    expect(() =>
      resolveMapping({ targetCollection: 'note', fields: { x: 'not_a_real_field' } }, [note]),
    ).toThrow(CogentaError)
  })
})
