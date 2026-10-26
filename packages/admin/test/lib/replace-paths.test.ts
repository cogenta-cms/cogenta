import { describe, expect, it } from 'vitest'
import { describeHitPath } from '../../src/lib/replace-paths.js'
import type { CollectionSummary } from '../../src/schema/types.js'

const dictionary: Record<string, string> = {
  'fieldNames.title': 'Titre',
  'fieldNames.body': 'Contenu',
  'blockTypes.hero': 'Héros',
  'blockTypes.prose': 'Texte',
  'blockFields.heading': 'Titre',
  'replace.inBlockPlain': 'Bloc {{position}}',
  'replace.inZoneBlockPlain': 'Zone {{zone}}, bloc {{position}}',
  'replace.inParagraph': '{{field}} · paragraphe {{position}}',
}

const t = ((key: string, options?: Record<string, unknown>) => {
  const template = dictionary[key] ?? (options?.defaultValue as string | undefined) ?? key
  return template.replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(options?.[name] ?? ''))
}) as unknown as Parameters<typeof describeHitPath>[1]

describe('describeHitPath', () => {
  it('names a plain field by its label, not its key', () => {
    expect(describeHitPath('title', t)).toBe('Titre')
  })

  it('says which paragraph of a rich-text field a match is in', () => {
    expect(describeHitPath('body[1].children', t)).toBe('Contenu · paragraphe 2')
  })

  it("prefers the schema author's own label for a field", () => {
    const collection = {
      fields: [{ name: 'summary', admin: { label: 'Chapeau' } }],
    } as unknown as CollectionSummary
    expect(describeHitPath('summary', t, { collection })).toBe('Chapeau')
  })

  it('says "Bloc 2 · Texte" for a match inside the second block, with the block type', () => {
    expect(
      describeHitPath('blocks.blocks[1].data.body[0].children', t, { blockType: 'prose' }),
    ).toBe('Bloc 2 · Texte · Contenu')
  })

  it('names the field of a block by its label', () => {
    expect(describeHitPath('blocks.blocks[0].data.heading', t, { blockType: 'hero' })).toBe(
      'Bloc 1 · Héros · Titre',
    )
  })

  it('names a block zone other than the default one', () => {
    expect(describeHitPath('blocks.sidebar[2].data.heading', t, { blockType: 'hero' })).toBe(
      'Zone sidebar, bloc 3 · Héros · Titre',
    )
  })
})
