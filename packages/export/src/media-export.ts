import type { MediaAsset, MediaStore } from '@cogenta/core'
import { CogentaError, type StorageDriver } from '@cogenta/core'
import { type ExportMediaRefRecord, encodeRecord } from './format.js'
import { createZipWriter } from './zip-writer.js'

export interface MediaExportOptions {
  readonly media: MediaStore
  readonly ids: readonly string[]
}

/**
 * Task 2, "references seules" mode: one NDJSON line per medium, naming its
 * storage key rather than its bytes. Cheap, and correct whenever the target
 * site shares (or restores) the same storage — a media archive (below) is
 * for when it does not.
 */
export async function* exportMediaReferences(options: MediaExportOptions): AsyncGenerator<string> {
  for (const id of options.ids) {
    const asset = await options.media.get(id)
    if (asset === null) continue
    const record: ExportMediaRefRecord = {
      kind: 'media-ref',
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      storageKey: asset.storageKey,
    }
    yield encodeRecord(record)
  }
}

export interface MediaArchiveOptions {
  readonly media: MediaStore
  readonly storage: StorageDriver
  readonly ids: readonly string[]
  /** Receives each chunk of the ZIP as it is produced. Never buffers the whole archive (task 2's own rule). */
  readonly write: (chunk: Buffer) => Promise<void> | void
  readonly onAsset?: (asset: MediaAsset) => void
}

/**
 * Task 2, "archive complète" mode: every referenced medium's real bytes,
 * streamed straight from `storage.get()` into the ZIP entry — the file is
 * never read into a `Buffer` first, so a multi-gigabyte archive costs the
 * process no more memory than a small one.
 *
 * A manifest of what went in (`manifest.json`, one JSON array) is written as
 * the archive's own first entry, so a person who only has the `.zip` — no
 * accompanying export stream — can still tell what each file was for.
 */
export async function exportMediaArchive(options: MediaArchiveOptions): Promise<void> {
  const zip = createZipWriter({ write: options.write })
  const manifest: ExportMediaRefRecord[] = []

  for (const id of options.ids) {
    const asset = await options.media.get(id)
    if (asset === null) {
      throw new CogentaError({
        code: 'EXPORT_MEDIA_NOT_FOUND',
        message: `Media asset "${id}" referenced by the export no longer exists.`,
        hint: 'Re-run the content export, or export media references only.',
        details: { id },
      })
    }
    options.onAsset?.(asset)
    manifest.push({
      kind: 'media-ref',
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      storageKey: asset.storageKey,
    })

    const body = await options.storage.get(asset.storageKey)
    await zip.addFile(`media/${asset.id}/${asset.filename}`, body)
  }

  await zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
  await zip.finish()
}
