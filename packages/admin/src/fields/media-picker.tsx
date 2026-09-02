import { type DragEvent, type JSX, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  getMedia,
  listMedia,
  listMediaFolders,
  type MediaAsset,
  type MediaFolder,
  type MediaKind,
  mediaKindFor,
} from '../api/media-client.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { UploadForm } from '../media/upload-form.js'
import { useUploadQueue } from '../media/upload-queue.js'
import '../styles/entry-picker.css'
import '../styles/media.css'
import { cn } from '../ui/cn.js'
import { Button, Input, Label, Modal, Select } from '../ui/index.js'

/**
 * The reusable media picker (fiche 03 task 3): browse-and-search the media
 * library, filtered by whatever `f.media({ accept })` actually declared —
 * never the `kind: 'image'` constant the old single-value field hard-coded —
 * upload directly from the field (both the drop zone below and a form
 * inside the browse dialog), and reorder a `many: true` selection.
 */
export interface MediaPickerProps {
  readonly id: string
  readonly token: string
  /** The full four kinds means "no constraint declared" — every asset is offered. */
  readonly accept: readonly MediaKind[]
  readonly many: boolean
  readonly value: readonly string[]
  onChange(ids: readonly string[]): void
  readonly disabled?: boolean
}

const PAGE_SIZE = 24

function accepts(accept: readonly MediaKind[], asset: Pick<MediaAsset, 'kind'>): boolean {
  return accept.includes(asset.kind)
}

