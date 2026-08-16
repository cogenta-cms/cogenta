import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { listMedia, type MediaAsset } from '../api/media-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaDetail } from '../media/media-detail.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { UploadForm } from '../media/upload-form.js'
import { Card, CardBody, CardHeader, CardTitle, Modal, Notice } from '../ui/index.js'

/** L2 task 11: upload, list, focal point, alt-text/decorative — no crop, no variant picker, since the render pipeline already produces those lazily from the original. */
export function MediaRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [items, setItems] = useState<readonly MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      const page = await listMedia(token)
      setItems(page.items)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  if (token === null) return <p>{t('common.loading')}</p>

  const selected = items.find((item) => item.id === selectedId) ?? null

  return (
    <section aria-labelledby="media-heading" className="flex flex-col gap-6">
      <h1 id="media-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('media.heading')}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('media.uploadHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <UploadForm
            token={token}
            onUploaded={(asset) => setItems((current) => [asset, ...current])}
          />
        </CardBody>
      </Card>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-0">
          {items.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setSelectedId(asset.id)}
                className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-card transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MediaThumbnail
                  token={token}
                  id={asset.id}
                  alt={asset.alt}
                  previewable={asset.kind === 'image'}
                />
                <span className="w-full truncate text-xs">{asset.filename}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-sm text-muted-foreground">{t('media.empty')}</li>
          )}
        </ul>
      )}

      <Modal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        title={selected?.filename ?? ''}
        closeLabel={t('media.detailCloseLabel')}
      >
        {selected !== null && (
          <MediaDetail
            token={token}
            asset={selected}
            onChange={(updated) =>
              setItems((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onDeleted={(id) => {
              setItems((current) => current.filter((item) => item.id !== id))
              setSelectedId(null)
            }}
          />
        )}
      </Modal>
    </section>
  )
}
