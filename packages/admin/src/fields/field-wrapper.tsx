import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SchemaField } from '../schema/types.js'
import '../styles/fields.css'

/**
 * Label, required marker, help text, character counter and "reset to
 * default" — the pieces every field component shares, so a new field type
 * is a new input, not a new label (task 4).
 *
 * `value`/`onReset` are both optional and independent: the counter only
 * needs `value` (compared against `field.options.max`), the reset button
 * needs both `value` and `onReset` (compared against `field.default`). A
 * field kind with no simple notion of either — `blocks`, `media`, `relation`
 * — passes neither and gets neither, rather than a counter that always
 * reads "0/undefined" or a reset button that can never be truthfully enabled.
 */
export function FieldWrapper({
  id,
  field,
  children,
  value,
  onReset,
}: {
  readonly id: string
  readonly field: SchemaField
  readonly children: ReactNode
  /** The field's current value — enables the character counter and the reset comparison. */
  readonly value?: unknown
  /** Present only when this field kind can meaningfully reset to `field.default`. */
  onReset?(): void
}): JSX.Element {
  const { t } = useTranslation()
  const label = field.admin?.label ?? field.name

  const max = typeof field.options.max === 'number' ? field.options.max : undefined
  const length = typeof value === 'string' ? value.length : undefined
  const showCounter = max !== undefined && length !== undefined

  const hasDefault = field.default !== undefined
  const atDefault = hasDefault && JSON.stringify(value) === JSON.stringify(field.default)
  const showReset = onReset !== undefined && hasDefault && !atDefault

  return (
    <div className="field">
      <div className="field__label-row">
        <label htmlFor={id}>
          {label}
          {field.required && (
            <span aria-hidden="true" className="field__required">
              {' '}
              *
            </span>
          )}
        </label>
        {showReset && (
          <button type="button" className="field__reset" onClick={onReset}>
            {t('fields.resetToDefault')}
          </button>
        )}
      </div>
      {children}
      {showCounter && (
        <p
          className={length > max ? 'field__counter field__counter--over' : 'field__counter'}
          aria-live="polite"
        >
          {t('fields.charCount', { count: length, max })}
        </p>
      )}
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}
