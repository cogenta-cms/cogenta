import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateVariant, type Variant } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { MediaPicker } from '../fields/media-picker.js'
import { Notice } from '../ui/index.js'

/**
 * A single variant's own photo (a colour, a size) — never a list, unlike
 * `ProductImagesField`'s gallery: one variant is one sellable thing. Saved
 * immediately on pick/remove, the same convention `ProductImagesField`
 * already follows, and independent of the rest of the variant edit form's
 * own submit (SKU/price/stock) — a media reference has no "blur" event to
 * save on, and there is no reason to make a photo change wait on whatever
 * else that form happens to be mid-edit.
 */
export function VariantImageField({
  token,
  variant,
  onChanged,
}: {
  readonly token: string
  readonly variant: Variant
  onChanged(): Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(ids: readonly string[]): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await updateVariant(token, variant.id, { imageMediaId: ids[0] ?? null })
      await onChanged()
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
        id={`variant-image-${variant.id}`}
        token={token}
        accept={['image']}
        many={false}
        value={variant.imageMediaId === null ? [] : [variant.imageMediaId]}
        disabled={saving}
        onChange={(ids) => void save(ids)}
      />
    </div>
  )
}
