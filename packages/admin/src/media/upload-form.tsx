import { type FormEvent, type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getMediaLimits, type MediaAsset, type MediaLimits } from '../api/media-client.js'
import { Button, Field, FileButton, Input, Label } from '../ui/index.js'
import { formatBytes, imageFormatName } from './format-bytes.js'
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
  const { t, i18n } = useTranslation()
  const fileId = useId()
  const decorativeId = useId()

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
    <div className="upload-form-wrapper flex flex-col gap-3">
      <form className="upload-form flex flex-col gap-3" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fileId}>{t('media.fileLabel')}</Label>
          {pickingFile ? (
            <>
              <FileButton
                id={fileId}
                multiple={initialFile === undefined}
                label={t('media.chooseFiles')}
                emptyLabel={t('media.noFilesChosen')}
                onChange={(event) => pickFiles(event.target.files)}
              />
              {limits !== null && (
                <p className="upload-form__limits m-0 text-xs leading-5 text-muted-foreground">
                  {/* This used to print `acceptedMimeTypes` as "Types
                      acceptés: …", a closed whitelist the server never
                      enforced: a `.txt`, a `.docx` or a CSV all uploaded
                      fine and none of them was on the list. The real rule
                      has two halves, and now the screen states both — in
                      the names a person knows (JPEG, PNG), not as MIME
                      types. */}
                  {t('media.uploadLimits', {
                    maxSize: formatBytes(limits.maxUploadBytes, t, i18n.language),
                  })}{' '}
                  {t('media.uploadImageTypes', {
                    types: (limits.imageMimeTypes ?? limits.acceptedMimeTypes)
                      .filter((type) => type.startsWith('image/'))
                      .map(imageFormatName)
                      .join(', '),
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="upload-form__filename m-0 flex flex-wrap items-center gap-2 text-sm">
              <strong className="font-medium [overflow-wrap:anywhere]">{current?.name}</strong>
              {batchTotal > 1 && (
                <span className="upload-form__progress text-muted-foreground">
                  {t('media.uploadProgress', { current: batchDescribed + 1, total: batchTotal })}
                </span>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setPickingFile(true)}>
                {t('media.changeFile')}
              </Button>
            </p>
          )}
        </div>

        {current !== null && (
          <>
            {!decorative && (
              <Field
                label={
                  <>
                    {t('media.altLabel')}
                    <span aria-hidden="true" className="field__required text-destructive">
                      {' '}
                      *
                    </span>
                  </>
                }
              >
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
              <Field
                label={
                  <>
                    {t('media.justificationLabel')}
                    <span aria-hidden="true" className="field__required text-destructive">
                      {' '}
                      *
                    </span>
                  </>
                }
              >
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

            <div>
              <Button type="submit">{t('media.uploadButton')}</Button>
            </div>
          </>
        )}
      </form>

      {uploads.items.length > 0 && (
        <ul
          className="upload-form__queue m-0 flex list-none flex-col gap-1 p-0 text-sm"
          aria-label={t('media.uploadQueueHeading')}
        >
          {uploads.items.map((item) => (
            <li
              key={item.id}
              className={`upload-form__queue-item upload-form__queue-item--${item.status} flex flex-wrap items-center gap-2`}
            >
              <span className="upload-form__queue-filename min-w-0 [overflow-wrap:anywhere]">
                {item.filename}
              </span>
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
                <span className="upload-form__queue-status text-muted-foreground">
                  {t('media.uploadPending')}
                </span>
              )}
              {item.status === 'done' && (
                <span className="upload-form__queue-status text-muted-foreground">
                  {t('media.uploadDone')}
                </span>
              )}
              {item.status === 'failed' && (
                <span
                  className="upload-form__queue-error flex flex-wrap items-center gap-2 text-destructive"
                  role="alert"
                >
                  {item.error ?? t('media.uploadError')}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => uploads.retry(item.id)}
                  >
                    {t('media.retryUpload')}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
