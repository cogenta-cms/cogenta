import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { listMedia, type MediaAsset } from '../api/media-client.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { UploadForm } from '../media/upload-form.js'
import { Button, Modal } from '../ui/index.js'

const PAGE_SIZE = 24

/**
 * Image insertion (fiche 04 task 3): browse the media library or upload a
 * new file, in one modal reused for both entry points — the toolbar's
 * "insert image" button and the editor's drag-and-drop drop zone.
 *
 * `initialFile` is what makes those two entry points the same component
 * rather than two: a drop skips straight to the upload form with the file
 * already chosen, so the only thing left to ask is the alt text —
 * `UploadForm` itself, unmodified in its validation, is what still requires
 * it unless the image is marked decorative.
 */
export function ImageInsertModal({
  open,
  onOpenChange,
  token,
  initialFile,
  onInsert,
}: {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly token: string
  readonly initialFile?: File
  onInsert(assetId: string, caption: string): void
}): JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'browse' | 'upload'>(
    initialFile === undefined ? 'browse' : 'upload',
  )

  useEffect(() => {
    if (open) setMode(initialFile === undefined ? 'browse' : 'upload')
  }, [open, initialFile])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('richText.imageDialogTitle')}
      closeLabel={t('common.cancel')}
    >
      {initialFile === undefined && (
        <div className="flex gap-2" role="tablist" aria-label={t('richText.imageModeLabel')}>
          <Button
            type="button"
            size="sm"
            variant={mode === 'browse' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={mode === 'browse'}
            onClick={() => setMode('browse')}
          >
            {t('richText.imageModeBrowse')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'upload' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => setMode('upload')}
          >
            {t('richText.imageModeUpload')}
          </Button>
        </div>
      )}

      {mode === 'browse' ? (
        <ImageBrowsePanel
          token={token}
          onPick={(asset) => {
            onInsert(asset.id, '')
            onOpenChange(false)
          }}
        />
      ) : (
        <UploadForm
          token={token}
          {...(initialFile === undefined ? {} : { initialFile })}
          onUploaded={(asset) => {
            onInsert(asset.id, '')
            onOpenChange(false)
          }}
        />
      )}
    </Modal>
  )
}

function ImageBrowsePanel({
  token,
  onPick,
}: {
  readonly token: string
  onPick(asset: MediaAsset): void
}): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<readonly MediaAsset[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(after?: string): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const page = await listMedia(token, {
        limit: PAGE_SIZE,
        kind: 'image',
        ...(after === undefined ? {} : { cursor: after }),
      })
      setItems((current) => (after === undefined ? page.items : [...current, ...page.items]))
      setHasMore(page.hasMore)
      setCursor(page.nextCursor ?? undefined)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.loadError'))
    } finally {
      setLoading(false)
    }
  }

  // Loads once per mount — the browse panel is remounted each time the modal
  // reopens, which is enough for a freshly uploaded image to show up.
  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {error !== null && <p role="alert">{error}</p>}
      {loading && items.length === 0 && <p>{t('common.loading')}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('fields.mediaNoImages')}</p>
      )}

      {items.length > 0 && (
        <ul className="m-0 grid grid-cols-3 list-none gap-2 p-0">
          {items.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onPick(asset)}
                className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-md border border-input bg-card p-1 hover:bg-accent"
              >
                <MediaThumbnail token={token} id={asset.id} alt={asset.alt} previewable />
                <span className="w-full truncate text-xs">{asset.filename}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          {t('richText.loadMore')}
        </Button>
      )}
    </div>
  )
}
