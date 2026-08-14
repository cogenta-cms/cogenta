import type { JSX, ReactNode } from 'react'
import type { SchemaField } from '../schema/types.js'
import '../styles/fields.css'

/**
 * Label, required marker and help text — the one piece every field
 * component shares, so a new field type is a new input, not a new label.
 */
export function FieldWrapper({
  id,
  field,
  children,
}: {
  readonly id: string
  readonly field: SchemaField
  readonly children: ReactNode
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
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}
