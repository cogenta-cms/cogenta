import type { BlockZones } from './content-client.js'
import { authHeader, request } from './http.js'

/**
 * The page builder's one call (L16 task 1).
 *
 * It sends the block list the editor has on screen — unsaved — and gets back
 * the HTML `cogenta serve` would really render for that page. Nothing here
 * re-implements a block: the admin never learns what a `hero` looks like, so
 * it cannot be wrong about one.
 */
export function renderDraft(
  token: string,
  collection: string,
  entryId: string,
  blocks: BlockZones,
  values?: Readonly<Record<string, unknown>>,
): Promise<{ readonly html: string }> {
  return request('/api/builder/render', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      collection,
      entryId,
      blocks,
      ...(values === undefined ? {} : { values }),
    }),
  })
}
