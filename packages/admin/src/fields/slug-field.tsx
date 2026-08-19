import type { JSX } from 'react'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * A slug is still free text here: the "derive from another field unless
 * typed" behaviour is a form-level concern (task 7's generator knows the
 * sibling field's value; one field component in isolation does not).
 */
export function SlugField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const options = field.options as { readonly max?: number; readonly from?: string }
  const invalid = error !== undefined && error !== null

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <input
        id={id}
        type="text"
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        required={field.required}
        maxLength={options.max}
        disabled={disabled}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldWrapper>
  )
}
