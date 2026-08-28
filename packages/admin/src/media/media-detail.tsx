import { type ChangeEvent, type FormEvent, type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  deleteMedia,
  type ExifData,
  getMediaExif,
  getMediaUsage,
  type MediaAsset,
  type MediaFolder,
  type MediaUsageReport,
  moveMedia,
  replaceMedia,
  updateMedia,
} from '../api/media-client.js'
import { formatDateTime } from '../lib/format.js'
import { FocalPointEditor } from './focal-point-editor.js'

/** `1.2 KB`, `3.4 MB` — binary units, one decimal past the first, matching what a file manager shows. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}

/**
 * The chrome around this panel — a heading naming the asset and a way to
 * close it — is now the caller's `Modal` (`routes/media.tsx`): this stays
 * the content of that dialog, not a dialog of its own.
 *
 * Fiche 46 task 7 enriches what was alt/decorative/focal/delete only:
 * dimensions, size, type, date, tags, usage, a copyable public URL,
 * replacing the file in place, and moving it between folders — every one of
 * these already existed server-side (fiche 11); this is the wiring.
 */
export function MediaDetail({
  token,
  asset,
  folders,
  onChange,
  onDeleted,
}: {
  readonly token: string
  readonly asset: MediaAsset
  /** The whole folder tree, already fetched by the caller — see `media-folder-tree.tsx`'s own comment on why one fetch serves both. */
  readonly folders: readonly MediaFolder[]
  onChange(asset: MediaAsset): void
  onDeleted(id: string): void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const altId = useId()
  const decorativeId = useId()
  const justificationId = useId()
  const tagInputId = useId()
  const folderSelectId = useId()
  const replaceFileId = useId()

  const [alt, setAlt] = useState(asset.alt)
  const [decorative, setDecorative] = useState(asset.decorative)
  const [justification, setJustification] = useState(asset.decorativeJustification ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tagDraft, setTagDraft] = useState('')
  const [tagBusy, setTagBusy] = useState(false)

  const [movingFolder, setMovingFolder] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)

  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)

  const [usage, setUsage] = useState<MediaUsageReport | null>(null)
  const [usageError, setUsageError] = useState(false)
  const [exif, setExif] = useState<ExifData | null>(null)

  useEffect(() => {
    setAlt(asset.alt)
    setDecorative(asset.decorative)
    setJustification(asset.decorativeJustification ?? '')
  }, [asset.id, asset.alt, asset.decorative, asset.decorativeJustification])

  useEffect(() => {
    let cancelled = false
    setUsage(null)
    setUsageError(false)
    getMediaUsage(token, asset.id)
      .then((report) => {
        if (!cancelled) setUsage(report)
      })
      .catch(() => {
        if (!cancelled) setUsageError(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, asset.id])

  useEffect(() => {
    if (asset.kind !== 'image') {
      setExif(null)
      return
    }
    let cancelled = false
    getMediaExif(token, asset.id)
      .then((data) => {
        if (!cancelled) setExif(data)
      })
      .catch(() => {
        if (!cancelled) setExif(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, asset.id, asset.kind])

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await updateMedia(token, asset.id, {
        ...(decorative ? {} : { alt }),
        decorative,
        ...(decorative ? { decorativeJustification: justification } : {}),
      })
      onChange(updated)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.updateError'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(): Promise<void> {
    setDeleting(true)
    setError(null)
    try {
      await deleteMedia(token, asset.id)
      onDeleted(asset.id)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.deleteError'))
      setDeleting(false)
    }
  }

  async function addTag(event: FormEvent): Promise<void> {
    event.preventDefault()
    const tag = tagDraft.trim()
    if (tag.length === 0 || asset.tags.includes(tag)) {
      setTagDraft('')
      return
    }
    setTagBusy(true)
    try {
      const updated = await updateMedia(token, asset.id, { tags: [...asset.tags, tag] })
      onChange(updated)
      setTagDraft('')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.updateError'))
    } finally {
      setTagBusy(false)
    }
  }

  async function removeTag(tag: string): Promise<void> {
    setTagBusy(true)
    try {
      const updated = await updateMedia(token, asset.id, {
        tags: asset.tags.filter((existing) => existing !== tag),
      })
      onChange(updated)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.updateError'))
    } finally {
      setTagBusy(false)
    }
  }

  async function moveToFolder(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const value = event.target.value === '' ? null : event.target.value
    setMovingFolder(true)
    setFolderError(null)
    try {
      const updated = await moveMedia(token, asset.id, value)
      onChange(updated)
    } catch (caught) {
      setFolderError(caught instanceof ApiError ? caught.message : t('media.moveError'))
    } finally {
      setMovingFolder(false)
    }
  }

  async function replaceFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setReplacing(true)
    setReplaceError(null)
    try {
      const updated = await replaceMedia(token, asset.id, file)
      onChange(updated)
    } catch (caught) {
      setReplaceError(caught instanceof ApiError ? caught.message : t('media.replaceError'))
    } finally {
      setReplacing(false)
    }
  }

  async function copyUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused by the browser/environment — the URL
      // is still shown as selectable text, so nothing is actually lost.
    }
  }

  const publicUrl =
    asset.kind === 'image' ? `${window.location.origin}/_image?id=${asset.id}` : null

  return (
    <div className="media-detail flex flex-col gap-4">
      {asset.kind === 'image' && (
        <FocalPointEditor
          token={token}
          id={asset.id}
          alt={asset.alt}
          focal={asset.focal}
          onChange={(focal) => onChange({ ...asset, focal })}
        />
      )}

      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {asset.width !== null && asset.height !== null && (
          <>
            <dt className="text-muted-foreground">{t('media.dimensionsLabel')}</dt>
            <dd className="m-0">
              {asset.width} × {asset.height}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('media.sizeLabel')}</dt>
        <dd className="m-0">{formatBytes(asset.size)}</dd>
        <dt className="text-muted-foreground">{t('media.typeLabel')}</dt>
        <dd className="m-0">{asset.mimeType}</dd>
        <dt className="text-muted-foreground">{t('media.createdLabel')}</dt>
        <dd className="m-0">{formatDateTime(asset.createdAt, { locale: i18n.language })}</dd>
      </dl>

      {exif !== null && (exif.make !== null || exif.model !== null || exif.takenAt !== null) && (
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {(exif.make !== null || exif.model !== null) && (
            <>
              <dt className="text-muted-foreground">{t('media.exifCameraLabel')}</dt>
              <dd className="m-0">{[exif.make, exif.model].filter(Boolean).join(' ')}</dd>
            </>
          )}
          {exif.takenAt !== null && (
            <>
              <dt className="text-muted-foreground">{t('media.exifTakenAtLabel')}</dt>
              <dd className="m-0">{formatDateTime(exif.takenAt, { locale: i18n.language })}</dd>
            </>
          )}
        </dl>
      )}

      {publicUrl !== null && (
        <div className="field">
          <label htmlFor={`${altId}-url`}>{t('media.publicUrlLabel')}</label>
          <div className="flex gap-2">
            <input id={`${altId}-url`} type="text" readOnly value={publicUrl} />
            <button type="button" onClick={() => void copyUrl(publicUrl)}>
              {copied ? t('media.copied') : t('media.copyUrl')}
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor={folderSelectId}>{t('media.folderLabel')}</label>
        <select
          id={folderSelectId}
          value={asset.folderId ?? ''}
          disabled={movingFolder}
          onChange={(event) => void moveToFolder(event)}
        >
          <option value="">{t('media.unclassified')}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {'—'.repeat(folder.path.split('/').filter(Boolean).length - 1)} {folder.name}
            </option>
          ))}
        </select>
        {folderError !== null && (
          <p role="alert" className="entry-form__error">
            {folderError}
          </p>
        )}
      </div>

      <div className="field">
        <span id={`${tagInputId}-label`}>{t('media.tagsLabel')}</span>
        <ul aria-labelledby={`${tagInputId}-label`} className="m-0 flex flex-wrap gap-1.5 p-0">
          {asset.tags.map((tag) => (
            <li key={tag} className="list-none">
              <button
                type="button"
                disabled={tagBusy}
                onClick={() => void removeTag(tag)}
                aria-label={t('media.removeTag', { tag })}
              >
                {tag} ×
              </button>
            </li>
          ))}
          {asset.tags.length === 0 && (
            <li className="list-none text-sm text-muted-foreground">{t('media.noTags')}</li>
          )}
        </ul>
        <form className="flex gap-2" onSubmit={(event) => void addTag(event)}>
          <label className="sr-only" htmlFor={tagInputId}>
            {t('media.newTagLabel')}
          </label>
          <input
            id={tagInputId}
            type="text"
            value={tagDraft}
            disabled={tagBusy}
            onChange={(event) => setTagDraft(event.target.value)}
          />
          <button type="submit" disabled={tagBusy || tagDraft.trim().length === 0}>
            {t('media.addTag')}
          </button>
        </form>
      </div>

      <div className="field">
        <span>{t('media.usageLabel')}</span>
        {usageError && <p>{t('media.usageError')}</p>}
        {usage !== null && usage.matches.length === 0 && <p>{t('media.usageNone')}</p>}
        {usage !== null && usage.matches.length > 0 && (
          <ul className="m-0 flex flex-col gap-1 p-0 text-sm">
            {usage.matches.map((match) => (
              <li key={`${match.collection}-${match.entryId}-${match.field}`} className="list-none">
                {t('media.usageItem', {
                  collection: match.collection,
                  entryId: match.entryId,
                  field: match.field,
                })}
              </li>
            ))}
          </ul>
        )}
        {usage?.truncated === true && <p>{t('media.usageTruncated')}</p>}
      </div>

      <div className="field">
        <label htmlFor={replaceFileId}>{t('media.replaceFileLabel')}</label>
        <input
          id={replaceFileId}
          type="file"
          disabled={replacing}
          onChange={(event) => void replaceFile(event)}
        />
        {replacing && <p>{t('media.replacing')}</p>}
        {replaceError !== null && (
          <p role="alert" className="entry-form__error">
            {replaceError}
          </p>
        )}
      </div>

      <form onSubmit={(event) => void save(event)}>
        {!decorative && (
          <div className="field">
            <label htmlFor={altId}>{t('media.altLabel')}</label>
            <input
              id={altId}
              type="text"
              required={!decorative}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
            />
          </div>
        )}

        <div className="field field--checkbox">
          <input
            id={decorativeId}
            type="checkbox"
            checked={decorative}
            onChange={(event) => setDecorative(event.target.checked)}
          />
          <label htmlFor={decorativeId}>{t('media.decorativeLabel')}</label>
        </div>

        {decorative && (
          <div className="field">
            <label htmlFor={justificationId}>{t('media.justificationLabel')}</label>
            <input
              id={justificationId}
              type="text"
              required={decorative}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
            />
          </div>
        )}

        {error !== null && (
          <p role="alert" className="entry-form__error">
            {error}
          </p>
        )}

        <button type="submit" disabled={saving}>
          {t('media.saveButton')}
        </button>
      </form>

      <button type="button" disabled={deleting} onClick={() => void remove()}>
        {deleting ? t('media.deleting') : t('media.deleteButton')}
      </button>
    </div>
  )
}
