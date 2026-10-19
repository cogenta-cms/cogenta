import type { MediaAsset as RenderMediaAsset } from '@cogenta/render'
import type { Site } from './serve.js'

/** `/sitemap.xml` and the `/sitemap-N.xml` chunks a large site splits into. */
/**
 * Loads the media a theme render references, as `@cogenta/render`'s
 * `MediaAsset`.
 *
 * The two shapes are deliberately different types (ADR-0016: the delivery
 * plane declares its own wire types rather than importing the engine's), so
 * this is the one place they are mapped. Only images and videos exist in that
 * shape at all — a PDF has no `srcset` — so anything else is left out and
 * `ctx.image()` refuses it clearly.
 */
export async function loadRenderMedia(
  site: Site,
  ids: readonly string[],
): Promise<ReadonlyMap<string, RenderMediaAsset>> {
  const found = new Map<string, RenderMediaAsset>()
  for (const id of new Set(ids)) {
    const asset = await site.mediaStore.get(id)
    if (asset === null) continue
    if (asset.kind !== 'image' && asset.kind !== 'video') continue
    found.set(id, {
      id: asset.id,
      kind: asset.kind,
      alt: asset.alt,
      ...(asset.width === null ? {} : { width: asset.width }),
      ...(asset.height === null ? {} : { height: asset.height }),
      focal: asset.focal,
      // Fiche 05 task 2: the field `ImageSource`/`variantUrl` have carried
      // since `theme@1.2` (`packages/render/src/images/types.ts`'s own
      // `version` doc comment) but nobody ever set — a replaced original
      // kept serving under the exact same `/_image?id=…` query string a
      // year-long `immutable` cache had already stored. `contentHash`
      // changes on every `MediaStore.replace()`, so folding it in here is
      // what actually breaks that cache.
      version: asset.contentHash,
    })
  }
  return found
}
