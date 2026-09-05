import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Real, pre-generated photography bundled with this package (L25, product
 * owner direct request: the procedural `demo-art` compositions read as
 * "typiquement le style cent pour cent IA" — abstract shapes standing in
 * for a dish, a product, a person — and a template needs concrete imagery
 * to look genuinely professional).
 *
 * Generated **once**, offline, with a user-supplied Replicate API key that
 * no longer exists by the time anyone reads this — the images themselves
 * are committed here as ordinary binary assets, exactly like
 * `docs/logo/*.png`. Nothing in this package, or in a site it scaffolds,
 * ever calls out to Replicate or needs a key: R1/R2/R9 are untouched,
 * because the *generation* was a one-time authoring step, not a runtime
 * dependency, the same distinction as a designer hand-picking stock photos
 * for a theme's demo content.
 *
 * `seedDemoMedia` prefers a photo asset over the matching `ArtSpec` when
 * one exists for a given `DemoMediaSpec.photo` key, and falls back to the
 * procedural composition otherwise — so a blueprint never *requires* a
 * photo to exist (a future trim of `assets/`, or a blueprint slot no photo
 * was ever generated for, still renders something, never a broken image).
 */
const ASSETS_ROOT = new URL('./assets/photos/', import.meta.url)

/** `relativePath` like `'restaurant/hero.jpg'`. `undefined` when no such file was bundled — never throws. */
export function loadPhotoAsset(relativePath: string): Uint8Array | undefined {
  const path = fileURLToPath(new URL(relativePath, ASSETS_ROOT))
  if (!existsSync(path)) return undefined
  return readFileSync(path)
}
