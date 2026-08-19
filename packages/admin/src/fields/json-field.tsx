import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * Edited as text, validated as JSON on every keystroke, committed as the
 * parsed value only when it parses — an invalid intermediate state (typing
 * `{"a":`) must not corrupt `value`, which the rest of the form still reads
 * as the last-known-good object.
 */
export function JsonField({
  id,
  field,
  value,
  onChange,
  disabled,
  error: fieldError,
}: FieldProps<unknown>): JSX.Element {
  const { t } = useTranslation()
  const [text, setText] = useState(() => JSON.stringify(value, null, 2) ?? '')
  const [parseError, setParseError] = useState<string | null>(null)
  const invalid = parseError !== null || (fieldError !== undefined && fieldError !== null)

  function handleChange(next: string): void {
    setText(next)
    try {
      onChange(JSON.parse(next))
      setParseError(null)
    } catch {
      setParseError(t('fields.jsonInvalid'))
    }
  }

  return (
    <FieldWrapper id={id} field={field} error={fieldError ?? null}>
      <textarea
        id={id}
        required={field.required}
        disabled={disabled}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
      />
      {parseError !== null && (
        <p role="alert" className="field__error">
          {parseError}
        </p>
      )}
    </FieldWrapper>
  )
}
