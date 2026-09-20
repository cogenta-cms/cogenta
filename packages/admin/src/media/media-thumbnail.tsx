import { type JSX, useEffect, useState } from 'react'
import { fetchMediaBlobUrl } from '../api/media-client.js'

/** The smallest width the upload pipeline stores (`SRCSET_WIDTHS`), and more than a grid tile needs. */
const THUMBNAIL_WIDTH = 320

/**
 * Fetches the file behind a bearer token and renders it as an `<img>`, or a
 * plain filename for a kind nothing here can preview (video/audio/file).
 * The object URL it creates is revoked on unmount or when `id` changes, so a
 * long media grid session does not leak one blob per thumbnail forever.
 *
 * It asks for the smallest stored rendition rather than the upload itself:
 * a grid of twenty-five tiles used to pull 5.6 MB of full-resolution
 * originals with the 320px copies sitting unused in storage beside them.
 */
export function MediaThumbnail({
  token,
  id,
  alt,
  previewable,
  version,
  width = THUMBNAIL_WIDTH,
}: {
  readonly token: string
  readonly id: string
  readonly alt: string
  readonly previewable: boolean
  /** The asset's `contentHash`, so an edited or replaced file is not served from the browser's cache. */
  readonly version?: string
  /**
   * Which stored rendition to ask for. Defaults to the smallest of the
   * ladder, which is all a grid tile ever shows — this used to fetch the
   * full-resolution upload for every tile.
   */
  readonly width?: number
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!previewable) return
    let cancelled = false
    let objectUrl: string | null = null

    fetchMediaBlobUrl(token, id, {
      ...(version === undefined ? {} : { version }),
      width,
    })
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
  }, [token, id, previewable, version, width])

  if (!previewable || failed) {
    return <span className="media-thumbnail media-thumbnail--placeholder" aria-hidden="true" />
  }
  if (url === null) {
    return <span className="media-thumbnail media-thumbnail--loading" aria-hidden="true" />
  }
  return <img className="media-thumbnail" src={url} alt={alt} />
}
