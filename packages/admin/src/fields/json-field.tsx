import { type JSX, useState } from 'react'
import { FieldWrapper } from './field-wrapper.js'
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
}: FieldProps<unknown>): JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2) ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleChange(next: string): void {
    setText(next)
    try {
      onChange(JSON.parse(next))
      setError(null)
    } catch {
      setError(
        'JSON invalide — les modifications ne sont pas prises en compte tant que ce n’est pas corrigé.',
      )
    }
  }

  return (
    <FieldWrapper id={id} field={field}>
      <textarea
        id={id}
        required={field.required}
        disabled={disabled}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        aria-invalid={error !== null}
      />
      {error !== null && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
    </FieldWrapper>
  )
}
