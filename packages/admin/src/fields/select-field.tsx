import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
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
}: FieldProps<string>): JSX.Element {
  const options = field.options as {
    readonly options: readonly SelectChoice[]
    readonly many?: boolean
  }

  // `many: true` is a real option this package will need (task 7 or later);
  // a single `<select>` cannot represent it, so it is refused rather than
  // silently edited wrong.
  if (options.many === true) {
    return (
      <FieldWrapper id={id} field={field}>
        <p role="alert">
          Ce champ accepte plusieurs valeurs ; l'éditeur correspondant n'est pas encore disponible.
        </p>
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper id={id} field={field}>
      <select
        id={id}
        required={field.required}
        disabled={disabled}
        value={value}
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
