import type { TFunction } from 'i18next'
import { blockLabel } from '../blocks/localize-block-fields.js'
import { blockDefinition } from '../blocks/vocabulary.js'
import { fieldLabel } from '../schema/field-label.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * Where a search-and-replace match sits, said the way an editor would.
 *
 * The plan names a place by its path in the stored data: `title`,
 * `body[1].children` (the second paragraph of a rich-text field),
 * `blocks.blocks[2].data.heading` (a field of the third block). Showing that
 * to a person is showing a database; this turns it into "Titre",
 * "Contenu · paragraphe 2", "Bloc 3 · Héros · Titre". The raw path stays
 * available to the caller as a tooltip.
 */
export function describeHitPath(
  path: string,
  t: TFunction,
  context: {
    readonly collection?: CollectionSummary | undefined
    readonly blockType?: string | undefined
  } = {},
): string {
  const block = /^blocks\.([^[]+)\[(\d+)\](?:\.data)?\.?(.*)$/u.exec(path)
  if (block !== null) {
    const [, zone = '', index = '0', rest = ''] = block
    const position = Number(index) + 1
    const definition =
      context.blockType === undefined ? undefined : blockDefinition(context.blockType)
    const kind =
      definition === undefined
        ? context.blockType === undefined
          ? ''
          : context.blockType
        : blockLabel(definition, t)
    const field = firstSegment(rest)
    const fieldText =
      field === '' ? '' : t(`blockFields.${field}`, { defaultValue: fieldLabel(field, t) })
    const base =
      zone === 'blocks'
        ? t('replace.inBlockPlain', { position })
        : t('replace.inZoneBlockPlain', { position, zone })
    return [base, kind, fieldText].filter((part) => part !== '').join(' · ')
  }

  const top = /^([^.[]+)(.*)$/u.exec(path)
  if (top === null) return path
  const [, name = path, rest = ''] = top
  const field = context.collection?.fields.find((candidate) => candidate.name === name)
  const label = fieldLabel(name, t, field)
  const paragraph = /^\[(\d+)\]/u.exec(rest)
  return paragraph === null
    ? label
    : t('replace.inParagraph', { field: label, position: Number(paragraph[1]) + 1 })
}

function firstSegment(rest: string): string {
  return /^([^.[]+)/u.exec(rest)?.[1] ?? ''
}
