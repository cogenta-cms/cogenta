import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { validateSkin } from '@cogenta/render'
import { REGISTRY_TABLES } from './tables.js'

export type SkinSubmissionStatus = 'accepted' | 'rejected'

export interface SkinSubmissionInput {
  readonly submitterId: string
  readonly displayName: string
  readonly description?: string
  /** A skin's raw candidate token JSON, unvalidated until `submit()` runs it through `validateSkin`. */
  readonly tokens: unknown
}

export interface SkinGalleryEntry {
  readonly id: string
  readonly submitterId: string
  readonly displayName: string
  readonly description: string | null
  readonly status: SkinSubmissionStatus
  /** `validateSkin`'s real failure code (e.g. `SKIN_CONTRAST_INSUFFICIENT`) — `null` when accepted. */
  readonly rejectionCode: string | null
  readonly rejectionReason: string | null
  readonly submittedAt: string
}

export interface SkinGallery {
  /**
   * Runs the candidate through the real `validateSkin` (`@cogenta/render`)
   * gate and stores the outcome either way — "sans revue humaine" (the lot's
   * own words): there is no pending/reviewed state a human could act on,
   * only `accepted`/`rejected`, decided once, at submission time.
   */
  submit(input: SkinSubmissionInput): Promise<SkinGalleryEntry>
  listAccepted(): Promise<readonly SkinGalleryEntry[]>
  get(id: string): Promise<SkinGalleryEntry | null>
}

interface SkinRow {
  id: string
  submitter_id: string
  display_name: string
  description: string | null
  status: string
  rejection_code: string | null
  rejection_reason: string | null
  submitted_at: string
}

function toEntry(row: SkinRow): SkinGalleryEntry {
  return {
    id: row.id,
    submitterId: row.submitter_id,
    displayName: row.display_name,
    description: row.description,
    status: row.status === 'accepted' ? 'accepted' : 'rejected',
    rejectionCode: row.rejection_code,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
  }
}

export function createSkinGallery(db: DatabaseHandle, now: () => number = Date.now): SkinGallery {
  const skins = identifier(REGISTRY_TABLES.skins, db.dialect)

  return {
    async submit(input) {
      const id = newId(now)
      const submittedAt = new Date(now()).toISOString()

      let status: SkinSubmissionStatus = 'accepted'
      let rejectionCode: string | null = null
      let rejectionReason: string | null = null
      try {
        validateSkin(input.tokens)
      } catch (error) {
        status = 'rejected'
        rejectionCode = error instanceof CogentaError ? error.code : 'SKIN_VALIDATION_FAILED'
        rejectionReason = error instanceof Error ? error.message : String(error)
      }

      const description = input.description ?? null
      await db.query(sql`
        insert into ${skins}
          (id, submitter_id, display_name, description, tokens_json, status, rejection_code, rejection_reason, submitted_at)
        values
          (${id}, ${input.submitterId}, ${input.displayName}, ${description}, ${JSON.stringify(input.tokens)}, ${status}, ${rejectionCode}, ${rejectionReason}, ${submittedAt})`)

      return {
        id,
        submitterId: input.submitterId,
        displayName: input.displayName,
        description,
        status,
        rejectionCode,
        rejectionReason,
        submittedAt,
      }
    },

    async listAccepted() {
      const result = await db.query<SkinRow>(sql`
        select id, submitter_id, display_name, description, status, rejection_code, rejection_reason, submitted_at
        from ${skins} where status = 'accepted' order by submitted_at asc`)
      return result.rows.map(toEntry)
    },

    async get(id) {
      const result = await db.query<SkinRow>(sql`
        select id, submitter_id, display_name, description, status, rejection_code, rejection_reason, submitted_at
        from ${skins} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : toEntry(row)
    },
  }
}
