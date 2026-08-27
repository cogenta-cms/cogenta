import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listLowStockVariants,
  type Product,
  readProduct,
  type Variant,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import {
  Button,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * The "stock bas" alert (fiche 51 task 4) — every variant at or below its own
 * threshold, resolved back to the product that owns it (a variant carries
 * only `productId`) so the row reads like a shop, not a database dump.
 */
export function LowStockPanel({
  token,
  onManage,
}: {
  readonly token: string
  onManage(product: Product): void
}): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<readonly { variant: Variant; product: Product }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listLowStockVariants(token)
      .then(async ({ variants }) => {
        const productIds = [...new Set(variants.map((variant) => variant.productId))]
        const products = new Map(
          await Promise.all(
            productIds.map(async (id) => [id, (await readProduct(token, id)).product] as const),
          ),
        )
        if (cancelled) return
        setRows(
          variants
            .map((variant) => {
              const product = products.get(variant.productId)
              return product === undefined ? null : { variant, product }
            })
            .filter((row): row is { variant: Variant; product: Product } => row !== null),
        )
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : t('commerceProducts.lowStockError'),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, t])

  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}
      {!loading && error === null && (
        <TableRoot label={t('commerceProducts.lowStockTableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('commerceProducts.titleColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.skuColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.stockColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.lowStockThresholdColumn')}</TableHeader>
                <TableHeader>{t('commerceProducts.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ variant, product }) => (
                <TableRow key={variant.id}>
                  <TableCell>{product.title}</TableCell>
                  <TableCell>{variant.sku}</TableCell>
                  <TableCell>{variant.onHand}</TableCell>
                  <TableCell>{variant.lowStockThreshold}</TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" onClick={() => onManage(product)}>
                      {t('commerceProducts.manageVariants')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableEmpty colSpan={5}>{t('commerceProducts.lowStockEmpty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </div>
  )
}
