import { CogentaError, type Logger } from '@cogenta/core'
import { createSiteBackup } from '../commands/backup.js'

/**
 * "Un point de restauration obligatoire avant toute mise à jour" (L22 task
 * 9, point 2) — this is the *entire* implementation: one call into
 * `createSiteBackup`, the exact function `cogenta backup create` itself
 * calls, tagged with the `update-` filename prefix so it shows up
 * identifiably in `cogenta backup list` and in the admin's own history view
 * without a second backup format or a second directory. Never a smaller,
 * update-specific backup — a restore point has to be able to put the whole
 * site back, and `createSiteBackup` already is that.
 */

export interface CreateUpdateRestorePointOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly dir?: string
}

export interface UpdateRestorePoint {
  readonly path: string
  readonly createdAt: string
  readonly tableCount: number
  readonly rowCount: number
  readonly checksum: string
}

export async function createUpdateRestorePoint(
  options: CreateUpdateRestorePointOptions,
): Promise<UpdateRestorePoint> {
  try {
    const { path, manifest } = await createSiteBackup({ ...options, filenamePrefix: 'update-' })
    return {
      path,
      createdAt: manifest.createdAt,
      tableCount: manifest.tables.length,
      rowCount: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
      checksum: manifest.checksum,
    }
  } catch (error) {
    throw new CogentaError({
      code: 'UPDATE_RESTORE_POINT_FAILED',
      message: 'Could not create a restore point before the update — nothing was changed.',
      hint: 'This update was refused rather than applied without a safety net. Check the underlying error, free up disk space if that is the cause, and try again.',
      cause: error,
    })
  }
}
