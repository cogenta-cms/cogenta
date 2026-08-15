import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { definePlugin, type PluginManifest } from '../manifest.js'
import { TRUSTED_REGISTRY_PUBLIC_KEYS, verifyContentAgainstTrustedKeys } from '../signing/verify.js'
import { REGISTRY_TABLES } from './tables.js'

export type PluginSubmissionStatus = 'pending' | 'accepted' | 'rejected'

export interface PluginSubmissionInput {
  readonly submitterId: string
  readonly displayName: string
  readonly description?: string
  /** Raw manifest input, unvalidated until `submit()` runs it through `definePlugin`. */
  readonly manifest: unknown
  /** Base64 Ed25519 signature over the manifest's canonical content, or `null` for none. */
  readonly signatureBase64: string | null
}

export interface PluginSubmissionEntry {
  readonly id: string
  readonly submitterId: string
  readonly displayName: string
  readonly description: string | null
  readonly status: PluginSubmissionStatus
  /** From the validated manifest — `null` when an automatic gate rejected the submission. */
  readonly pluginName: string | null
  readonly pluginVersion: string | null
  /** Set only for an automatic-gate rejection (signature or manifest) — never for a human decision. */
  readonly rejectionCode: string | null
  readonly rejectionReason: string | null
  readonly reviewedBy: string | null
  readonly reviewedAt: string | null
  readonly submittedAt: string
}

export type PluginReviewDecision = 'accept' | 'reject'

export type PluginReviewResult =
  | { readonly ok: true; readonly entry: PluginSubmissionEntry }
  | { readonly ok: false; readonly reason: 'not_found' }
  | {
      readonly ok: false
      readonly reason: 'already_decided'
      readonly entry: PluginSubmissionEntry
    }

export interface PluginRegistryOptions {
  readonly trustedPublicKeys?: readonly string[]
}

export interface PluginRegistry {
  /**
   * Runs the submission through the lot's own three named gates
   * ("Signature, manifeste, revue" — docs/lots/L7-extensibilite.md § Registres),
   * in order:
   *
   * (1) **Signature** — checked first, against the raw, not-yet-validated
   * manifest content. Signature is the more fundamental trust question: a
   * submission with no valid signature from a trusted registry key is
   * refused before any structural inspection runs, so an unsigned/untrusted
   * submission can never use manifest-validation error messages as an
   * oracle to probe this registry's rules.
   * (2) **Manifeste** — task 1's real `definePlugin`, unchanged and
   * unre-implemented: the exact same four hard refusals (unscoped
   * `http.fetch`, storage outside the plugin's own prefix, unknown
   * capability, block without `fallback`) plus every structural rule apply
   * here, identically to a manifest loaded straight off disk.
   * (3) **Revue** — a submission that clears both automatic gates reaches
   * `pending`, exactly mirroring the Skills registry's (task 11) two-step
   * state machine: automatic pre-check necessary but not sufficient, a real
   * human decision required before acceptance. Plugins execute code — the
   * one property distinguishing this registry from every other one in the
   * lot's table — so no registry here is ever automatic-only.
   */
  submit(input: PluginSubmissionInput): Promise<PluginSubmissionEntry>
  /** A human reviewer's accept/reject decision on a `pending` submission. */
  review(
    id: string,
    decision: PluginReviewDecision,
    reviewerUserId: string,
    notes?: string,
  ): Promise<PluginReviewResult>
  listAccepted(): Promise<readonly PluginSubmissionEntry[]>
  get(id: string): Promise<PluginSubmissionEntry | null>
}

interface PluginRow {
  id: string
  submitter_id: string
  display_name: string
  description: string | null
  plugin_name: string | null
  plugin_version: string | null
  status: string
  rejection_code: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
}

function toEntry(row: PluginRow): PluginSubmissionEntry {
  const status: PluginSubmissionStatus =
    row.status === 'accepted' ? 'accepted' : row.status === 'pending' ? 'pending' : 'rejected'
  return {
    id: row.id,
    submitterId: row.submitter_id,
    displayName: row.display_name,
    description: row.description,
    status,
    pluginName: row.plugin_name,
    pluginVersion: row.plugin_version,
    rejectionCode: row.rejection_code,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
  }
}

export function createPluginRegistry(
  db: DatabaseHandle,
  options: PluginRegistryOptions = {},
  now: () => number = Date.now,
): PluginRegistry {
  const plugins = identifier(REGISTRY_TABLES.plugins, db.dialect)
  const trustedPublicKeys = options.trustedPublicKeys ?? TRUSTED_REGISTRY_PUBLIC_KEYS

  return {
    async submit(input) {
      const id = newId(now)
      const submittedAt = new Date(now()).toISOString()

      let status: PluginSubmissionStatus = 'pending'
      let pluginName: string | null = null
      let pluginVersion: string | null = null
      let rejectionCode: string | null = null
      let rejectionReason: string | null = null

      const signed = verifyContentAgainstTrustedKeys(
        input.manifest,
        input.signatureBase64,
        trustedPublicKeys,
      )

      if (!signed) {
        status = 'rejected'
        rejectionCode =
          input.signatureBase64 === null ? 'PLUGIN_SIGNATURE_MISSING' : 'PLUGIN_SIGNATURE_INVALID'
        rejectionReason =
          input.signatureBase64 === null
            ? `The plugin "${input.displayName}" was submitted with no signature.`
            : `The plugin "${input.displayName}" has no valid signature from a trusted registry key.`
      } else {
        try {
          const manifest = definePlugin(input.manifest as PluginManifest)
          pluginName = manifest.name
          pluginVersion = manifest.version
        } catch (error) {
          status = 'rejected'
          rejectionCode = error instanceof CogentaError ? error.code : 'PLUGIN_MANIFEST_INVALID'
          rejectionReason = error instanceof Error ? error.message : String(error)
        }
      }

      const description = input.description ?? null
      await db.query(sql`
        insert into ${plugins}
          (id, submitter_id, display_name, description, plugin_name, plugin_version,
           status, rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at)
        values
          (${id}, ${input.submitterId}, ${input.displayName}, ${description},
           ${pluginName}, ${pluginVersion}, ${status}, ${rejectionCode}, ${rejectionReason},
           ${null}, ${null}, ${submittedAt})`)

      return {
        id,
        submitterId: input.submitterId,
        displayName: input.displayName,
        description,
        status,
        pluginName,
        pluginVersion,
        rejectionCode,
        rejectionReason,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt,
      }
    },

    async review(id, decision, reviewerUserId, notes) {
      const result = await db.query<PluginRow>(sql`
        select id, submitter_id, display_name, description, plugin_name, plugin_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${plugins} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) return { ok: false, reason: 'not_found' }

      const current = toEntry(row)
      if (current.status !== 'pending')
        return { ok: false, reason: 'already_decided', entry: current }

      const reviewedAt = new Date(now()).toISOString()
      const nextStatus: PluginSubmissionStatus = decision === 'accept' ? 'accepted' : 'rejected'
      const rejectionReason = decision === 'reject' ? (notes ?? null) : null

      await db.query(sql`
        update ${plugins}
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
      const result = await db.query<PluginRow>(sql`
        select id, submitter_id, display_name, description, plugin_name, plugin_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${plugins} where status = 'accepted' order by submitted_at asc`)
      return result.rows.map(toEntry)
    },

    async get(id) {
      const result = await db.query<PluginRow>(sql`
        select id, submitter_id, display_name, description, plugin_name, plugin_version, status,
               rejection_code, rejection_reason, reviewed_by, reviewed_at, submitted_at
        from ${plugins} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : toEntry(row)
    },
  }
}
