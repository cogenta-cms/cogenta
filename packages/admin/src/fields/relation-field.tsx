import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * Placeholder — a real picker needs to query the target collection's entries,
 * which the admin's data layer does not do yet outside of `/api/schema`.
 * Lands with the schema-driven edit form (task 7).
 */
export function RelationField({ id, field }: FieldProps<unknown>): JSX.Element {
  const options = field.options as { readonly to?: string; readonly many?: boolean }

  return (
    <FieldWrapper id={id} field={field}>
      <p className="field__placeholder">
        Sélecteur de relation vers « {options.to ?? '?'} » à venir (tâche 7).
      </p>
    </FieldWrapper>
  )
}
