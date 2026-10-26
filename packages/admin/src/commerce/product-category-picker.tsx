import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Product, type ProductTerm, setProductTerms } from '../api/commerce-client.js'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { useSchema } from '../schema/schema-context.js'
import { Notice, Select } from '../ui/index.js'
import { commerceErrorMessage } from './commerce-errors.js'

/**
 * A product's classification against a taxonomy the site declares
 * (`schema@2.0`, ADR-0022, fiche 51 task 3) — governed server-side by
 * `commerce.catalog.write`, the decision this session took and traced in
 * `router.ts`'s own comment: categorising a product is catalogue work, not a
 * reason to couple this router to contract A's separate `canTerm` layer.
 *
 * One taxonomy at a time, chosen from whichever the site declares. A site
 * with no taxonomy at all says so explicitly (`categoryNoTaxonomy`) rather
 * than rendering a heading with nothing under it — the silent `null` this
 * used to return was itself reported as confusing (a "Catégorie" heading
 * followed by nothing looks broken, not "there is nothing to configure").
 * `existingTerms` comes from `readProduct`, already fetched by the screen
 * that renders this — fetching it a second time here would only risk
 * showing something stale the moment the two disagree.
 */
export function ProductCategoryPicker({
  token,
  product,
  existingTerms,
  onSaved,
}: {
  readonly token: string
  readonly product: Product
  readonly existingTerms: readonly ProductTerm[]
  onSaved(terms: readonly ProductTerm[]): void
}): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const schema = useSchema()
  const taxonomies = schema.status === 'ready' ? (schema.schema.taxonomies ?? []) : []

  const [taxonomy, setTaxonomy] = useState(taxonomies[0]?.name ?? '')
  const [terms, setTerms] = useState<readonly Term[]>([])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (taxonomy === '') return
    let cancelled = false
    listTerms(token, taxonomy)
      .then((found) => {
        if (!cancelled) setTerms(found)
      })
      .catch(() => {
        if (!cancelled) setTerms([])
      })
    return () => {
      cancelled = true
    }
  }, [token, taxonomy])

  useEffect(() => {
    setSelected(
      existingTerms.filter((term) => term.taxonomy === taxonomy).map((term) => term.termId),
    )
  }, [existingTerms, taxonomy])

  const labelOf = (term: Term): string =>
    term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug

  /** Each tick is saved at once — there is no separate "save the categories" step to forget. */
  async function toggle(termId: string): Promise<void> {
    if (taxonomy === '') return
    const next = selected.includes(termId)
      ? selected.filter((id) => id !== termId)
      : [...selected, termId]
    setSelected(next)
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await setProductTerms(token, product.id, taxonomy, next)
      onSaved([...existingTerms.filter((term) => term.taxonomy !== taxonomy), ...result.terms])
      setNotice(t('commerceProducts.categorySaved'))
    } catch (caught) {
      setSelected(selected)
      setError(commerceErrorMessage(t, caught, 'commerceProducts.categoryError'))
    } finally {
      setSaving(false)
    }
  }

  if (taxonomies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('commerceProducts.categoryNoTaxonomy')}</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {notice !== null && (
        <Notice tone="success" live="polite">
          <p>{notice}</p>
        </Notice>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {taxonomies.length > 1 && (
          <Select
            aria-label={t('commerceProducts.categoryTaxonomy')}
            value={taxonomy}
            onChange={(event) => setTaxonomy(event.target.value)}
          >
            {taxonomies.map((candidate) => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.labels.singular[i18n.language] ??
                  Object.values(candidate.labels.singular)[0] ??
                  candidate.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {terms.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{t('commerceProducts.categoryEmpty')}</p>
      ) : (
        <ul
          aria-label={t('commerceProducts.categoryTerms')}
          className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-y-auto rounded-md border border-input bg-card p-2"
        >
          {terms.map((term) => (
            <li key={term.id} style={{ paddingLeft: `${term.depth * 1.25}rem` }}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(term.id)}
                  disabled={saving}
                  onChange={() => void toggle(term.id)}
                />
                {labelOf(term)}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
