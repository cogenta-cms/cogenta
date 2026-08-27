import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Product, type ProductTerm, setProductTerms } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Notice, Select } from '../ui/index.js'

/**
 * A product's classification against a taxonomy the site declares
 * (`schema@2.0`, ADR-0022, fiche 51 task 3) — governed server-side by
 * `commerce.catalog.write`, the decision this session took and traced in
 * `router.ts`'s own comment: categorising a product is catalogue work, not a
 * reason to couple this router to contract A's separate `canTerm` layer.
 *
 * One taxonomy at a time, chosen from whichever the site declares — a site
 * with no taxonomy at all (most sites) sees nothing here, same as the
 * taxonomy field already does in the content editor. `existingTerms` comes
 * from `readProduct`, already fetched by the screen that renders this —
 * fetching it a second time here would only risk showing something stale
 * the moment the two disagree.
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

  async function save(): Promise<void> {
    if (taxonomy === '') return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await setProductTerms(token, product.id, taxonomy, selected)
      onSaved([...existingTerms.filter((term) => term.taxonomy !== taxonomy), ...result.terms])
      setNotice(t('commerceProducts.categorySaved'))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.categoryError'))
    } finally {
      setSaving(false)
    }
  }

  if (taxonomies.length === 0) return null

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
        {terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('commerceProducts.categoryEmpty')}</p>
        ) : (
          <Select
            multiple
            aria-label={t('commerceProducts.categoryTerms')}
            value={selected}
            onChange={(event) =>
              setSelected([...event.target.selectedOptions].map((option) => option.value))
            }
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {`${'— '.repeat(term.depth)}${labelOf(term)}`}
              </option>
            ))}
          </Select>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={saving || taxonomy === ''}
          onClick={() => void save()}
        >
          {t('commerceProducts.categorySave')}
        </Button>
      </div>
    </div>
  )
}
