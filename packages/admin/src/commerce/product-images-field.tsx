import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Product, updateProduct } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { MediaPicker } from '../fields/media-picker.js'
import { Notice } from '../ui/index.js'

/**
 * A product's own photos, direct on the commercial record rather than only
 * reachable through `contentRef` (`ProductContentLink`) — a merchant who has
 * not linked, or does not want, an editorial entry still needs a photo to
 * sell anything. The first image is the cover shown in the product list and
 * on an order line; `MediaPicker`'s own drag reordering is how a merchant
 * changes which one that is.
 *
 * Saved on the very next pick/remove/reorder, the same convention
 * `MediaSettingField` (the admin's own branding upload) and
 * `ProductContentLink` already follow — a media reference has no "blur"
 * event of its own to save on.
 */
export function ProductImagesField({
  token,
  product,
  onChange,
}: {
  readonly token: string
  readonly product: Product
  onChange(product: Product): void
}): JSX.Element {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(ids: readonly string[]): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProduct(token, product.id, { imageMediaIds: ids })
      onChange(updated)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.imagesError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      <MediaPicker
        id={`product-images-${product.id}`}
        token={token}
        accept={['image']}
        many
        value={product.imageMediaIds}
        disabled={saving}
        onChange={(ids) => void save(ids)}
      />
      <p className="text-xs text-muted-foreground">{t('commerceProducts.imagesHint')}</p>
    </div>
  )
}
