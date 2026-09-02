import { type FormEvent, type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getMediaLimits, type MediaAsset, type MediaLimits } from '../api/media-client.js'
import { type UploadQueue, useUploadQueue } from './upload-queue.js'

/**
 * One file *described* at a time, but real multipart uploads run in the
 * background with bounded concurrency (fiche 05 task 1, audit
 * `05-mediatheque.md` §6 T01 — this form used to claim multipart in a
 * comment while actually sending JSON+base64 through `fetch`, with no real
 * per-file progress and no way for one bad file to fail without blocking
 * the rest of the batch).
 *
 * The accessibility rule L2-admin.md wrote for a single upload — alt text is
 * required unless the image is marked decorative, and decorative needs a
 * reason a reviewer can read — does not relax for a batch: a screen reader
 * cares exactly as much about the third image in a folder as the first. So
 * describing a file is still one-at-a-time, sequential, and blocking (a
 * human filling in a form). What changed is that submitting a file's
 * description no longer waits for its bytes to finish crossing the network
 * before the next file can be described: `enqueue()` hands the transfer to
 * `useUploadQueue`'s pool and returns immediately, and up to three uploads
 * run at once with a real byte-level progress bar each, while a failed one
 * can be retried on its own without losing the others.
 */
export function UploadForm({
  token,
  onUploaded,
  initialFile,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: accepted for API stability with existing callers — see this property's own doc comment below for why it is not wired to anything.
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
   * The folder every file in this batch is meant to be filed into (fiche 46
   * task 8). Accepted here for API stability with existing callers, but
   * **not currently wired to anything**: `POST /api/media` (multipart or
   * legacy JSON, both paths) has never accepted a `folderId` at creation
   * time — a pre-existing gap this task did not introduce and is out of
   * scope to close here (audit `05-mediatheque.md` names filing at upload
   * time as a task 4/8 concern, not task 1's). A caller that needs a file
   * in a specific folder must still move it there after upload.
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
  const [batchDescribed, setBatchDescribed] = useState(0)
  const [pickingFile, setPickingFile] = useState(initialFile === undefined)
  const [alt, setAlt] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [justification, setJustification] = useState('')
  const [limits, setLimits] = useState<MediaLimits | null>(null)

  const uploads: UploadQueue = useUploadQueue(token, onUploaded)

  useEffect(() => {
    let cancelled = false
    getMediaLimits(token)
      .then((found) => {
        if (!cancelled) setLimits(found)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  const current = queue[0] ?? null

  function pickFiles(files: FileList | null): void {
    const picked = files === null ? [] : Array.from(files)
    setQueue(picked)
    setBatchTotal(picked.length)
    setBatchDescribed(0)
    setPickingFile(picked.length === 0)
    setAlt('')
    setDecorative(false)
    setJustification('')
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (current === null) return

    uploads.enqueue(current, {
      ...(decorative ? {} : { alt }),
      decorative,
      ...(decorative ? { decorativeJustification: justification } : {}),
    })

    const rest = queue.slice(1)
    setQueue(rest)
    setBatchDescribed((done) => done + 1)
    setAlt('')
    setDecorative(false)
    setJustification('')
    if (rest.length === 0) {
      setPickingFile(true)
      setBatchTotal(0)
      setBatchDescribed(0)
    }
  }

  return (
    <div className="upload-form-wrapper">
      <form className="upload-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={fileId}>{t('media.fileLabel')}</label>
          {pickingFile ? (
            <>
              <input
                id={fileId}
                type="file"
                multiple={initialFile === undefined}
                onChange={(event) => pickFiles(event.target.files)}
              />
              {limits !== null && (
                <p className="upload-form__limits">
                  {t('media.uploadLimits', {
                    maxSize: formatBytes(limits.maxUploadBytes),
                    types: limits.acceptedMimeTypes.join(', '),
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="upload-form__filename">
              {current?.name}
              {batchTotal > 1 && (
                <span className="upload-form__progress">
                  {' '}
                  {t('media.uploadProgress', { current: batchDescribed + 1, total: batchTotal })}
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

        <button type="submit" disabled={current === null}>
          {t('media.uploadButton')}
        </button>
      </form>

      {uploads.items.length > 0 && (
        <ul className="upload-form__queue" aria-label={t('media.uploadQueueHeading')}>
          {uploads.items.map((item) => (
            <li
              key={item.id}
              className={`upload-form__queue-item upload-form__queue-item--${item.status}`}
            >
              <span className="upload-form__queue-filename">{item.filename}</span>
              {item.status === 'uploading' && (
                <progress
                  className="upload-form__queue-progress"
                  value={Math.round(item.progress * 100)}
                  max={100}
                  aria-label={t('media.uploadInProgress', { filename: item.filename })}
                >
                  {Math.round(item.progress * 100)}%
                </progress>
              )}
              {item.status === 'pending' && (
                <span className="upload-form__queue-status">{t('media.uploadPending')}</span>
              )}
              {item.status === 'done' && (
                <span className="upload-form__queue-status">{t('media.uploadDone')}</span>
              )}
              {item.status === 'failed' && (
                <span className="upload-form__queue-error" role="alert">
                  {item.error ?? t('media.uploadError')}
                  <button type="button" onClick={() => uploads.retry(item.id)}>
                    {t('media.retryUpload')}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}
