import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { useAuth } from '../auth/auth-context.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * `f.taxonomy({ of, many })` (`schema@2.0`, ADR-0022) — a real picker, unlike
 * `RelationField`'s placeholder, because a taxonomy has exactly one endpoint
 * that lists every term of it in tree order and there is nothing to paginate.
 *
 * Deliberately a plain `<select>`: L11 owns how this looks. What matters is
 * that it writes what the store expects — an ordered list of term ids for a
 * to-many field, a single id (or null) otherwise.
 */
export function TaxonomyField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<unknown>): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const options = field.options as { readonly of?: string; readonly many?: boolean }
  const taxonomy = options.of ?? ''
  const many = options.many !== false

  const [terms, setTerms] = useState<readonly Term[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (token === null || taxonomy === '') return

    listTerms(token, taxonomy)
      .then((found) => {
        if (!cancelled) setTerms(found)
      })
      .catch(() => {
        // A taxonomy this actor may not read is not an error to shout about
        // in a form: the field simply has nothing to offer, and the API
        // refuses the write anyway if one is attempted.
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [token, taxonomy])

  const selected = many
    ? Array.isArray(value)
      ? value.map(String)
      : []
    : typeof value === 'string'
      ? [value]
      : []

  function change(event: React.ChangeEvent<HTMLSelectElement>): void {
    const chosen = [...event.target.selectedOptions].map((option) => option.value)
    // A to-many field's empty case is `[]`; a to-one's is `null`. Two
    // spellings of empty is exactly what the store refuses to accept.
    onChange(many ? chosen : (chosen[0] ?? null))
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      {failed || terms.length === 0 ? (
        <p className="field__placeholder">{t('fields.taxonomyEmpty', { taxonomy })}</p>
      ) : (
        <select
          id={id}
          multiple={many}
          value={many ? selected : (selected[0] ?? '')}
          disabled={disabled}
          onChange={change}
        >
          {!many && <option value="">{t('fields.taxonomyNone')}</option>}
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {/* Indented by depth: the API returns the tree in tree order,
                  so this is all it takes to show the shape of it. */}
              {`${'— '.repeat(term.depth)}${
                term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug
              }`}
            </option>
          ))}
        </select>
      )}
    </FieldWrapper>
  )
}
