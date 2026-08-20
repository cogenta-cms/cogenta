import type { JSX } from 'react'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/** Calendar day, no time zone: `YYYY-MM-DD` — matches `f.date()`'s contract. */
export function DateField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const invalid = error !== undefined && error !== null
  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as string)}
      error={error ?? null}
    >
      <input
        id={id}
        type="date"
        required={field.required}
        disabled={disabled}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldWrapper>
  )
}
