import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/** V8's own `SyntaxError` message names a character offset, never a line — this turns that offset into the line an editor can actually go look at. */
function lineOf(text: string, message: string): number | null {
  const match = /position (\d+)/u.exec(message)
  if (match?.[1] === undefined) return null
  const position = Number(match[1])
  if (!Number.isFinite(position)) return null
  return text.slice(0, position).split('\n').length
}

/**
 * Edited as text, validated as JSON on every keystroke, committed as the
 * parsed value only when it parses — an invalid intermediate state (typing
 * `{"a":`) must not corrupt `value`, which the rest of the form still reads
 * as the last-known-good object. "Format" re-serialises the last valid
 * parse; it is a no-op on already-tidy JSON and a real convenience on
 * anything pasted in from elsewhere.
 */
export function JsonField({
  id,
  field,
  value,
  onChange,
  disabled,
}: FieldProps<unknown>): JSX.Element {
  const { t } = useTranslation()
  const [text, setText] = useState(() => JSON.stringify(value, null, 2) ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleChange(next: string): void {
    setText(next)
    try {
      onChange(JSON.parse(next))
      setError(null)
    } catch (caught) {
      const line = lineOf(next, caught instanceof Error ? caught.message : '')
      setError(line === null ? t('fields.jsonInvalid') : t('fields.jsonInvalidAtLine', { line }))
    }
  }

  function format(): void {
    try {
      const formatted = JSON.stringify(JSON.parse(text), null, 2)
      setText(formatted)
      onChange(JSON.parse(formatted))
      setError(null)
    } catch {
      // Nothing valid to format yet — leave the text exactly as the editor left it.
    }
  }

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => {
        onChange(field.default)
        setText(JSON.stringify(field.default, null, 2) ?? '')
        setError(null)
      }}
    >
      <textarea
        id={id}
        required={field.required}
        disabled={disabled}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        aria-invalid={error !== null}
      />
      <div className="field__json-actions">
        <button type="button" disabled={disabled || error !== null} onClick={format}>
          {t('fields.jsonFormat')}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
    </FieldWrapper>
  )
}
