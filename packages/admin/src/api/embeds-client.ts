import { API_BASE, authHeader, request } from './http.js'

/**
 * `POST /api/embeds/resolve` (L38): what an embed address says about itself.
 * The shape mirrors `@cogenta/api`'s `EmbedPreviewView` by hand, like every
 * other client module here.
 */

export interface EmbedPreview {
  readonly url: string
  readonly provider: string
  readonly status: 'ok' | 'failed' | 'unsupported'
  readonly title: string | null
  readonly authorName: string | null
  readonly ratio: string | null
  readonly thumbnailPath: string | null
  readonly thumbnailWidth: number | null
  readonly thumbnailHeight: number | null
}

export function resolveEmbed(token: string, url: string): Promise<EmbedPreview> {
  return request('/api/embeds/resolve', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ url }),
  })
}

/** The thumbnail's address as the admin loads it — the site serves it, never the provider. */
export function embedThumbnailSrc(path: string): string {
  return `${API_BASE}${path}`
}
