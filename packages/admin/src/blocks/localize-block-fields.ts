import type { TFunction } from 'i18next'
import type { CollectionSummary, SchemaField } from '../schema/types.js'
import { BLOCK_VOCABULARY, type BlockDefinition, type ItemFieldDefinition } from './vocabulary.js'

/**
 * The words a block form shows, in the admin's language (L36 audit).
 *
 * `BLOCK_VOCABULARY` names its fields as contract B does — `eyebrow`,
 * `emphasis`, `primary` — and the builder showed exactly that to an editor
 * working in French. This turns names and option values into labels at
 * render time, without touching the vocabulary itself (which a sync test
 * holds to contract B). A label an author wrote — a plugin block's — is kept.
 *
 * i18next reads `:` as a namespace separator, so an option value such as
 * `16:9` is looked up as `16x9`.
 */

type OptionChoice = { readonly value: string; readonly label?: string }

function optionKey(value: string): string {
  return value.replaceAll(':', 'x')
}

/**
 * The dates a collection declares itself, offered beside the three system
 * columns in a list's "Trier par" (L40, ADR-0038). Nothing else: a cursor
 * needs a total order, and only a `date`/`datetime` column has one the store
 * can page through.
 */
export function dateFieldsOf(collection: CollectionSummary | undefined): readonly SchemaField[] {
  if (collection === undefined) return []
  return collection.fields.filter((field) => field.kind === 'date' || field.kind === 'datetime')
}

function localizeOptions(
  options: Readonly<Record<string, unknown>>,
  t: TFunction,
  collections: readonly CollectionSummary[],
  listed?: CollectionSummary,
): Readonly<Record<string, unknown>> {
  let next: Record<string, unknown> = { ...options }
  if (next['dateSortPicker'] === true) {
    next = {
      ...next,
      options: [
        ...((next['options'] as readonly OptionChoice[] | undefined) ?? []).map((choice) => ({
          value: choice.value,
          label:
            choice.label ??
            t(`blockOptions.${optionKey(choice.value)}`, { defaultValue: choice.value }),
        })),
        ...dateFieldsOf(listed).map((field) => ({
          value: field.name,
          label: field.admin?.label ?? field.name,
        })),
      ],
    }
    return next
  }
  if (next['collectionPicker'] === true) {
    next = {
      ...next,
      options: collections.map((collection) => ({
        value: collection.name,
        label: collection.labels.plural,
      })),
    }
  } else if (Array.isArray(next['options'])) {
    next = {
      ...next,
      options: (next['options'] as readonly OptionChoice[]).map((choice) => ({
        value: choice.value,
        label:
          choice.label ??
          t(`blockOptions.${optionKey(choice.value)}`, { defaultValue: choice.value }),
      })),
    }
  }
  if (Array.isArray(next['items'])) {
    next = {
      ...next,
      items: (next['items'] as readonly ItemFieldDefinition[]).map((item) =>
        localizeItemField(item, t, collections, listed),
      ),
    }
  }
  return next
}

function labelFor(name: string, t: TFunction): string {
  return t(`blockFields.${name}`, { defaultValue: name })
}

function helpFor(name: string, t: TFunction): string | undefined {
  const help = t(`blockFieldHelp.${name}`, { defaultValue: '' })
  return help === '' ? undefined : help
}

function localizeItemField(
  item: ItemFieldDefinition,
  t: TFunction,
  collections: readonly CollectionSummary[],
  listed?: CollectionSummary,
): ItemFieldDefinition {
  const help = item.admin?.help ?? helpFor(item.name, t)
  return {
    ...item,
    admin: {
      ...item.admin,
      label: item.admin?.label ?? labelFor(item.name, t),
      ...(help === undefined ? {} : { help }),
    },
    options: localizeOptions(item.options, t, collections, listed),
  }
}

export function localizeBlockField(
  field: SchemaField,
  t: TFunction,
  collections: readonly CollectionSummary[],
  /** The collection a `collectionList` block is listing right now, when it names one. */
  listed?: CollectionSummary,
): SchemaField {
  const help = field.admin?.help ?? helpFor(field.name, t)
  return {
    ...field,
    admin: {
      ...field.admin,
      label: field.admin?.label ?? labelFor(field.name, t),
      ...(help === undefined ? {} : { help }),
    },
    options: localizeOptions(field.options, t, collections, listed),
  }
}

/**
 * A block's name in the admin's language. The vocabulary's own labels are
 * French; a plugin block keeps the label its author wrote.
 */
export function blockLabel(definition: BlockDefinition, t: TFunction): string {
  if (!BLOCK_VOCABULARY.some((block) => block.name === definition.name)) return definition.label
  return t(`blockTypes.${definition.name}`, { defaultValue: definition.label })
}
