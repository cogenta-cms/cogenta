import { type FormEvent, type JSX, useId, useState } from 'react'
import { ApiError } from '../api/client.js'
import { deleteMedia, type MediaAsset, updateMedia } from '../api/media-client.js'
import { FocalPointEditor } from './focal-point-editor.js'

export function MediaDetail({
  token,
  asset,
  onChange,
  onDeleted,
  onClose,
}: {
  readonly token: string
  readonly asset: MediaAsset
  onChange(asset: MediaAsset): void
  onDeleted(id: string): void
  onClose(): void
}): JSX.Element {
  const altId = useId()
  const decorativeId = useId()
  const justificationId = useId()

  const [alt, setAlt] = useState(asset.alt)
  const [decorative, setDecorative] = useState(asset.decorative)
  const [justification, setJustification] = useState(asset.decorativeJustification ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(
        caught instanceof ApiError ? caught.message : 'Impossible de mettre à jour ce média.',
      )
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
      setError(caught instanceof ApiError ? caught.message : 'Impossible de supprimer ce média.')
      setDeleting(false)
    }
  }

  return (
    <section aria-labelledby="media-detail-heading" className="media-detail">
      <h2 id="media-detail-heading">{asset.filename}</h2>
      <button type="button" onClick={onClose}>
        Fermer
      </button>

      {asset.kind === 'image' && (
        <FocalPointEditor
          token={token}
          id={asset.id}
          alt={asset.alt}
          focal={asset.focal}
          onChange={(focal) => onChange({ ...asset, focal })}
        />
      )}

      <form onSubmit={(event) => void save(event)}>
        {!decorative && (
          <div className="field">
            <label htmlFor={altId}>Texte alternatif</label>
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
          <label htmlFor={decorativeId}>Image décorative (aucune description nécessaire)</label>
        </div>

        {decorative && (
          <div className="field">
            <label htmlFor={justificationId}>Pourquoi cette image est décorative</label>
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
          Enregistrer
        </button>
      </form>

      <button type="button" disabled={deleting} onClick={() => void remove()}>
        {deleting ? 'Suppression…' : 'Supprimer'}
      </button>
    </section>
  )
}
