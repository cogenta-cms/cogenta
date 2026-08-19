import type { JSX } from 'react'
import type { SchemaField } from '../schema/types.js'
import type { FieldProps } from './types.js'

/**
 * No `FieldWrapper` here on purpose: a checkbox's label reads naturally
 * *after* the control, not above it like every other field's label does.
 */
export function BooleanField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<boolean>): JSX.Element {
  const invalid = error !== undefined && error !== null
  const errorId = `${id}-error`
  return (
    <div className="field field--boolean">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        {labelOf(field)}
      </label>
      {invalid && (
        <p id={errorId} role="alert" className="field__error">
          {error}
        </p>
      )}
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}

function labelOf(field: SchemaField): string {
  return field.admin?.label ?? field.name
}
