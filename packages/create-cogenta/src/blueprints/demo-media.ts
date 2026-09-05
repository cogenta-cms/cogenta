import { ingestMediaUpload, type MediaImageProcessor } from '@cogenta/api'
import { createDatabaseMediaStore, type DatabaseHandle, type StorageDriver } from '@cogenta/core'
import type { ArtSpec } from '../demo-art/render.js'
import { renderArt } from '../demo-art/render.js'
import { loadPhotoAsset } from './photo-assets.js'

/**
 * Seeds a blueprint's demo visuals through the real media pipeline (L25
 * task A0b) — the same {@link ingestMediaUpload} a human upload from the
 * admin takes, so a demo image gets real-type verification, an intrinsic
 * size, and (when an image processor is available) resized WebP variants,
 * exactly like anything a person drags into the media library.
 *
 * One asset per `{ name, spec, alt }` in `specs`; the returned map's keys
 * are those names, so a blueprint can write
 * `product.create({ ..., photo: media.product1 })` without caring what id
 * the store happened to assign.
 *
 * `photo`, when set, names a bundled photograph under `assets/photos/`
 * (see `photo-assets.ts`) — used in place of the procedural `spec` when the
 * file exists, so a hero, a dish, a product or a testimonial avatar is a
 * real, concrete image rather than an abstract flat composition. Absent, or
 * pointing at a file this package does not (or no longer) bundle, falls
 * back to `spec` — a photo is always optional, never a hard requirement.
 */

export interface DemoMediaSpec {
  readonly name: string
  readonly spec: ArtSpec
  readonly alt: string
  readonly photo?: string
}

export interface SeedDemoMediaDeps {
  readonly db: DatabaseHandle
  readonly storage: StorageDriver
  /** Absent: images are still ingested, but carry no dimensions and no variants (R2's shape, applied to images). */
  readonly images?: MediaImageProcessor
  /** Attributed as the uploader — the admin's id when a site has one, `null` otherwise (never guessed). */
  readonly adminId: string | null
}

/** Renders every spec and ingests it, returning `{ [spec.name]: mediaId }`. */
export async function seedDemoMedia(
  deps: SeedDemoMediaDeps,
  specs: readonly DemoMediaSpec[],
): Promise<Record<string, string>> {
  if (specs.length === 0) return {}

  const store = createDatabaseMediaStore({ db: deps.db })
  const ids: Record<string, string> = {}

  for (const item of specs) {
    const photo = item.photo === undefined ? undefined : loadPhotoAsset(item.photo)
    const bytes = photo ?? renderArt(item.spec)
    const asset = await ingestMediaUpload(
      {
        store,
        storage: deps.storage,
        ...(deps.images === undefined ? {} : { images: deps.images }),
      },
      {
        kind: 'image',
        filename: photo === undefined ? `${item.name}.png` : `${item.name}.jpg`,
        mimeType: photo === undefined ? 'image/png' : 'image/jpeg',
        bytes,
        actorId: deps.adminId,
        alt: item.alt,
      },
    )
    ids[item.name] = asset.id
  }

  return ids
}
