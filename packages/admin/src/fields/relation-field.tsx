import type { JSX } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import { EntryPicker } from './entry-picker.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * The wire value of a relation field is not always a bare id. REST expands
 * relations to one hop by default (`packages/api/src/content/serialise.ts`,
 * `ExpansionOptions.depth`, and `content-client.ts` never asks for
 * `depth=0`) — a *readable* target comes back as the related entry's whole
 * serialised document, id included, and only an unreadable or unknown
 * target is left as a bare id. Both are real, current shapes; this reads
 * either.
 */
function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { readonly id: unknown }).id === 'string'
  ) {
    return (value as { readonly id: string }).id
  }
  return null
}

/**
 * `f.relation({ to, many })` — a real picker (fiche 03 task 1), replacing
 * the placeholder that used to sit here (`« un vrai sélecteur doit
 * interroger les entrées de la collection cible »`).
 *
 * The store's own two shapes stay exactly what they were: `string | null`
 * for a to-one relation, `readonly string[]` for a to-many one. Only
 * `EntryPicker` — which is cardinality-agnostic — sees a normalised array
 * of ids in between.
 */
export function RelationField({
  id,
  field,
  value,
  onChange,
  disabled = false,
  error,
}: FieldProps<unknown>): JSX.Element {
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const options = field.options as { readonly to?: string; readonly many?: boolean }
  const many = options.many === true
  const targetName = options.to ?? ''
  const collection =
    schema.status === 'ready'
      ? schema.schema.collections.find((candidate) => candidate.name === targetName)
      : undefined

  const normalised: readonly string[] = many
    ? Array.isArray(value)
      ? value.map(idOf).filter((entryId): entryId is string => entryId !== null)
      : []
    : (() => {
        const single = idOf(value)
        return single === null ? [] : [single]
      })()

  function handleChange(ids: readonly string[]): void {
    onChange(many ? ids : (ids[0] ?? null))
  }

  if (token === null || schema.status === 'loading') {
    return (
      <FieldWrapper id={id} field={field} error={error ?? null}>
        <p>…</p>
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <EntryPicker
        id={id}
        token={token}
        collection={collection}
        roles={roles}
        many={many}
        value={normalised}
        onChange={handleChange}
        disabled={disabled}
      />
    </FieldWrapper>
  )
}
