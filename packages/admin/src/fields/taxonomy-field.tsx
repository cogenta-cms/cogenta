import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { createTerm, listTerms, type Term } from '../api/taxonomy-client.js'
import { useAuth } from '../auth/auth-context.js'
import { COMBINING_MARKS, slugify } from '../lib/slugify.js'
import { canPerformOnTerms } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
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
 *
 * Task 5 (`08-taxonomies.md`) adds three things on top of the original
 * picker: a label/slug filter so a long taxonomy stays usable, a parent
 * mention on every child term so nesting reads without leaving the form, and
 * a quick-create control for a role that may create terms — the point being
 * to classify an entry without leaving the editor.
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
  const schemaState = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const options = field.options as { readonly of?: string; readonly many?: boolean }
  const taxonomy = options.of ?? ''
  const many = options.many !== false

  const [terms, setTerms] = useState<readonly Term[]>([])
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

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

  const labelOf = (term: Term): string =>
    term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug

  const byId = useMemo(() => new Map(terms.map((term) => [term.id, term])), [terms])

  const foldedFilter = useMemo(() => foldForSearch(filter.trim()), [filter])
  const visibleTerms = useMemo(() => {
    if (foldedFilter === '') return terms
    return terms.filter((term) => {
      if (foldForSearch(term.slug).includes(foldedFilter)) return true
      return Object.values(term.labels).some((label) => foldForSearch(label).includes(foldedFilter))
    })
  }, [terms, foldedFilter])

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

  const taxonomyDefinition =
    schemaState.status === 'ready'
      ? (schemaState.schema.taxonomies ?? []).find((candidate) => candidate.name === taxonomy)
      : undefined
  const mayCreate =
    taxonomyDefinition !== undefined && canPerformOnTerms('create', taxonomyDefinition, roles)

  async function createQuickTerm(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || newLabel.trim() === '') return

    setCreating(true)
    setCreateError(null)
    try {
      const created = await createTerm(token, taxonomy, {
        slug: slugify(newLabel),
        labels: { [i18n.language]: newLabel.trim() },
      })
      setTerms((current) => [...current, created])
      setNewLabel('')
      // Selects the freshly created term straight away: the whole point of
      // creating it here is not to have to go find it in a picker next.
      onChange(many ? [...selected, created.id] : created.id)
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : t('fields.taxonomyCreateError'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      {failed ? (
        <p className="field__placeholder">{t('fields.taxonomyEmpty', { taxonomy })}</p>
      ) : (
        <>
          {terms.length > 0 && (
            <input
              type="search"
              aria-label={t('fields.taxonomySearch')}
              placeholder={t('fields.taxonomySearch')}
              value={filter}
              disabled={disabled}
              onChange={(event) => setFilter(event.target.value)}
            />
          )}
          {terms.length === 0 ? (
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
              {visibleTerms.map((term) => {
                const parent = term.parent === null ? undefined : byId.get(term.parent)
                return (
                  <option key={term.id} value={term.id}>
                    {/* Indented by depth: the API returns the tree in tree
                        order, so this is all it takes to show the shape of
                        it. The parent's own label is appended for a child so
                        it reads on its own, without the sibling context an
                        indented list normally supplies. */}
                    {`${'— '.repeat(term.depth)}${labelOf(term)}${
                      parent === undefined ? '' : ` (${labelOf(parent)})`
                    }`}
                  </option>
                )
              })}
            </select>
          )}
          {visibleTerms.length === 0 && terms.length > 0 && (
            <p className="field__placeholder">{t('fields.taxonomyNoMatch')}</p>
          )}
        </>
      )}

      {mayCreate && (
        <form
          onSubmit={(event) => void createQuickTerm(event)}
          aria-label={t('fields.taxonomyQuickCreate')}
        >
          <input
            type="text"
            aria-label={t('fields.taxonomyNewTermLabel')}
            placeholder={t('fields.taxonomyNewTermLabel')}
            value={newLabel}
            disabled={disabled || creating}
            onChange={(event) => setNewLabel(event.target.value)}
          />
          <button type="submit" disabled={disabled || creating || newLabel.trim() === ''}>
            {t('fields.taxonomyCreate')}
          </button>
          {createError !== null && (
            <p role="alert" className="field__error">
              {createError}
            </p>
          )}
        </form>
      )}
    </FieldWrapper>
  )
}

/** Strips diacritics and case — mirrors the server's own `?q=` folding. */
function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}
