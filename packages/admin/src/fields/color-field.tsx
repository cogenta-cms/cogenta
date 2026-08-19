import type { JSX } from 'react'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/** Hex notation, `#rgb`/`#rrggbb`/`#rrggbbaa` — the native colour picker only handles `#rrggbb`, so alpha still goes through the text field beside it. */
export function ColorField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const pickerValue = /^#[0-9a-fA-F]{6}$/u.test(value) ? value : '#000000'
  const invalid = error !== undefined && error !== null

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <div className="field__color">
        <input
          type="color"
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled}
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          id={id}
          type="text"
          pattern="#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?"
          required={field.required}
          disabled={disabled}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? fieldErrorId(id) : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </FieldWrapper>
  )
}
