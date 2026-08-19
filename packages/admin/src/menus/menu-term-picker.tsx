import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { Select } from '../ui/index.js'

/**
 * A target picker for a `taxonomy`-kind menu item (fiche 09, task 4).
 *
 * A whole taxonomy is one request, in tree order, with nothing to paginate
 * — the same reasoning `TaxonomyField` (`packages/admin/src/fields/`)
 * already relies on, and the same call it makes, so a plain `<select>`
 * indented by depth is enough here too.
 */
export function MenuTermPicker({
  token,
  taxonomy,
  value,
  onChange,
  disabled = false,
}: {
  readonly token: string
  readonly taxonomy: string
  readonly value: string | null
  onChange(termId: string, label: string): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [terms, setTerms] = useState<readonly Term[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (taxonomy === '') return
    listTerms(token, taxonomy)
      .then((found) => {
        if (!cancelled) setTerms(found)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, taxonomy])

  function labelOf(term: Term): string {
    return term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug
  }

  if (failed || terms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t('menus.pickerTermsEmpty', { taxonomy })}</p>
    )
  }

  return (
    <Select
      value={value ?? ''}
      disabled={disabled}
      aria-label={t('menus.targetTerm')}
      onChange={(event) => {
        const term = terms.find((candidate) => candidate.id === event.target.value)
        if (term !== undefined) onChange(term.id, labelOf(term))
      }}
    >
      <option value="">{t('menus.selectTerm')}</option>
      {terms.map((term) => (
        <option key={term.id} value={term.id}>
          {`${'— '.repeat(term.depth)}${labelOf(term)}`}
        </option>
      ))}
    </Select>
  )
}
