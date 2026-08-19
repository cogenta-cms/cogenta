import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

interface SelectChoice {
  readonly value: string
  readonly label?: string
}

export function SelectField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<string>): JSX.Element {
  const { t } = useTranslation()
  const options = field.options as {
    readonly options: readonly SelectChoice[]
    readonly many?: boolean
  }
  const invalid = error !== undefined && error !== null

  // `many: true` is a real option this package will need (task 7 or later);
  // a single `<select>` cannot represent it, so it is refused rather than
  // silently edited wrong.
  if (options.many === true) {
    return (
      <FieldWrapper id={id} field={field}>
        <p role="alert">{t('fields.selectMultiNotSupported')}</p>
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <select
        id={id}
        required={field.required}
        disabled={disabled}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled hidden>
          —
        </option>
        {options.options.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label ?? choice.value}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}
