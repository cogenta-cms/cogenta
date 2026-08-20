import { type JSX, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper, fieldErrorId } from './field-wrapper.js'
import type { FieldProps } from './types.js'

interface SelectChoice {
  readonly value: string
  readonly label?: string
}

/** Options short enough that a search box would only add a step, not save one. */
const SEARCH_THRESHOLD = 10

function labelFor(choice: SelectChoice): string {
  return choice.label ?? choice.value
}

/**
 * `many: true` (task 4): a checkbox group, not a custom `aria-multiselectable`
 * listbox — the WAI-ARIA Authoring Practices' own recommendation for "choose
 * zero or more from a list" is a checkbox group precisely because it is
 * keyboard- and screen-reader-correct for free, where a hand-rolled listbox
 * would need its own arrow-key and typeahead handling to reach the same bar.
 * Chosen values also show as removable tokens above the list, so reviewing
 * a long selection does not mean scrolling the whole options list to find
 * the checked ones.
 */
function ManySelectField({
  id,
  field,
  value,
  onChange,
  disabled,
  options,
}: FieldProps<readonly string[]> & { readonly options: readonly SelectChoice[] }): JSX.Element {
  const { t } = useTranslation()
  const searchId = useId()
  const [query, setQuery] = useState('')

  const chosen = new Set(value)
  const showSearch = options.length > SEARCH_THRESHOLD
  const visible =
    showSearch && query.trim() !== ''
      ? options.filter((choice) =>
          labelFor(choice).toLowerCase().includes(query.trim().toLowerCase()),
        )
      : options

  function toggle(optionValue: string): void {
    onChange(
      chosen.has(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue],
    )
  }

  return (
    <div className="field__select-many">
      {value.length > 0 && (
        <ul className="field__select-tokens" aria-label={t('fields.selectChosenLabel')}>
          {value.map((optionValue) => {
            const choice = options.find((candidate) => candidate.value === optionValue)
            return (
              <li key={optionValue} className="field__select-token">
                <span>{choice === undefined ? optionValue : labelFor(choice)}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={t('fields.selectRemoveToken', {
                      label: choice === undefined ? optionValue : labelFor(choice),
                    })}
                    onClick={() => toggle(optionValue)}
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showSearch && (
        <div>
          <label htmlFor={searchId} className="field__select-search-label">
            {t('fields.selectSearchLabel')}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}

      <fieldset className="field__select-options" aria-label={field.admin?.label ?? field.name}>
        {visible.length === 0 ? (
          <p className="field__placeholder">{t('fields.selectNoMatches')}</p>
        ) : (
          visible.map((choice) => (
            <label key={choice.value} className="field__select-option">
              <input
                type="checkbox"
                id={`${id}-${choice.value}`}
                checked={chosen.has(choice.value)}
                disabled={disabled}
                onChange={() => toggle(choice.value)}
              />
              {labelFor(choice)}
            </label>
          ))
        )}
      </fieldset>
    </div>
  )
}

export function SelectField({
  id,
  field,
  value,
  onChange,
  disabled = false,
  error,
}: FieldProps<string | readonly string[]>): JSX.Element {
  const options = field.options as {
    readonly options: readonly SelectChoice[]
    readonly many?: boolean
  }
  const invalid = error !== undefined && error !== null

  if (options.many === true) {
    const manyValue = Array.isArray(value) ? value : []
    return (
      <FieldWrapper id={id} field={field} error={error ?? null}>
        <ManySelectField
          id={id}
          field={field}
          value={manyValue}
          onChange={onChange}
          disabled={disabled}
          options={options.options}
        />
      </FieldWrapper>
    )
  }

  const singleValue = typeof value === 'string' ? value : ''

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={singleValue}
      onReset={() => onChange(field.default as string)}
      error={error ?? null}
    >
      <select
        id={id}
        required={field.required}
        disabled={disabled}
        value={singleValue}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled hidden>
          —
        </option>
        {options.options.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {labelFor(choice)}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}
