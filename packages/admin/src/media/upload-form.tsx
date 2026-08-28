import { type FormEvent, type JSX, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { fileToBase64, type MediaAsset, mediaKindFor, uploadMedia } from '../api/media-client.js'

/**
 * One file described and uploaded at a time, but a *batch* can be selected
 * at once (fiche 46 task 7 — "upload multipart multiple avec progression").
 *
 * The accessibility rule L2-admin.md wrote for a single upload — alt text is
 * required unless the image is marked decorative, and decorative needs a
 * reason a reviewer can read — does not relax for a batch: a screen reader
 * cares exactly as much about the third image in a folder as the first.
 * Rather than inventing an alt text nobody wrote, or letting a batch skip
 * the requirement, each file in the queue gets the same real form the
 * single-file flow always did; picking several files just keeps the form
 * open and advances it automatically once an upload succeeds, showing "file
 * N of M" as it goes — that progress counter is the whole of what "upload
 * multiple" adds here, deliberately: nothing about *how* one file is
 * described changes.
 */
export function UploadForm({
  token,
  onUploaded,
  initialFile,
  defaultFolderId,
}: {
  readonly token: string
  onUploaded(asset: MediaAsset): void
  /**
   * Pre-fills the file input — the rich text editor's drag-and-drop path
   * (fiche 04 task 3) hands over the dropped file this way, so the upload
   * starts already knowing what to upload and the form only has to ask for
   * the alt text, never a second, separate file choice. A pre-filled queue
   * is always exactly this one file — the batch picker is only offered when
   * nothing was handed over already.
   */
  readonly initialFile?: File
  /**
   * The folder every file in this batch is filed into (fiche 46 task 8) —
   * typically "whichever folder the library is currently showing". `null`
   * files into nothing (unclassified); absent behaves the same as `null`.
   */
  readonly defaultFolderId?: string | null
}): JSX.Element {
  const { t } = useTranslation()
  const fileId = useId()
  const altId = useId()
  const decorativeId = useId()
  const justificationId = useId()

  const [queue, setQueue] = useState<readonly File[]>(
    initialFile === undefined ? [] : [initialFile],
  )
  const [batchTotal, setBatchTotal] = useState(initialFile === undefined ? 0 : 1)
  const [batchDone, setBatchDone] = useState(0)
  const [pickingFile, setPickingFile] = useState(initialFile === undefined)
  const [alt, setAlt] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [justification, setJustification] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = queue[0] ?? null

  function pickFiles(files: FileList | null): void {
    const picked = files === null ? [] : Array.from(files)
    setQueue(picked)
    setBatchTotal(picked.length)
    setBatchDone(0)
    setPickingFile(picked.length === 0)
    setAlt('')
    setDecorative(false)
    setJustification('')
    setError(null)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (current === null) return
    setUploading(true)
    setError(null)
    try {
      const data = await fileToBase64(current)
      const asset = await uploadMedia(token, {
        kind: mediaKindFor(current.type),
        filename: current.name,
        mimeType: current.type,
        data,
        ...(decorative ? {} : { alt }),
        decorative,
        ...(decorative ? { decorativeJustification: justification } : {}),
        ...(defaultFolderId === undefined ? {} : { folderId: defaultFolderId }),
      })
      onUploaded(asset)
      const rest = queue.slice(1)
      setQueue(rest)
      setBatchDone((done) => done + 1)
      setAlt('')
      setDecorative(false)
      setJustification('')
      if (rest.length === 0) {
        setPickingFile(true)
        setBatchTotal(0)
        setBatchDone(0)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.uploadError'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="upload-form" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor={fileId}>{t('media.fileLabel')}</label>
        {pickingFile ? (
          <input
            id={fileId}
            type="file"
            multiple={initialFile === undefined}
            onChange={(event) => pickFiles(event.target.files)}
          />
        ) : (
          <p className="upload-form__filename">
            {current?.name}
            {batchTotal > 1 && (
              <span className="upload-form__progress">
                {' '}
                {t('media.uploadProgress', { current: batchDone + 1, total: batchTotal })}
              </span>
            )}{' '}
            <button type="button" onClick={() => setPickingFile(true)}>
              {t('media.changeFile')}
            </button>
          </p>
        )}
      </div>

      {!decorative && (
        <div className="field">
          <label htmlFor={altId}>
            {t('media.altLabel')}
            <span aria-hidden="true" className="field__required">
              {' '}
              *
            </span>
          </label>
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
          <label htmlFor={justificationId}>
            {t('media.justificationLabel')}
            <span aria-hidden="true" className="field__required">
              {' '}
              *
            </span>
          </label>
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

      <button type="submit" disabled={uploading || current === null}>
        {uploading ? t('media.uploading') : t('media.uploadButton')}
      </button>
    </form>
  )
}
