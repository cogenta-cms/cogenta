import { ingestMediaUpload, type MediaImageProcessor } from '@cogenta/api'
import { createDatabaseMediaStore, type DatabaseHandle, type StorageDriver } from '@cogenta/core'
import type { ArtSpec } from '../demo-art/render.js'
import { renderArt } from '../demo-art/render.js'

/**
 * Seeds a blueprint's procedural demo visuals through the real media
 * pipeline (L25 task A0b) — the same {@link ingestMediaUpload} a human
 * upload from the admin takes, so a demo image gets real-type verification,
 * an intrinsic size, and (when an image processor is available) resized
 * WebP variants, exactly like anything a person drags into the media
 * library.
 *
 * One asset per `{ name, spec, alt }` in `specs`; the returned map's keys
 * are those names, so a blueprint can write
 * `product.create({ ..., photo: media.product1 })` without caring what id
 * the store happened to assign.
 */

export interface DemoMediaSpec {
  readonly name: string
  readonly spec: ArtSpec
  readonly alt: string
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
    const png = renderArt(item.spec)
    const asset = await ingestMediaUpload(
      {
        store,
        storage: deps.storage,
        ...(deps.images === undefined ? {} : { images: deps.images }),
      },
      {
        kind: 'image',
        filename: `${item.name}.png`,
        mimeType: 'image/png',
        bytes: png,
        actorId: deps.adminId,
        alt: item.alt,
      },
    )
    ids[item.name] = asset.id
  }

  return ids
}
