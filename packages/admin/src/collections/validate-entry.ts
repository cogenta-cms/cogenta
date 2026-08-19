import type { TFunction } from 'i18next'
import type { CollectionSummary, SchemaField } from '../schema/types.js'

/**
 * Client-side validation, before a single byte reaches the server (fiche 02
 * task 3).
 *
 * Two things this deliberately does *not* try to be. It is not a second copy
 * of `packages/schema/src/validation.ts`'s Zod schemas — that module builds
 * the per-kind validator from the same `f.*` constructors the server trusts,
 * and it is Node code this browser bundle cannot import (`schema/types.ts`'s
 * header explains why). And it is not a promise that everything it lets
 * through will be accepted: it mirrors what the schema *declares*
 * (`required`, and `min`/`max` where the kind has them), not what
 * `packages/schema/src/store/values.ts` currently enforces on write, which —
 * confirmed by reading `packages/schema/src/store/store.ts` and
 * `packages/api/src/graphql/schema.ts`'s own comment ("`required` is checked
 * at publication, not while drafting") — is *less* than the schema declares:
 * a plain save never enforces `required` (only `publish()` does), and
 * `min`/`max`/the slug pattern are not enforced by a write at all today. This
 * function only enforces `required` when the caller says the action is one
 * that actually requires it (`enforceRequired: true` — pass this together
 * with the "Publier" flow, never with a plain draft save), which keeps this
 * screen from blocking a save the server would have accepted, and mirrors
 * `min`/`max`/the slug pattern unconditionally because they are useful,
 * honest feedback regardless of whether the write path double-checks them.
 */

/** Mirrors `packages/schema/src/validation.ts`'s `SLUG_PATTERN`. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface ValidateEntryOptions {
  /** Whether an empty `required` field is an error — true only for the publish path. */
  readonly enforceRequired: boolean
}

/** A to-many field's empty case is `[]`; every other field's is `''`/`null`/`undefined`. Mirrors `isCollectionValued` in `packages/schema/src/validation.ts`. */
function isManyValued(field: SchemaField): boolean {
  if (field.kind === 'blocks') return true
  const isManyKind =
    field.kind === 'media' ||
    field.kind === 'relation' ||
    field.kind === 'select' ||
    field.kind === 'taxonomy'
  return isManyKind && field.options['many'] === true
}

function isEmpty(field: SchemaField, value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (isManyValued(field)) return Array.isArray(value) ? value.length === 0 : true
  return typeof value === 'string' && value.length === 0
}

function numberOption(field: SchemaField, key: string): number | undefined {
  const value = field.options[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * One field's message, or `null` when it currently holds nothing to say.
 *
 * `blocks` and `boolean` are never checked: a block zone's own required-ness
 * is not enforced anywhere in the store either (`normaliseValues` skips
 * `blocks` entirely), and a checkbox has no empty state to be "required" about.
 */
export function validateFieldValue(
  field: SchemaField,
  value: unknown,
  t: TFunction,
  options: ValidateEntryOptions,
): string | null {
  if (field.kind === 'blocks' || field.kind === 'boolean') return null

  const empty = isEmpty(field, value)
  if (field.required && options.enforceRequired && empty) {
    return t('entryEdit.validation.required')
  }
  if (empty) return null

  if ((field.kind === 'text' || field.kind === 'slug') && typeof value === 'string') {
    const min = numberOption(field, 'min')
    const max = numberOption(field, 'max')
    if (min !== undefined && value.length < min) {
      return t('entryEdit.validation.tooShort', { min })
    }
    if (max !== undefined && value.length > max) {
      return t('entryEdit.validation.tooLong', { max })
    }
  }

  if (field.kind === 'slug' && typeof value === 'string' && !SLUG_PATTERN.test(value)) {
    return t('entryEdit.validation.slugInvalid')
  }

  if (field.kind === 'number' && typeof value === 'number') {
    const min = numberOption(field, 'min')
    const max = numberOption(field, 'max')
    if (min !== undefined && value < min) return t('entryEdit.validation.tooSmall', { min })
    if (max !== undefined && value > max) return t('entryEdit.validation.tooLarge', { max })
  }

  return null
}

/** One message per invalid field, keyed by field name — what the form shows under each control, and what decides where focus goes. */
export function validateEntry(
  collection: CollectionSummary,
  values: Readonly<Record<string, unknown>>,
  t: TFunction,
  options: ValidateEntryOptions,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of collection.fields) {
    if (field.kind === 'blocks') continue
    const message = validateFieldValue(field, values[field.name], t, options)
    if (message !== null) errors[field.name] = message
  }
  return errors
}
