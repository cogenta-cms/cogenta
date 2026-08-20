import type { JSX } from 'react'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * `f.datetime()` stores an instant as ISO 8601 with an offset; the browser's
 * `datetime-local` input edits local wall-clock time with no offset at all.
 * These two conversions are the field's whole job — everything either side
 * of them is a plain string.
 */
function toLocalInputValue(iso: string): string {
  if (iso === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(local: string): string {
  if (local === '') return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function DatetimeField({
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
        type="datetime-local"
        required={field.required}
        disabled={disabled}
        value={toLocalInputValue(value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) => onChange(fromLocalInputValue(event.target.value))}
      />
    </FieldWrapper>
  )
}
