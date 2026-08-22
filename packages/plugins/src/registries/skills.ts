import { parseSkillFile } from '@cogenta/agents'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { REGISTRY_TABLES } from './tables.js'

export type SkillSubmissionStatus = 'pending' | 'accepted' | 'rejected'

export interface SkillSubmissionInput {
  readonly submitterId: string
  readonly displayName: string
  readonly description?: string
  /** The skill file's raw frontmatter+instructions text, in `parseSkillFile`'s real format. */
  readonly rawContent: string
}

export interface SkillSubmissionEntry {
  readonly id: string
  readonly submitterId: string
  readonly displayName: string
  readonly description: string | null
  readonly status: SkillSubmissionStatus
  /** From the parsed skill's own frontmatter — `null` when the automatic parse pre-check failed. */
  readonly skillName: string | null
  readonly skillVersion: string | null
  /** Set only for an automatic parse-failure rejection — never for a human decision. */
  readonly rejectionCode: string | null
  readonly rejectionReason: string | null
  readonly reviewedBy: string | null
  readonly reviewedAt: string | null
  readonly submittedAt: string
}

export type SkillReviewDecision = 'accept' | 'reject'

export type SkillReviewResult =
  | { readonly ok: true; readonly entry: SkillSubmissionEntry }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'already_decided'; readonly entry: SkillSubmissionEntry }

export interface SkillRegistry {
  /**
   * Runs the submission through `@cogenta/agents`'s real `parseSkillFile` as
   * a necessary-but-not-sufficient automatic pre-check: content that doesn't
   * even parse as a skill file is rejected immediately, with the real parse
   * error — but content that DOES parse only reaches `pending`, since the
   * lot's own table requires "Revue de contenu" (human review) for skills,
   * unlike the Skins gallery's fully automatic gate.
   */
  submit(input: SkillSubmissionInput): Promise<SkillSubmissionEntry>
  /** A human reviewer's accept/reject decision on a `pending` submission. */
  review(
    id: string,
    decision: SkillReviewDecision,
    reviewerUserId: string,
    notes?: string,
  ): Promise<SkillReviewResult>
  listAccepted(): Promise<readonly SkillSubmissionEntry[]>
  get(id: string): Promise<SkillSubmissionEntry | null>
}

interface SkillRow {
  id: string
  submitter_id: string
  display_name: string
  description: string | null
  skill_name: string | null
  skill_version: string | null
  status: string
  rejection_code: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
}

function toEntry(row: SkillRow): SkillSubmissionEntry {
  const status: SkillSubmissionStatus =
    row.status === 'accepted' ? 'accepted' : row.status === 'pending' ? 'pending' : 'rejected'
  return {
    id: row.id,
    submitterId: row.submitter_id,
    displayName: row.display_name,
    description: row.description,
    status,
    skillName: row.skill_name,
    skillVersion: row.skill_version,
    rejectionCode: row.rejection_code,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
  }
}

export function createSkillRegistry(
  db: DatabaseHandle,
  now: () => number = Date.now,
): SkillRegistry {
  const skills = identifier(REGISTRY_TABLES.skills, db.dialect)

  return {
    async submit(input) {
      const id = newId(now)
      const submittedAt = new Date(now()).toISOString()

      let status: SkillSubmissionStatus = 'pending'
      let skillName: string | null = null
      let skillVersion: string | null = null
      let rejectionCode: string | null = null
      let rejectionReason: string | null = null
      try {
        const { metadata } = parseSkillFile(input.displayName, input.rawContent)
        skillName = metadata.name
        // `version` is optional on a skill file since L24 task 4 (a real
        // Claude Code/Codex `SKILL.md` never carries one) — the marketplace
        // still records whatever the submitter provided, `null` if absent.
        skillVersion = metadata.version ?? null
      } catch (error) {
        status = 'rejected'
        rejectionCode = error instanceof CogentaError ? error.code : 'SKILL_DEFINITION_INVALID'
        rejectionReason = error instanceof Error ? error.message : String(error)
      }

      const description = input.description ?? null
      await db.query(sql`
        insert into ${skills}
          (id, submitter_id, display_name, description, raw_content, skill_name, skill_version,
           status, rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at)
        values
          (${id}, ${input.submitterId}, ${input.displayName}, ${description}, ${input.rawContent},
           ${skillName}, ${skillVersion}, ${status}, ${rejectionCode}, ${rejectionReason},
           ${null}, ${null}, ${submittedAt})`)

      return {
        id,
        submitterId: input.submitterId,
        displayName: input.displayName,
        description,
        status,
        skillName,
        skillVersion,
        rejectionCode,
        rejectionReason,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt,
      }
    },

    async review(id, decision, reviewerUserId, notes) {
      const result = await db.query<SkillRow>(sql`
        select id, submitter_id, display_name, description, skill_name, skill_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${skills} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) return { ok: false, reason: 'not_found' }

      const current = toEntry(row)
      if (current.status !== 'pending')
        return { ok: false, reason: 'already_decided', entry: current }

      const reviewedAt = new Date(now()).toISOString()
      const nextStatus: SkillSubmissionStatus = decision === 'accept' ? 'accepted' : 'rejected'
      const rejectionReason = decision === 'reject' ? (notes ?? null) : null

      await db.query(sql`
        update ${skills}
        set status = ${nextStatus}, rejection_reason = ${rejectionReason},
            reviewed_by = ${reviewerUserId}, reviewed_at = ${reviewedAt}
        where id = ${id}`)

      return {
        ok: true,
        entry: {
          ...current,
          status: nextStatus,
          rejectionReason,
          reviewedBy: reviewerUserId,
          reviewedAt,
        },
      }
    },

    async listAccepted() {
      const result = await db.query<SkillRow>(sql`
        select id, submitter_id, display_name, description, skill_name, skill_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${skills} where status = 'accepted' order by submitted_at asc`)
      return result.rows.map(toEntry)
    },

    async get(id) {
      const result = await db.query<SkillRow>(sql`
        select id, submitter_id, display_name, description, skill_name, skill_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${skills} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : toEntry(row)
    },
  }
}
