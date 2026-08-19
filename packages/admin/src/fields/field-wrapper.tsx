import type { JSX, ReactNode } from 'react'
import type { SchemaField } from '../schema/types.js'
import '../styles/fields.css'

/** The id an error message for field `id` is rendered at — what a control's `aria-describedby` should point to (fiche 02 task 3). */
export function fieldErrorId(id: string): string {
  return `${id}-error`
}

/**
 * Label, required marker, help text and validation error — the pieces every
 * field component shares, so a new field type is a new input, not a new
 * label.
 *
 * The error is rendered here, once, rather than by each of the fifteen field
 * components: `role="alert"` announces it the moment it appears, and its id
 * (`fieldErrorId(id)`) is stable, so every field only has to point its own
 * control's `aria-describedby` at it — never build the string twice.
 */
export function FieldWrapper({
  id,
  field,
  children,
  error,
}: {
  readonly id: string
  readonly field: SchemaField
  readonly children: ReactNode
  /** A validation message (fiche 02 task 3), or absent/null when the field currently holds none. */
  readonly error?: string | null
}): JSX.Element {
  const label = field.admin?.label ?? field.name

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {field.required && (
          <span aria-hidden="true" className="field__required">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error !== undefined && error !== null && (
        <p id={fieldErrorId(id)} role="alert" className="field__error">
          {error}
        </p>
      )}
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}
