import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchVariants, type VariantSearchHit } from '../api/commerce-client.js'
import { Button, Field, Input } from '../ui/index.js'
import { formatMinor } from './money.js'

/**
 * "Pick a product" by typing a name or a SKU.
 *
 * A manual order, a subscription or a plan change never asks for an internal
 * identifier: the person types a few letters, the shop answers with the
 * matching variants (product, variant, SKU, price, stock), and a click chooses
 * one. What the screen holds afterwards is the whole hit, so it can show a name
 * rather than an id.
 */
export interface VariantPickerProps {
  readonly token: string
  readonly label: string
  readonly selected: VariantSearchHit | null
  readonly error?: string | null
  /** Variants that cannot be chosen again (already on another line). */
  readonly excludeVariantIds?: readonly string[]
  onSelect(hit: VariantSearchHit | null): void
}

const SEARCH_DELAY_MS = 250

export function VariantPicker({
  token,
  label,
  selected,
  error = null,
  excludeVariantIds = [],
  onSelect,
}: VariantPickerProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<readonly VariantSearchHit[]>([])
  const [searched, setSearched] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    const text = query.trim()
    if (text === '') {
      setHits([])
      setSearched(false)
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      searchVariants(token, text, { limit: 8, signal: controller.signal })
        .then((response) => {
          if (ticket !== latest.current) return
          setHits(response.hits)
          setSearched(true)
          setFailed(false)
        })
        .catch(() => {
          if (ticket !== latest.current || controller.signal.aborted) return
          setHits([])
          setSearched(true)
          setFailed(true)
        })
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, token])

  if (selected !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{selected.product.title}</span>
            <span className="text-xs text-muted-foreground">
              {selected.variant.title} · {selected.variant.sku} ·{' '}
              {formatMinor(selected.variant.priceMinor, selected.variant.currency, i18n.language)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect(null)
              setQuery('')
            }}
          >
            {t('commerceVariantPicker.change')}
          </Button>
        </div>
        {error !== null && (
          <p role="alert" className="m-0 text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }

  const visible = hits.filter((hit) => !excludeVariantIds.includes(hit.variant.id))
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} error={error}>
        {(control) => (
          <Input
            {...control}
            type="search"
            autoComplete="off"
            value={query}
            placeholder={t('commerceVariantPicker.placeholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
      </Field>
      {query.trim() !== '' && searched && (
        <ul
          aria-label={t('commerceVariantPicker.results')}
          className="m-0 flex max-h-56 list-none flex-col overflow-y-auto rounded-md border border-border bg-card p-0"
        >
          {failed && (
            <li className="px-3 py-2 text-sm text-destructive">
              {t('commerceVariantPicker.failed')}
            </li>
          )}
          {!failed && visible.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t('commerceVariantPicker.none')}
            </li>
          )}
          {visible.map((hit) => (
            <li key={hit.variant.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => {
                  onSelect(hit)
                  setQuery('')
                  setHits([])
                }}
              >
                <span className="text-sm font-medium text-foreground">{hit.product.title}</span>
                <span className="text-xs text-muted-foreground">
                  {hit.variant.title} · {hit.variant.sku} ·{' '}
                  {formatMinor(hit.variant.priceMinor, hit.variant.currency, i18n.language)} ·{' '}
                  {hit.variant.onHand > 0
                    ? t('commerceVariantPicker.inStock', { count: hit.variant.onHand })
                    : hit.variant.allowBackorder
                      ? t('commerceVariantPicker.backorder')
                      : t('commerceVariantPicker.outOfStock')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
