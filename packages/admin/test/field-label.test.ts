import { describe, expect, it } from 'vitest'
import { fieldLabel } from '../src/schema/field-label.js'
import type { SchemaField } from '../src/schema/types.js'

const t = ((key: string, options?: { defaultValue?: string }) =>
  key === 'contentFields.publishedAt'
    ? 'Date de publication'
    : (options?.defaultValue ?? key)) as unknown as Parameters<typeof fieldLabel>[1]

function field(name: string, label?: string): SchemaField {
  return {
    name,
    kind: 'text',
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options: {},
    ...(label === undefined ? {} : { admin: { label } }),
  } as SchemaField
}

/**
 * The version diff read "publishedAt — modifié" and the columns panel offered
 * `body`, `coverImage`, `tags` — while the SEO fields right beside them showed
 * "SEO title", because the blueprint happens to label those. Same screen, two
 * vocabularies.
 */
describe('fieldLabel', () => {
  it("uses what the schema's author wrote, above everything else", () => {
    expect(fieldLabel('publishedAt', t, field('publishedAt', 'Mise en ligne'))).toBe(
      'Mise en ligne',
    )
  })

  it('translates the conventional names when nothing was written', () => {
    expect(fieldLabel('publishedAt', t, field('publishedAt'))).toBe('Date de publication')
    expect(fieldLabel('publishedAt', t)).toBe('Date de publication')
  })

  it('shows an unknown field as its author spelled it, rather than guessing', () => {
    expect(fieldLabel('numeroDeDossier', t, field('numeroDeDossier'))).toBe('numeroDeDossier')
  })

  it('ignores an empty label instead of rendering nothing', () => {
    expect(fieldLabel('publishedAt', t, field('publishedAt', ''))).toBe('Date de publication')
  })
})
