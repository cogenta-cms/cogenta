import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listProducts, type Product, readProduct } from '../api/commerce-client.js'
import { Button, Field, Input } from '../ui/index.js'

/**
 * Chooses several products by typing their name — a coupon restricted to a
 * few products never asks for their identifiers. `valueIds` is what the parent
 * stores; the chosen products' names are looked up so the chips read as names.
 */
export interface ProductMultiPickerProps {
  readonly token: string
  readonly label: string
  readonly description?: string
  readonly valueIds: readonly string[]
  onChange(ids: readonly string[]): void
}

const SEARCH_DELAY_MS = 250

export function ProductMultiPicker({
  token,
  label,
  description,
  valueIds,
  onChange,
}: ProductMultiPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [known, setKnown] = useState<Readonly<Record<string, Product | null>>>({})
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<readonly Product[]>([])
  const [searched, setSearched] = useState(false)
  const latest = useRef(0)

  // Names of the products already chosen (an edit starts from stored ids).
  useEffect(() => {
    let cancelled = false
    for (const id of valueIds) {
      if (known[id] !== undefined) continue
      readProduct(token, id)
        .then((found) => {
          if (!cancelled) setKnown((current) => ({ ...current, [id]: found.product }))
        })
        .catch(() => {
          if (!cancelled) setKnown((current) => ({ ...current, [id]: null }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [valueIds, token, known])

  useEffect(() => {
    const text = query.trim()
    if (text === '') {
      setHits([])
      setSearched(false)
      return
    }
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      listProducts(token, { q: text, status: 'active', limit: 8 })
        .then((response) => {
          if (ticket !== latest.current) return
          setHits(response.products)
          setSearched(true)
        })
        .catch(() => {
          if (ticket !== latest.current) return
          setHits([])
          setSearched(true)
        })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, token])

  const available = hits.filter((hit) => !valueIds.includes(hit.id))

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} description={description}>
        {(control) => (
          <Input
            {...control}
            type="search"
            autoComplete="off"
            value={query}
            placeholder={t('commerceProductPicker.placeholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
      </Field>
      {query.trim() !== '' && searched && (
        <ul className="m-0 flex max-h-44 list-none flex-col overflow-y-auto rounded-md border border-border bg-card p-0">
          {available.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t('commerceProductPicker.none')}
            </li>
          )}
          {available.map((hit) => (
            <li key={hit.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                className="w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => {
                  setKnown((current) => ({ ...current, [hit.id]: hit }))
                  onChange([...valueIds, hit.id])
                  setQuery('')
                }}
              >
                {hit.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {valueIds.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {valueIds.map((id) => {
            const product = known[id]
            const name =
              product === undefined
                ? t('common.loading')
                : product === null
                  ? t('commerceProductPicker.missing')
                  : product.title
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3 text-sm"
              >
                {name}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  aria-label={t('commerceProductPicker.remove', { name })}
                  onClick={() => onChange(valueIds.filter((value) => value !== id))}
                >
                  ×
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
