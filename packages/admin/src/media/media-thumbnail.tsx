import { type JSX, useEffect, useState } from 'react'
import { fetchMediaBlobUrl } from '../api/media-client.js'

/**
 * Fetches the file behind a bearer token and renders it as an `<img>`, or a
 * plain filename for a kind nothing here can preview (video/audio/file).
 * The object URL it creates is revoked on unmount or when `id` changes, so a
 * long media grid session does not leak one blob per thumbnail forever.
 */
export function MediaThumbnail({
  token,
  id,
  alt,
  previewable,
}: {
  readonly token: string
  readonly id: string
  readonly alt: string
  readonly previewable: boolean
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!previewable) return
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
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [token, id, previewable])

  if (!previewable || failed) {
    return <span className="media-thumbnail media-thumbnail--placeholder" aria-hidden="true" />
  }
  if (url === null) {
    return <span className="media-thumbnail media-thumbnail--loading" aria-hidden="true" />
  }
  return <img className="media-thumbnail" src={url} alt={alt} />
}