export function MediaPicker({
  id,
  token,
  accept,
  many,
  value,
  onChange,
  disabled = false,
}: MediaPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [resolved, setResolved] = useState<Readonly<Record<string, MediaAsset | 'unresolved'>>>({})
  const [browsing, setBrowsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  // `value` read fresh inside the upload queue's completion callback rather
  // than closed over: several dropped files now upload concurrently (fiche
  // 05 task 1), and two completions landing close together must each see
  // the other's addition, not a `value` snapshot from whenever `enqueue()`
  // was called.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const uploads = useUploadQueue(token, (asset) => {
    setResolved((current) => ({ ...current, [asset.id]: asset }))
    const next = many
      ? valueRef.current.includes(asset.id)
        ? valueRef.current
        : [...valueRef.current, asset.id]
      : [asset.id]
    valueRef.current = next
    onChange(next)
  })

  useEffect(() => {
    let cancelled = false
    if (value.length === 0) {
      setResolved({})
      return
    }
    Promise.all(
      value.map((assetId) =>
        getMedia(token, assetId)
          .then((asset): readonly [string, MediaAsset] => [assetId, asset])
          .catch((): readonly [string, 'unresolved'] => [assetId, 'unresolved']),
      ),
    ).then((entries) => {
      if (!cancelled) setResolved(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [token, value])

  function remove(assetId: string): void {
    onChange(value.filter((candidate) => candidate !== assetId))
  }

  function moveTo(assetId: string, toIndex: number): void {
    const fromIndex = value.indexOf(assetId)
    if (fromIndex === -1 || toIndex < 0 || toIndex >= value.length) return
    const next = [...value]
    const [moved] = next.splice(fromIndex, 1)
    if (moved === undefined) return
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  function pick(asset: MediaAsset): void {
    setResolved((current) => ({ ...current, [asset.id]: asset }))
    if (many) {
      if (!value.includes(asset.id)) onChange([...value, asset.id])
    } else {
      onChange([asset.id])
      setBrowsing(false)
    }
  }

  /**
   * Real multipart uploads, bounded to `MAX_CONCURRENT_UPLOADS` in parallel
   * (fiche 05 task 1) — a dropped file carries no alt text to ask for, so it
   * is filed decorative-by-necessity rather than blocked outright, exactly
   * as before; the media library remains the place to add a real
   * description later. What changed is the transport (`useUploadQueue`'s
   * pool, real multipart, real byte progress) and that several dropped
   * files now genuinely upload at once instead of one at a time.
   */
  function uploadFiles(files: readonly File[]): void {
    setDropError(null)
    for (const file of files) {
      const kind = mediaKindFor(file.type)
      if (!accepts(accept, { kind })) {
        setDropError(t('fields.mediaDropRejected', { filename: file.name }))
        continue
      }
      uploads.enqueue(file, {
        decorative: true,
        decorativeJustification: t('fields.mediaDropJustification'),
      })
    }
  }

  function handleDrop(event: DragEvent<HTMLFieldSetElement>): void {
    event.preventDefault()
    setDragOver(false)
    if (disabled) return
    const files = [...event.dataTransfer.files]
    if (files.length > 0) uploadFiles(many ? files : files.slice(0, 1))
  }

  return (
    <fieldset
      id={id}
      // A `<fieldset>` rather than a plain `<div>`: a static element with
      // drag handlers needs container semantics (`noStaticElementInteractions`),
      // and this groups the same controls a `<fieldset>` is for — every
      // action the drop zone enables (choose, remove, reorder, upload) also
      // exists as a real button below, so it is a convenience, never the
      // only path (fiche 03: "le glisser-déposer ne doit jamais être le
      // seul chemin").
      aria-label={t('fields.mediaDropHint')}
      className={cn('media-picker', dragOver && 'media-picker--drag-over')}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {value.length === 0 ? (
        <p className="entry-picker__empty">{t('fields.mediaEmptyMulti')}</p>
      ) : (
        <ol className="media-picker__selected" aria-label={t('fields.mediaSelectedLabel')}>
          {value.map((assetId, index) => {
            const asset = resolved[assetId]
            return (
              <li
                key={assetId}
                draggable={!disabled && many}
                onDragStart={(event) => {
                  event.stopPropagation()
                  event.dataTransfer.setData('application/x-cogenta-media-picker-id', assetId)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (many) {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                }}
                onDrop={(event) => {
                  if (!many) return
                  event.preventDefault()
                  event.stopPropagation()
                  const dragged = event.dataTransfer.getData(
                    'application/x-cogenta-media-picker-id',
                  )
                  if (dragged !== '') moveTo(dragged, index)
                }}
                className="media-picker__item"
              >
                {asset === undefined || asset === 'unresolved' ? (
                  <span className="media-thumbnail media-thumbnail--loading" aria-hidden="true" />
                ) : (
                  <MediaThumbnail
                    token={token}
                    id={asset.id}
                    alt={asset.alt}
                    previewable={asset.kind === 'image'}
                  />
                )}
                <span className="media-picker__filename">
                  {asset === undefined
                    ? t('common.loading')
                    : asset === 'unresolved'
                      ? t('fields.mediaUnresolved', { id: assetId })
                      : asset.filename}
                </span>
                {!disabled && (
                  <span className="media-picker__item-actions">
                    {many && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label={t('entryPicker.moveUp', { position: index + 1 })}
                          onClick={() => moveTo(assetId, index - 1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === value.length - 1}
                          aria-label={t('entryPicker.moveDown', { position: index + 1 })}
                          onClick={() => moveTo(assetId, index + 1)}
                        >
                          ↓
                        </Button>
                      </>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(assetId)}>
                      {t('fields.mediaRemove')}
                    </Button>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {!disabled && (many || value.length === 0) && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setBrowsing(true)}>
          {many ? t('fields.mediaAdd') : t('fields.mediaChoose')}
        </Button>
      )}
      {!disabled && !many && value.length > 0 && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setBrowsing(true)}>
          {t('fields.mediaChange')}
        </Button>
      )}

      {!disabled && <p className="media-picker__drop-hint">{t('fields.mediaDropHint')}</p>}
      {dropError !== null && (
        <p role="alert" className="entry-picker__notice">
          {dropError}
        </p>
      )}

      {uploads.items.some((item) => item.status !== 'done') && (
        <ul className="media-picker__upload-queue" aria-label={t('media.uploadQueueHeading')}>
          {uploads.items
            .filter((item) => item.status !== 'done')
            .map((item) => (
              <li key={item.id}>
                {item.status === 'failed' ? (
                  <span role="alert" className="media-picker__upload-error">
                    {item.filename}: {item.error ?? t('media.uploadError')}
                    <button type="button" onClick={() => uploads.retry(item.id)}>
                      {t('media.retryUpload')}
                    </button>
                  </span>
                ) : (
                  <span>
                    {item.filename} —{' '}
                    {t(
                      item.status === 'uploading'
                        ? 'media.uploadInProgress'
                        : 'media.uploadPending',
                      { filename: item.filename },
                    )}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}

      <Modal
        open={browsing}
        onOpenChange={setBrowsing}
        title={t('fields.mediaDialogTitle')}
        closeLabel={t('common.cancel')}
      >
        {browsing && <BrowsePanel token={token} accept={accept} selected={value} onPick={pick} />}
      </Modal>
    </fieldset>
  )
}

function BrowsePanel({
  token,
  accept,
  selected,
  onPick,
}: {
  readonly token: string
  readonly accept: readonly MediaKind[]
  readonly selected: readonly string[]
  onPick(asset: MediaAsset): void
}): JSX.Element {
  const { t } = useTranslation()
  const searchId = useId()
  const folderFilterId = useId()
  const [items, setItems] = useState<readonly MediaAsset[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [uploading, setUploading] = useState(false)
  // Fiche 05 task 4: '' means "every folder", the only meaning `<select>`
  // can express with a plain empty option — `listMedia`'s own `null` for
  // "unclassified" is a real, distinct choice, offered as its own option.
  const [folders, setFolders] = useState<readonly MediaFolder[]>([])
  const [folderFilter, setFolderFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    listMediaFolders(token)
      .then((found) => {
        if (!cancelled) setFolders(found)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  // The server filters by exactly one `kind`; a field constrained to a
  // proper subset of more than one kind (`accept: ['image', 'video']`) is
  // filtered client-side after the fact instead — a real limitation of
  // `GET /api/media`'s query shape, not something this picker can paper
  // over without asking the server for more than it can answer today.
  const singleKindFilter = accept.length === 1 ? accept[0] : undefined

  const load = useCallback(
    async (after?: string): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const page = await listMedia(token, {
          limit: PAGE_SIZE,
          ...(singleKindFilter === undefined ? {} : { kind: singleKindFilter }),
          ...(after === undefined ? {} : { cursor: after }),
          ...(submitted === '' ? {} : { q: submitted }),
          ...(folderFilter === ''
            ? {}
            : { folderId: folderFilter === 'unclassified' ? null : folderFilter }),
        })
        const filtered = page.items.filter((asset) => accepts(accept, asset))
        setItems((current) => (after === undefined ? filtered : [...current, ...filtered]))
        setHasMore(page.hasMore)
        setCursor(page.nextCursor ?? undefined)
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : t('media.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [token, singleKindFilter, submitted, folderFilter, accept, t],
  )

  // Reloads from the top whenever the target token, the kind filter, the
  // folder filter, or the committed search text changes.
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="entry-picker__browse">
      {folders.length > 0 && (
        <div className="entry-picker__folder-filter">
          <Label htmlFor={folderFilterId}>{t('fields.mediaFolderFilterLabel')}</Label>
          <Select
            id={folderFilterId}
            value={folderFilter}
            onChange={(event) => setFolderFilter(event.target.value)}
          >
            <option value="">{t('fields.mediaFolderFilterAll')}</option>
            <option value="unclassified">{t('media.unclassified')}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <form
        className="entry-picker__search"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(query)
        }}
      >
        <Label htmlFor={searchId}>{t('fields.mediaSearchLabel')}</Label>
        <div className="entry-picker__search-row">
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">
            {t('entryPicker.searchButton')}
          </Button>
        </div>
      </form>

      <Button type="button" variant="ghost" size="sm" onClick={() => setUploading((v) => !v)}>
        {t('fields.mediaUploadToggle')}
      </Button>
      {uploading && (
        <UploadForm
          token={token}
          onUploaded={(asset) => {
            if (accepts(accept, asset)) {
              setItems((current) => [asset, ...current])
              onPick(asset)
            }
          }}
        />
      )}

      {error !== null && (
        <p role="alert" className="entry-picker__notice">
          {error}
        </p>
      )}
      {loading && items.length === 0 && <p>{t('common.loading')}</p>}
      {!loading && items.length === 0 && (
        <p className="entry-picker__empty">{t('fields.mediaNoImages')}</p>
      )}

      {items.length > 0 && (
        <ul className="media-grid">
          {items.map((asset) => {
            const already = selected.includes(asset.id)
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onPick(asset)}
                  className={cn('media-grid__item', already && 'media-picker__result--picked')}
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
            )
          })}
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
          {t('entryPicker.loadMore')}
        </Button>
      )}
    </div>
  )
}
