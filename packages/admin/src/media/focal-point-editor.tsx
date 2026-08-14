import { type JSX, type MouseEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type FocalPoint, fetchMediaBlobUrl, updateMedia } from '../api/media-client.js'

/**
 * Click anywhere on the image to set its focal point — the fraction of width
 * and height the click landed at, which is exactly what `FocalPoint` stores
 * (contract D). Framing, not a crop: the theme's own rendering decides the
 * final rectangle around this point.
 */
export function FocalPointEditor({
  token,
  id,
  alt,
  focal,
  disabled = false,
  onChange,
}: {
  readonly token: string
  readonly id: string
  readonly alt: string
  readonly focal: FocalPoint | null
  readonly disabled?: boolean
  onChange(focal: FocalPoint): void
}): JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    fetchMediaBlobUrl(token, id)
      .then((created) => {
        if (cancelled) {
          URL.revokeObjectURL(created)
          return
        }
        objectUrl = created
        setUrl(created)
      })
      .catch(() => {
        if (!cancelled) setError(t('media.focalLoadError'))
      })

    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [token, id, t])

  async function place(event: MouseEvent<HTMLImageElement>): Promise<void> {
    if (disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const next = { x, y }
    try {
      await updateMedia(token, id, { focal: next })
      onChange(next)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.focalUpdateError'))
    }
  }

  if (error !== null) return <p role="alert">{error}</p>
  if (url === null) return <p>{t('common.loading')}</p>

  return (
    <div className="focal-point-editor">
      <div className="focal-point-editor__frame">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only affordance; the numeric focal point below stays keyboard-editable via updateMedia through other controls. */}
        <img
          src={url}
          alt={alt}
          onClick={(event) => void place(event)}
          className="focal-point-editor__image"
        />
        {focal !== null && (
          <span
            className="focal-point-editor__marker"
            style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="field__help">{t('media.focalHint')}</p>
    </div>
  )
}
