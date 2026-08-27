import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type Product, updateProduct } from '../api/commerce-client.js'
import { createEntry, type Entry, getEntry } from '../api/content-client.js'
import { ApiError } from '../api/http.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Notice, Select } from '../ui/index.js'

/**
 * A product's link to its editorial face (fiche 51 task 1, `contentRef`).
 *
 * Deliberately shows what a real content entry offers that the commercial
 * record never will — a photo and a description — rather than just a raw
 * collection/id pair: "produit affiche ses photos et sa description via
 * contentRef" is the acceptance bar, and a bare id string does not clear it.
 * The photo/description are found by field *kind* (the first `media` field,
 * the first `text` field) since a collection's field names are never fixed —
 * the same heuristic `entry-edit.tsx`'s own `assistFields` already uses.
 */
export function ProductContentLink({
  token,
  product,
  onChange,
}: {
  readonly token: string
  readonly product: Product
  onChange(product: Product): void
}): JSX.Element {
  const { t } = useTranslation()
  const schema = useSchema()
  const collections = schema.status === 'ready' ? schema.schema.collections : []

  const [entry, setEntry] = useState<Entry | null>(null)
  const [entryMissing, setEntryMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chosenCollection, setChosenCollection] = useState('')

  useEffect(() => {
    setEntry(null)
    setEntryMissing(false)
    if (product.contentRef === null) return
    let cancelled = false
    const ref = product.contentRef
    getEntry(token, ref.collection, ref.entryId)
      .then((found) => {
        if (!cancelled) setEntry(found)
      })
      .catch(() => {
        if (!cancelled) setEntryMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, product.contentRef])

  async function unlink(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProduct(token, product.id, { contentRef: null })
      onChange(updated)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.contentLinkError'))
    } finally {
      setBusy(false)
    }
  }

  async function createLinked(): Promise<void> {
    if (chosenCollection === '') return
    setBusy(true)
    setError(null)
    try {
      const collection = collections.find((candidate) => candidate.name === chosenCollection)
      const titleField = collection?.fields.find((field) => field.kind === 'text')
      const created = await createEntry(
        token,
        chosenCollection,
        titleField === undefined ? {} : { [titleField.name]: product.title },
      )
      const updated = await updateProduct(token, product.id, {
        contentRef: { collection: chosenCollection, entryId: created.id },
      })
      onChange(updated)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.contentLinkError'))
    } finally {
      setBusy(false)
    }
  }

  if (product.contentRef === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t('commerceProducts.contentUnlinked')}</p>
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}
        {collections.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <Select
              aria-label={t('commerceProducts.contentLinkCollection')}
              value={chosenCollection}
              onChange={(event) => setChosenCollection(event.target.value)}
            >
              <option value="">{t('commerceProducts.contentLinkChooseCollection')}</option>
              {collections.map((collection) => (
                <option key={collection.name} value={collection.name}>
                  {collection.labels.singular}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || chosenCollection === ''}
              onClick={() => void createLinked()}
            >
              {t('commerceProducts.contentLinkCreate')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const ref = product.contentRef
  const collection = collections.find((candidate) => candidate.name === ref.collection)
  const mediaField = collection?.fields.find((field) => field.kind === 'media')
  const textField = collection?.fields.find((field) => field.kind === 'text')
  const mediaValue = mediaField === undefined ? undefined : entry?.values[mediaField.name]
  const mediaId =
    typeof mediaValue === 'string'
      ? mediaValue
      : Array.isArray(mediaValue) && typeof mediaValue[0] === 'string'
        ? (mediaValue[0] as string)
        : null
  const description =
    textField === undefined ? null : (entry?.values[textField.name] as string | undefined)

  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {entryMissing ? (
        <p role="alert" className="text-sm text-destructive">
          {t('commerceProducts.contentLinkMissing')}
        </p>
      ) : (
        <div className="flex items-start gap-3">
          {mediaId !== null && <MediaThumbnail token={token} id={mediaId} alt="" previewable />}
          <div className="flex flex-col gap-1">
            <Link
              to={`/collections/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.entryId)}`}
            >
              {t('commerceProducts.contentLinkOpen')}
            </Link>
            {description !== undefined && description !== null && description !== '' && (
              <p className="text-sm text-muted-foreground">
                {description.length > 160 ? `${description.slice(0, 160)}…` : description}
              </p>
            )}
          </div>
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => void unlink()}
      >
        {t('commerceProducts.contentLinkUnlink')}
      </Button>
    </div>
  )
}
