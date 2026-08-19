import type { CollectionSummary } from '../schema/types.js'

/**
 * What the internal-link tab and the image picker need beyond the editor
 * itself (fiche 04 tasks 2-3): a bearer token to call `/api/content` and
 * `/api/media` with, the actor's roles to filter collections by
 * `readableCollections`, and the collection list to offer.
 *
 * Optional wherever it is threaded through: a `RichTextEditor` used outside
 * a signed-in admin session (a bare unit test, a future non-admin embed)
 * still formats text — it just cannot offer an internal link or an inline
 * image, which need real API access R2 does not promise here the way it
 * does for the CMS itself.
 */
export interface RichTextSession {
  readonly token: string
  readonly roles: readonly string[]
  readonly collections: readonly CollectionSummary[]
}
