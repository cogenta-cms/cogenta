import { describe, expect, it } from 'vitest'
import { fieldHelp, fieldLabel } from '../src/schema/field-label.js'
import type { SchemaField } from '../src/schema/types.js'

const t = ((key: string, options?: { defaultValue?: string }) =>
  key === 'fieldNames.publishedAt'
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

/**
 * The shipped blueprints used to write their field labels and help in English
 * and only English — `content-pack.ts` said so outright ("all English-only;
 * there is no French variant of any blueprint's schema to match"), so a French
 * site's form read "Topic", "SEO title", "Hide from search engines".
 *
 * Translating the schema would have been the wrong repair: ADR-0019 makes the
 * admin's language a preference *of the person*, and a label baked into
 * `cogenta.schema.mjs` at scaffold time picks one language per **site**. Two
 * people administering the same site would still read the same word.
 */
describe('a blueprint field with no label of its own', () => {
  const dictionary = ((key: string, options?: { defaultValue?: string }) => {
    const table: Record<string, string> = {
      'fieldNames.topic': 'Sujet',
      'fieldNames.seoNoindex': 'Masquer des moteurs de recherche',
      'fieldHelp.seoNoindex': 'Ajoute une instruction « noindex ».',
    }
    return table[key] ?? options?.defaultValue ?? key
  }) as unknown as Parameters<typeof fieldLabel>[1]

  it('is named by the admin, in the language the reader chose', () => {
    expect(fieldLabel('topic', dictionary, field('topic'))).toBe('Sujet')
    expect(fieldLabel('seoNoindex', dictionary, field('seoNoindex'))).toBe(
      'Masquer des moteurs de recherche',
    )
  })

  it('is explained by the admin too, and says nothing when there is nothing to say', () => {
    expect(fieldHelp('seoNoindex', dictionary, field('seoNoindex'))).toBe(
      'Ajoute une instruction « noindex ».',
    )
    expect(fieldHelp('numeroDeDossier', dictionary, field('numeroDeDossier'))).toBeUndefined()
  })

  it("still lets a schema author's own words win", () => {
    const own = {
      ...field('topic'),
      admin: { label: 'Rubrique', help: 'La nôtre.' },
    } as SchemaField
    expect(fieldLabel('topic', dictionary, own)).toBe('Rubrique')
    expect(fieldHelp('topic', dictionary, own)).toBe('La nôtre.')
  })
})
