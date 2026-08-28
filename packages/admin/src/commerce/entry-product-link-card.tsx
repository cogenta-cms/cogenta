import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { findProductByContent, type Product } from '../api/commerce-client.js'
import { Card, CardBody } from '../ui/index.js'

/**
 * The reverse of the products screen's `ProductContentLink` (fiche 51
 * task 1): a content entry, told whether a commercial record points back at
 * it. Renders nothing for the overwhelming majority of entries, which have
 * no product at all — the whole point of checking is to surface the rare
 * case where one does, not to add a permanent, mostly-empty card.
 */
export function EntryProductLinkCard({
  token,
  collection,
  entryId,
}: {
  readonly token: string
  readonly collection: string
  readonly entryId: string
}): JSX.Element | null {
  const { t } = useTranslation()
  const [product, setProduct] = useState<Product | null>(null)

  useEffect(() => {
    let cancelled = false
    findProductByContent(token, collection, entryId)
      .then((result) => {
        if (!cancelled) setProduct(result.product)
      })
      .catch(() => {
        if (!cancelled) setProduct(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, collection, entryId])

  if (product === null) return null

  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          {t('entryEdit.linkedProductLabel')}
        </span>
        <span className="text-sm">
          {t('entryEdit.linkedProductName', { title: product.title })}
        </span>
        <Link to="/commerce/products" className="text-xs">
          {t('entryEdit.linkedProductOpen')}
        </Link>
      </CardBody>
    </Card>
  )
}
