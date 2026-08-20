import type { JSX } from 'react'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

export function NumberField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<number | null>): JSX.Element {
  const options = field.options as {
    readonly min?: number
    readonly max?: number
    readonly integer?: boolean
  }
  const invalid = error !== undefined && error !== null

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as number | null)}
      error={error ?? null}
    >
      <input
        id={id}
        type="number"
        required={field.required}
        min={options.min}
        max={options.max}
        step={options.integer === true ? 1 : 'any'}
        disabled={disabled}
        value={value ?? ''}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      />
    </FieldWrapper>
  )
}
