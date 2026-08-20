import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * Hex notation, `#rgb`/`#rrggbb`/`#rrggbbaa` — the native colour picker only
 * handles `#rrggbb`, so alpha still goes through the text field beside it.
 *
 * Three things sit beside each other on purpose: a decorative swatch that
 * always reflects the current text value (even one the native picker cannot
 * represent, such as an alpha channel), a real, keyboard-reachable native
 * colour input for anyone who would rather pick than type, and the text
 * field itself, which stays the single source of truth either way writes
 * through.
 */
export function ColorField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const { t } = useTranslation()
  const swatchValue = /^#([0-9a-fA-F]{3}){1,2}$/u.test(value) ? value : 'transparent'
  const invalid = error !== undefined && error !== null

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as string)}
      error={error ?? null}
    >
      <div className="field__color">
        <span
          className="field__color-swatch"
          aria-hidden="true"
          style={{ backgroundColor: swatchValue }}
        />
        <input
          type="color"
          aria-label={t('fields.colorPickerLabel')}
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
