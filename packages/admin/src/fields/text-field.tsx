import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

export function TextField({
  id,
  field,
  value,
  onChange,
  disabled,
}: FieldProps<string>): JSX.Element {
  const options = field.options as {
    readonly min?: number
    readonly max?: number
    readonly multiline?: boolean
  }

  return (
    <FieldWrapper id={id} field={field}>
      {options.multiline === true ? (
        <textarea
          id={id}
          required={field.required}
          minLength={options.min}
          maxLength={options.max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type="text"
          required={field.required}
          minLength={options.min}
          maxLength={options.max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldWrapper>
  )
}
