import { type ChangeEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { listMedia, type MediaAsset, uploadMediaMultipart } from '../api/media-client.js'
import { FileButton, Input, Modal, Notice } from '../ui/index.js'
import '../styles/media.css'
import { MediaThumbnail } from './media-thumbnail.js'

interface AvatarPickerProps {
  readonly open: boolean
  readonly token: string
  /** The image currently chosen, highlighted in the grid. */
  readonly selectedId: string | null
  onOpenChange(open: boolean): void
  onPick(asset: MediaAsset): void
}

/**
 * Chooses an account picture from the media library, in a dialog (WordPress
 * does the same): searchable by file name, with the option to upload a new
 * image on the spot. It used to unfold a field-sized picker inline, whose
 * round thumbnails overlapped and whose "Cancel" button fell out of view.
 */
export function AvatarPicker({
  open,
  token,
  selectedId,
  onOpenChange,
  onPick,
}: AvatarPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [choices, setChoices] = useState<readonly MediaAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(() => {
      listMedia(token, { kind: 'image', limit: 60, q: query }).then(
        (page) => {
          if (cancelled) return
          setChoices(page.items)
          setError(null)
        },
        (caught: unknown) => {
          if (cancelled) return
          setError(caught instanceof ApiError ? caught.message : t('profile.avatarLoadError'))
        },
      )
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, token, query, t])

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setUploading(true)
    setError(null)
    try {
      const asset = await uploadMediaMultipart(token, file, {
        alt: file.name.replace(/\.[^.]+$/u, ''),
      })
      onPick(asset)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('profile.avatarUploadError'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('profile.avatarPickerTitle')}
      closeLabel={t('common.close')}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              aria-label={t('profile.avatarSearch')}
              placeholder={t('profile.avatarSearch')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <FileButton
            accept="image/*"
            size="sm"
            label={uploading ? t('profile.avatarUploading') : t('profile.avatarUpload')}
            emptyLabel=""
            disabled={uploading}
            aria-label={t('profile.avatarUpload')}
            onChange={(event) => void upload(event)}
          />
        </div>
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}
        {choices === null && error === null && (
          <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        {choices !== null && choices.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">
            {query.trim() === '' ? t('fields.mediaNoImages') : t('profile.avatarNoMatch')}
          </p>
        )}
        {choices !== null && choices.length > 0 && (
          <ul className="m-0 grid max-h-[55vh] list-none grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
            {choices.map((choice) => (
              <li key={choice.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={choice.id === selectedId}
                  onClick={() => onPick(choice)}
                  className="flex w-full cursor-pointer flex-col gap-1.5 rounded-md border border-border bg-card p-1.5 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-ring/40"
                >
                  <span className="block aspect-square overflow-hidden rounded-sm [&_.media-thumbnail]:h-full [&_.media-thumbnail]:object-cover">
                    <MediaThumbnail token={token} id={choice.id} alt={choice.alt} previewable />
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{choice.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
