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
}: FieldProps<boolean>): JSX.Element {
  return (
    <div className="field field--boolean">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />
        {labelOf(field)}
      </label>
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}

function labelOf(field: SchemaField): string {
  return field.admin?.label ?? field.name
}
