import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { readingTimeMinutes, wordCount } from '../collections/word-count.js'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

export function TextField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const { t } = useTranslation()
  const options = field.options as {
    readonly min?: number
    readonly max?: number
    readonly multiline?: boolean
  }
  const invalid = error !== undefined && error !== null
  // Only for a body-shaped field (task 5): a one-line title showing "1 word,
  // 1 min read" is noise, not a useful count.
  const words = options.multiline === true ? wordCount(value) : null

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as string)}
      error={error ?? null}
    >
      {options.multiline === true ? (
        <textarea
          id={id}
          required={field.required}
          minLength={options.min}
          maxLength={options.max}
          disabled={disabled}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? fieldErrorId(id) : undefined}
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
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? fieldErrorId(id) : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {words !== null && (
        <p className="field__word-count">
          {t('fields.wordCount', { count: words, minutes: readingTimeMinutes(words) })}
        </p>
      )}
    </FieldWrapper>
  )
}
