import { type JSX, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import { getMedia, listMedia, type MediaAsset } from '../api/media-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import '../styles/media.css'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * A single media asset by id — the same single-select scope `RelationField`
 * started with (task 7): the multi-valued case (`options.many`) is real, but
 * needs a repeater UI this pass does not build.
 */
export function MediaField({
  id,
  field,
  value,
  onChange,
  disabled = false,
}: FieldProps<string | null>): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [picking, setPicking] = useState(false)
  const [choices, setChoices] = useState<readonly MediaAsset[]>([])
  const [selected, setSelected] = useState<MediaAsset | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || value === null || value === '') {
      setSelected(null)
      return
    }
    let cancelled = false
    getMedia(token, value)
      .then((asset) => {
        if (!cancelled) setSelected(asset)
      })
      .catch(() => {
        if (!cancelled) setSelected(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, value])

  async function openPicker(): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      const page = await listMedia(token, { kind: 'image' })
      setChoices(page.items)
      setPicking(true)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Impossible de charger la médiathèque.',
      )
    }
  }

  if (token === null) {
    return (
      <FieldWrapper id={id} field={field}>
        <p>Chargement…</p>
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper id={id} field={field}>
      <div id={id} className="media-field">
        {value !== null && value !== '' && selected !== null && (
          <div className="media-field__selected">
            <MediaThumbnail
              token={token}
              id={selected.id}
              alt={selected.alt}
              previewable={selected.kind === 'image'}
            />
            <span>{selected.filename}</span>
          </div>
        )}

        {!disabled && (
          <div className="media-field__actions">
            <button type="button" onClick={() => void openPicker()}>
              Choisir…
            </button>
            {value !== null && value !== '' && (
              <button type="button" onClick={() => onChange(null)}>
                Retirer
              </button>
            )}
          </div>
        )}

        {error !== null && <p role="alert">{error}</p>}

        {picking && (
          <ul className="media-field__picker">
            {choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(choice.id)
                    setSelected(choice)
                    setPicking(false)
                  }}
                >
                  <MediaThumbnail token={token} id={choice.id} alt={choice.alt} previewable />
                  <span>{choice.filename}</span>
                </button>
              </li>
            ))}
            {choices.length === 0 && <li>Aucune image dans la médiathèque.</li>}
            <li>
              <button type="button" onClick={() => setPicking(false)}>
                Annuler
              </button>
            </li>
          </ul>
        )}
      </div>
    </FieldWrapper>
  )
}
