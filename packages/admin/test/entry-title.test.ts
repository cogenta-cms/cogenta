import { describe, expect, it } from 'vitest'
import { titleOf } from '../src/lib/entry-title.js'
import type { CollectionSummary, SchemaField } from '../src/schema/types.js'

/**
 * Fiche 01 ("Liste de contenu"), task 1: `titleOf` is the one place an
 * entry's display title is derived. Five shapes of collection, per the
 * fiche's own test list — including the one with no declared `text` field
 * at all.
 */

function field(name: string, kind: SchemaField['kind']): SchemaField {
  return {
    name,
    kind,
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: {},
  }
}

function collection(fields: readonly SchemaField[]): Pick<CollectionSummary, 'fields'> {
  return { fields }
}

describe('titleOf', () => {
  it('prefers a declared "title" field over one that merely comes first', () => {
    const target = collection([field('internalCode', 'text'), field('title', 'text')])
    const entry = { id: 'entry-1', values: { internalCode: 'SKU-001', title: 'Real title' } }

    expect(titleOf(entry, target)).toBe('Real title')
  })

  it('falls back to "name" when there is no "title" field', () => {
    const target = collection([field('internalCode', 'text'), field('name', 'text')])
    const entry = { id: 'entry-1', values: { internalCode: 'SKU-001', name: 'Wool jumper' } }

    expect(titleOf(entry, target)).toBe('Wool jumper')
  })

  it('falls back to "label" when there is neither "title" nor "name"', () => {
    const target = collection([field('internalCode', 'text'), field('label', 'text')])
    const entry = { id: 'entry-1', values: { internalCode: 'SKU-001', label: 'A label' } }

    expect(titleOf(entry, target)).toBe('A label')
  })

  it('falls back to the first declared text field when none of the priority names exist', () => {
    const target = collection([field('summary', 'text'), field('body', 'richText')])
    const entry = { id: 'entry-1', values: { summary: 'A summary', body: 'ignored' } }

    expect(titleOf(entry, target)).toBe('A summary')
  })

  it('falls back to the id when the collection declares no text field at all', () => {
    const target = collection([field('published', 'boolean'), field('cover', 'media')])
    const entry = { id: 'entry-1', values: { published: true, cover: 'media-1' } }

    expect(titleOf(entry, target)).toBe('entry-1')
  })

  it('falls back to the id when a priority field is declared but its value is empty', () => {
    const target = collection([field('title', 'text')])
    const entry = { id: 'entry-1', values: { title: '' } }

    expect(titleOf(entry, target)).toBe('entry-1')
  })

  it('never treats a non-text field named "title" as the title, even though its value looks like a string', () => {
    // A `relation` value is a string id — using it as a title would show a
    // foreign key rather than a name.
    const target = collection([field('title', 'relation'), field('summary', 'text')])
    const entry = { id: 'entry-1', values: { title: 'related-entry-9', summary: 'The real title' } }

    expect(titleOf(entry, target)).toBe('The real title')
  })

  it('without a collection, falls back to the first string value found (the pre-fiche-01 heuristic)', () => {
    const entry = { id: 'entry-1', values: { count: 3, name: 'Whatever comes first' } }

    expect(titleOf(entry)).toBe('Whatever comes first')
  })

  it('without a collection and with no string value, falls back to the id', () => {
    const entry = { id: 'entry-1', values: { count: 3 } }

    expect(titleOf(entry)).toBe('entry-1')
  })
})
