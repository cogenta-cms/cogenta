import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import { createSchemaTables, dropSchemaTables } from '@cogenta/schema'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'

export interface ResetPlaygroundDataOptions {
  readonly db: DatabaseHandle
  /** Which real content pack to reset back to — `blog` by default, the one with the richest real demo content. */
  readonly blueprintId?: string
  readonly defaultLocale?: string
  /** An existing admin's email, whose id becomes `createdBy` on every reseeded entry. Omit to leave it null. */
  readonly adminEmail?: string
}

/**
 * "Un bac à sable public exécutant du code arbitraire est une cible.
 * Commencer par une démo en lecture seule réinitialisée périodiquement."
 * (L9 tâche 12).
 *
 * Wipes a blueprint's own tables and reseeds its real demo content —
 * `BLUEPRINT_CONTENT_PACKS`, the exact same collections and
 * `seedDemoContent` already built and tested for `create-cogenta`'s
 * installer (L9 tasks 3-4, 8), not a second, parallel set of demo data
 * invented for this one purpose.
 *
 * A real, tested, callable unit — scheduling it periodically (a cron job,
 * a platform's scheduled task) is an operational decision for whoever
 * deploys a read-only playground instance, out of scope here: this
 * function does the actual reset, once, when called.
 */
export async function resetPlaygroundData(options: ResetPlaygroundDataOptions): Promise<void> {
  const blueprintId = options.blueprintId ?? 'blog'
  const pack = BLUEPRINT_CONTENT_PACKS[blueprintId]
  if (pack === undefined) {
    throw new CogentaError({
      code: 'PLAYGROUND_BLUEPRINT_UNKNOWN',
      message: `No content pack for blueprint "${blueprintId}".`,
      hint: `Pass one of: ${Object.keys(BLUEPRINT_CONTENT_PACKS).join(', ')}.`,
      details: { blueprintId },
    })
  }

  await dropSchemaTables(options.db, pack.collections)
  await createSchemaTables(options.db, pack.collections)

  await ensureAuthTables(options.db)
  const adminId =
    options.adminEmail === undefined
      ? null
      : ((await createUserStore(options.db).byEmail(options.adminEmail))?.id ?? null)

  await pack.seedDemoContent(options.db, options.defaultLocale ?? 'en', adminId)
}
