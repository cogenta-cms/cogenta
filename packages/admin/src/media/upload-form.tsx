import { type FormEvent, type JSX, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { fileToBase64, type MediaAsset, mediaKindFor, uploadMedia } from '../api/media-client.js'

/**
 * One upload at a time, with the two fields L2-admin.md calls out
 * explicitly: alt text is required unless the image is marked decorative,
 * and decorative needs a reason a reviewer can read instead of a
 * description — the server enforces the same rule (`MediaStore`), this is
 * just the honest form around it.
 */
export function UploadForm({
  token,
  onUploaded,
  initialFile,
}: {
  readonly token: string
  onUploaded(asset: MediaAsset): void
  /**
   * Pre-fills the file input — the rich text editor's drag-and-drop path
   * (fiche 04 task 3) hands over the dropped file this way, so the upload
   * starts already knowing what to upload and the form only has to ask for
   * the alt text, never a second, separate file choice.
   */
  readonly initialFile?: File
}): JSX.Element {
  const { t } = useTranslation()
  const fileId = useId()
  const altId = useId()
  const decorativeId = useId()
  const justificationId = useId()

  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [pickingFile, setPickingFile] = useState(initialFile === undefined)
  const [alt, setAlt] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [justification, setJustification] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (file === null) return
    setUploading(true)
    setError(null)
    try {
      const data = await fileToBase64(file)
      const asset = await uploadMedia(token, {
        kind: mediaKindFor(file.type),
        filename: file.name,
        mimeType: file.type,
        data,
        ...(decorative ? {} : { alt }),
        decorative,
        ...(decorative ? { decorativeJustification: justification } : {}),
      })
      onUploaded(asset)
      setFile(null)
      setPickingFile(true)
      setAlt('')
      setDecorative(false)
      setJustification('')
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
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        ) : (
          <p className="upload-form__filename">
            {file?.name}{' '}
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

      <button type="submit" disabled={uploading || file === null}>
        {uploading ? t('media.uploading') : t('media.uploadButton')}
      </button>
    </form>
  )
}
