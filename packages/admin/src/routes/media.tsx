import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { listMedia, type MediaAsset } from '../api/media-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaDetail } from '../media/media-detail.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { UploadForm } from '../media/upload-form.js'
import '../styles/media.css'

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
    <section aria-labelledby="media-heading">
      <h1 id="media-heading">{t('media.heading')}</h1>

      <UploadForm
        token={token}
        onUploaded={(asset) => setItems((current) => [asset, ...current])}
      />

      {error !== null && <p role="alert">{error}</p>}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <ul className="media-grid">
          {items.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className="media-grid__item"
                onClick={() => setSelectedId(asset.id)}
              >
                <MediaThumbnail
                  token={token}
                  id={asset.id}
                  alt={asset.alt}
                  previewable={asset.kind === 'image'}
                />
                <span className="media-grid__filename">{asset.filename}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li>{t('media.empty')}</li>}
        </ul>
      )}

      {selected !== null && (
        <MediaDetail
          token={token}
          asset={selected}
          onChange={(updated) =>
            setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
          }
          onDeleted={(id) => {
            setItems((current) => current.filter((item) => item.id !== id))
            setSelectedId(null)
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  )
}
