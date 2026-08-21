import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readBackupManifest } from '@cogenta/export'

/**
 * The restore-point half of "historique des mises à jour et des points de
 * restauration" (L22 task 9, point 5) — exactly `cogenta backup list`'s own
 * directory scan (`.cogenta/backups`), reused rather than re-implemented,
 * with one addition: `triggeredByUpdate` is read straight off the filename
 * prefix `restore-point.ts` writes (`update-…zip` vs. `backup-…zip`), so the
 * admin's history view can show *which* restore points exist because an
 * update took them automatically, without a second manifest field.
 */

export interface RestorePointSummary {
  readonly path: string
  readonly createdAt: string
  readonly rows: number
  readonly tables: number
  readonly checksum: string
  readonly encrypted: boolean
  readonly triggeredByUpdate: boolean
}

export async function listRestorePoints(dir: string): Promise<readonly RestorePointSummary[]> {
  let files: readonly string[]
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith('.zip'))
  } catch {
    // No backup directory yet — nothing has ever been backed up.
    return []
  }

  const summaries: RestorePointSummary[] = []
  for (const file of files) {
    try {
      const manifest = await readBackupManifest(join(dir, file))
      summaries.push({
        path: join(dir, file),
        createdAt: manifest.createdAt,
        rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
        tables: manifest.tables.length,
        checksum: manifest.checksum,
        encrypted: manifest.encrypted,
        triggeredByUpdate: file.startsWith('update-'),
      })
    } catch {
      // A manifest that fails to read (corrupted, mid-write) is skipped
      // rather than crashing the whole history view — `cogenta backup list`
      // makes the same choice for the same reason.
    }
  }
  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
