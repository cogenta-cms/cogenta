import type { TFunction } from 'i18next'
import type { SchemaField } from './types.js'

/**
 * What to call a field on screen.
 *
 * Three sources, in this order, and the order is the whole point:
 *
 *  1. What the schema's author wrote (`admin.label`). Nobody gets to second-
 *     guess that — it is the one source that knows what this particular field
 *     holds on this particular site.
 *  2. `fieldNames.*` — the dictionary the entry form has used since the L36
 *     audit, when a French site's forms said "Title" and "Cover Image". The
 *     same one, deliberately: a field named in two vocabularies depending on
 *     which screen you are looking at is the thing this was fixing.
 *  3. The name itself. A field this admin has never heard of is shown as its
 *     author spelled it, rather than guessed at.
 */
export function fieldLabel(
  name: string,
  t: TFunction,
  field?: SchemaField,
  /** What to show when nothing names this field. The raw name, unless a caller has something kinder. */
  fallback: string = name,
): string {
  const declared = field?.admin?.label
  if (typeof declared === 'string' && declared !== '') return declared
  return t(`fieldNames.${name}`, { defaultValue: fallback })
}

/**
 * The sentence under a field, in the reader's language.
 *
 * Same order and same reasoning as `fieldLabel`: what the schema's author
 * wrote wins, then the dictionary for the names the shipped blueprints use,
 * then nothing — a field with no help shows no help, which is the honest
 * answer and the one this admin has always given.
 */
export function fieldHelp(name: string, t: TFunction, field?: SchemaField): string | undefined {
  const declared = field?.admin?.help
  if (typeof declared === 'string' && declared !== '') return declared
  const translated = t(`fieldHelp.${name}`, { defaultValue: '' })
  return translated === '' ? undefined : translated
}
