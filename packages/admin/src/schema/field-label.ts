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
 *  2. A translation for the conventional names the shipped blueprints use, the
 *     same `blockFields.*` arrangement `localize-block-fields.ts` already uses
 *     for contract B's fields, and for the same reason: an editor reading
 *     "publishedAt — modifié" in a French interface is reading a column name,
 *     not a sentence.
 *  3. The name itself. A field this admin has never heard of is shown as its
 *     author spelled it, rather than guessed at.
 */
export function fieldLabel(name: string, t: TFunction, field?: SchemaField): string {
  const declared = field?.admin?.label
  if (typeof declared === 'string' && declared !== '') return declared
  return t(`contentFields.${name}`, { defaultValue: name })
}
