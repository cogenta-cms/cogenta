import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { humanizeFieldName } from '../lib/humanize-field-name.js'
import type { SchemaField } from '../schema/types.js'
import '../styles/fields.css'

/** The id an error message for field `id` is rendered at — what a control's `aria-describedby` should point to (fiche 02 task 3). */
export function fieldErrorId(id: string): string {
  return `${id}-error`
}

/**
 * Label, required marker, help text, character counter, "reset to default"
 * and validation error — the pieces every field component shares, so a new
 * field type is a new input, not a new label (task 4).
 *
 * `value`/`onReset` are both optional and independent: the counter only
 * needs `value` (compared against `field.options.max`), the reset button
 * needs both `value` and `onReset` (compared against `field.default`). A
 * field kind with no simple notion of either — `blocks`, `media`, `relation`
 * — passes neither and gets neither, rather than a counter that always
 * reads "0/undefined" or a reset button that can never be truthfully enabled.
 *
 * The error is rendered here, once, rather than by each of the fifteen field
 * components: `role="alert"` announces it the moment it appears, and its id
 * (`fieldErrorId(id)`) is stable, so every field only has to point its own
 * control's `aria-describedby` at it — never build the string twice.
 */
export function FieldWrapper({
  id,
  field,
  children,
  value,
  onReset,
  error,
}: {
  readonly id: string
  readonly field: SchemaField
  readonly children: ReactNode
  /** The field's current value — enables the character counter and the reset comparison. */
  readonly value?: unknown
  /** Present only when this field kind can meaningfully reset to `field.default`. */
  onReset?(): void
  /** A validation message (fiche 02 task 3), or absent/null when the field currently holds none. */
  readonly error?: string | null
}): JSX.Element {
  const { t } = useTranslation()
  // Fiche 01 audit T02 — a field with no declared `admin.label` used to
  // show its raw technical name (`internalCode`); the humanised form reads
  // as a label without inventing a translation for a name the schema
  // author chose (`field.name` is not an i18n key). A field that already
  // declares `admin.label` is untouched — 100% backward compatible for a
  // site already configured.
  const label = field.admin?.label ?? humanizeFieldName(field.name)

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
      {error !== undefined && error !== null && (
        <p id={fieldErrorId(id)} role="alert" className="field__error">
          {error}
        </p>
      )}
      {field.admin?.help !== undefined && <p className="field__help">{field.admin.help}</p>}
    </div>
  )
}
