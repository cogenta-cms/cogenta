import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
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
}: FieldProps<string>): JSX.Element {
  const options = field.options as { readonly max?: number; readonly from?: string }

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as string)}
    >
      <input
        id={id}
        type="text"
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        required={field.required}
        maxLength={options.max}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldWrapper>
  )
}
