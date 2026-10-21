import { type ChangeEvent, type FormEvent, type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { describeApiError } from '../api/describe-error.js'
import {
  deleteMedia,
  type ExifData,
  getMedia,
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
import { fieldLabel } from '../schema/field-label.js'
import { Button, CopyButton, Field, FileButton, Input, Label, Notice, Select } from '../ui/index.js'
import { FocalPointEditor } from './focal-point-editor.js'
import { formatBytes } from './format-bytes.js'
import { ImageEditor } from './image-editor.js'

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
/**
 * Where in the entry, said the way the entry's own form says it.
 *
 * `at` is either a field name (`coverImage`) or a path into the blocks
 * (`blocks.blocks[2].mediaFigure`). Only the first can be named, so only the
 * first is: a path is shown as it stands rather than guessed at.
 */
function placeOf(at: string, t: Parameters<typeof fieldLabel>[1]): string {
  return /[.[\]]/u.test(at) ? at : fieldLabel(at, t)
}

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
  const [editingImage, setEditingImage] = useState(false)
  const [replaceError, setReplaceError] = useState<string | null>(null)

  /**
   * The asset as the single-asset read describes it, which is the only read
   * that carries `edited` — the list route would need one storage stat per
   * row to say whether a crop can be undone. This panel took its asset
   * straight from the grid's list, so `edited` was always `undefined` and
   * "Restore the original" never appeared on any asset, though the route
   * behind it worked the whole time. The prop is used until this arrives, so
   * nothing waits on a request to draw.
   */
  const [detail, setDetail] = useState<MediaAsset>(asset)

  const [usage, setUsage] = useState<MediaUsageReport | null>(null)
  const [usageError, setUsageError] = useState(false)
  /**
   * Deleting one asset asks the same question deleting thirty already did.
   *
   * `POST /api/media/-/bulk-delete` has had a confirmation naming what the
   * selection would orphan since fiche 05; this button deleted on a single
   * click, with no question at all — and the pages that lost their picture
   * were the ones this very screen was already listing under "Usage".
   * Deliberately the two-click, in-place confirmation the plugin screens use
   * rather than a modal: the warning has to be read next to that list.
   */
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [exif, setExif] = useState<ExifData | null>(null)

  useEffect(() => {
    setAlt(asset.alt)
    setDecorative(asset.decorative)
    setJustification(asset.decorativeJustification ?? '')
  }, [asset.id, asset.alt, asset.decorative, asset.decorativeJustification])

  useEffect(() => {
    setDetail(asset)
    let cancelled = false
    getMedia(token, asset.id)
      .then((full) => {
        if (!cancelled) setDetail(full)
      })
      // A failed read leaves the prop in place: the panel still works, it
      // just cannot offer what only the fresh read knows about.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, asset])

  useEffect(() => {
    let cancelled = false
    setUsage(null)
    setUsageError(false)
    // Selecting another asset must never arrive with the previous one's
    // confirmation already armed: the next click would delete a file the
    // person never asked about.
    setConfirmingDelete(false)
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
      setError(describeApiError(caught, t('media.updateError')).message)
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
      setError(describeApiError(caught, t('media.deleteError')).message)
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
      setError(describeApiError(caught, t('media.updateError')).message)
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
      setError(describeApiError(caught, t('media.updateError')).message)
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
      setFolderError(describeApiError(caught, t('media.moveError')).message)
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
      setReplaceError(describeApiError(caught, t('media.replaceError')).message)
    } finally {
      setReplacing(false)
    }
  }

  const publicUrl =
    asset.kind === 'image' ? `${window.location.origin}/_image?id=${asset.id}` : null

  return (
    <div className="media-detail flex flex-col gap-5">
      {asset.kind === 'image' && editingImage ? (
        <ImageEditor
          token={token}
          asset={detail}
          onDone={(updated) => {
            setEditingImage(false)
            onChange(updated)
          }}
          onCancel={() => setEditingImage(false)}
        />
      ) : (
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {asset.kind === 'image' && (
              <>
                <FocalPointEditor
                  token={token}
                  id={asset.id}
                  alt={asset.alt}
                  focal={asset.focal}
                  version={asset.contentHash}
                  onChange={(focal) => onChange({ ...asset, focal })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingImage(true)}
                  >
                    {t('imageEditor.open')}
                  </Button>
                  {asset.edited === true && (
                    <span className="text-sm text-muted-foreground">
                      {t('imageEditor.editedBadge')}
                    </span>
                  )}
                </div>
              </>
            )}

            <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              {asset.width !== null && asset.height !== null && (
                <>
                  <dt className="text-muted-foreground">{t('media.dimensionsLabel')}</dt>
                  <dd className="m-0">
                    {asset.width} × {asset.height}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('media.sizeLabel')}</dt>
              <dd className="m-0">{formatBytes(asset.size, t, i18n.language)}</dd>
              <dt className="text-muted-foreground">{t('media.typeLabel')}</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{asset.mimeType}</dd>
              <dt className="text-muted-foreground">{t('media.createdLabel')}</dt>
              <dd className="m-0">{formatDateTime(asset.createdAt, { locale: i18n.language })}</dd>
              {exif !== null && (exif.make !== null || exif.model !== null) && (
                <>
                  <dt className="text-muted-foreground">{t('media.exifCameraLabel')}</dt>
                  <dd className="m-0">{[exif.make, exif.model].filter(Boolean).join(' ')}</dd>
                </>
              )}
              {exif?.takenAt != null && (
                <>
                  <dt className="text-muted-foreground">{t('media.exifTakenAtLabel')}</dt>
                  <dd className="m-0">{formatDateTime(exif.takenAt, { locale: i18n.language })}</dd>
                </>
              )}
            </dl>

            {publicUrl !== null && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${altId}-url`}>{t('media.publicUrlLabel')}</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Input id={`${altId}-url`} type="text" readOnly value={publicUrl} />
                  <CopyButton
                    value={publicUrl}
                    label={t('media.copyUrl')}
                    copiedLabel={t('media.copied')}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <form className="flex flex-col gap-3" onSubmit={(event) => void save(event)}>
              {!decorative && (
                <Field label={t('media.altLabel')}>
                  {(control) => (
                    <Input
                      {...control}
                      type="text"
                      required={!decorative}
                      value={alt}
                      onChange={(event) => setAlt(event.target.value)}
                    />
                  )}
                </Field>
              )}

              <label
                htmlFor={decorativeId}
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <input
                  id={decorativeId}
                  type="checkbox"
                  checked={decorative}
                  onChange={(event) => setDecorative(event.target.checked)}
                />
                {t('media.decorativeLabel')}
              </label>

              {decorative && (
                <Field label={t('media.justificationLabel')}>
                  {(control) => (
                    <Input
                      {...control}
                      type="text"
                      required={decorative}
                      value={justification}
                      onChange={(event) => setJustification(event.target.value)}
                    />
                  )}
                </Field>
              )}

              {error !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{error}</p>
                </Notice>
              )}

              <div>
                <Button type="submit" disabled={saving}>
                  {t('media.saveButton')}
                </Button>
              </div>
            </form>

            <div className="flex flex-col gap-1.5 border-t border-border pt-4">
              <Label htmlFor={folderSelectId}>{t('media.folderLabel')}</Label>
              <Select
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
              </Select>
              {folderError !== null && (
                <p role="alert" className="m-0 text-xs font-medium text-destructive">
                  {folderError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span id={`${tagInputId}-label`} className="text-sm font-medium text-foreground">
                {t('media.tagsLabel')}
              </span>
              <ul
                aria-labelledby={`${tagInputId}-label`}
                className="m-0 flex list-none flex-wrap gap-1.5 p-0"
              >
                {asset.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      disabled={tagBusy}
                      onClick={() => void removeTag(tag)}
                      aria-label={t('media.removeTag', { tag })}
                      className="cursor-pointer rounded-full border border-border bg-muted px-2.5 py-0.5 font-sans text-xs text-foreground hover:bg-accent"
                    >
                      {tag} ×
                    </button>
                  </li>
                ))}
                {asset.tags.length === 0 && (
                  <li className="text-sm text-muted-foreground">{t('media.noTags')}</li>
                )}
              </ul>
              <form className="flex items-center gap-2" onSubmit={(event) => void addTag(event)}>
                <label className="sr-only" htmlFor={tagInputId}>
                  {t('media.newTagLabel')}
                </label>
                <Input
                  id={tagInputId}
                  type="text"
                  value={tagDraft}
                  disabled={tagBusy}
                  onChange={(event) => setTagDraft(event.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={tagBusy || tagDraft.trim().length === 0}
                >
                  {t('media.addTag')}
                </Button>
              </form>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t('media.usageLabel')}</span>
              {usageError && <p className="m-0 text-sm">{t('media.usageError')}</p>}
              {usage !== null && usage.matches.length === 0 && (
                <p className="m-0 text-sm text-muted-foreground">{t('media.usageNone')}</p>
              )}
              {usage !== null && usage.matches.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {usage.matches.map((match) => (
                    <li key={`${match.collection}-${match.entryId}-${match.at}`}>
                      {/* The entry, reachable. This list is read by someone about to
                          delete a medium, deciding whether to; "post · Reading on
                          the 7:52 · coverImage" told them where it is used and left
                          them to find it by hand. */}
                      <Link
                        className="text-primary hover:underline"
                        to={`/collections/${encodeURIComponent(match.collection)}/${encodeURIComponent(match.entryId)}`}
                      >
                        {match.title}
                      </Link>{' '}
                      <span className="text-muted-foreground">
                        {t('media.usageItemAt', { at: placeOf(match.at, t) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {usage?.truncated === true && (
                <p className="m-0 text-sm">{t('media.usageTruncated')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={replaceFileId}>{t('media.replaceFileLabel')}</Label>
              <FileButton
                id={replaceFileId}
                size="sm"
                disabled={replacing}
                label={t('common.chooseFile')}
                emptyLabel={t('common.noFileChosen')}
                onChange={(event) => void replaceFile(event)}
              />
              {replacing && <p className="m-0 text-sm">{t('media.replacing')}</p>}
              {replaceError !== null && (
                <p role="alert" className="m-0 text-xs font-medium text-destructive">
                  {replaceError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {confirmingDelete && (
                <p role="alert" className="m-0 text-sm">
                  {usage !== null && usage.matches.length > 0
                    ? t('media.deleteUsageWarning', { count: usage.matches.length })
                    : t('media.deleteConfirmBody')}
                </p>
              )}
              <div>
                <Button
                  type="button"
                  variant={confirmingDelete ? 'destructive' : 'secondary'}
                  disabled={deleting}
                  onClick={() => {
                    if (!confirmingDelete) {
                      setConfirmingDelete(true)
                      return
                    }
                    void remove()
                  }}
                >
                  {deleting
                    ? t('media.deleting')
                    : confirmingDelete
                      ? t('media.deleteConfirmAction')
                      : t('media.deleteButton')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
