import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { parseThemeManifest, validateSkin, verifyTheme } from '@cogenta/render'
import { TRUSTED_REGISTRY_PUBLIC_KEYS, verifyContentAgainstTrustedKeys } from '../signing/verify.js'
import { REGISTRY_TABLES } from './tables.js'

export type ThemeSubmissionStatus = 'accepted' | 'rejected'

export interface ThemeSubmissionInput {
  readonly submitterId: string
  readonly displayName: string
  readonly description?: string
  /** Raw manifest input, unvalidated until `submit()` runs it through `parseThemeManifest`. */
  readonly manifest: unknown
  /**
   * Real filesystem path to the theme's extracted source tree — `verifyTheme`
   * (contract D's install-time check) scans real files for the forbidden-import
   * and `implements`-coverage rules, so a submission needs real content on
   * disk, not just an inline JSON blob the way a skin submission does.
   */
  readonly themeRoot: string
  /** Base64 Ed25519 signature over the manifest's canonical content, or `null` for none. */
  readonly signatureBase64: string | null
}

export interface ThemeRegistryEntry {
  readonly id: string
  readonly submitterId: string
  readonly displayName: string
  readonly description: string | null
  readonly status: ThemeSubmissionStatus
  /** Which real gate failed: `signature`, or a contract-D `CogentaError` code — `null` when accepted. */
  readonly rejectionCode: string | null
  readonly rejectionReason: string | null
  readonly submittedAt: string
}

export interface ThemeRegistryOptions {
  readonly trustedPublicKeys?: readonly string[]
}

export interface ThemeRegistry {
  /**
   * Runs the submission through the lot's own two named gates, in order:
   * (1) **Signature** — the manifest's canonical content must carry a valid
   * Ed25519 signature from a trusted registry key (task 9's real primitive,
   * generalized to arbitrary content). Checked first because it is the more
   * fundamental trust question — an unsigned theme is refused before any
   * contract inspection runs, the same way an unlinked channel identity is
   * refused before a command is even looked up (L6 task 3's precedent).
   * (2) **Contrat vérifié** — contract D's real install-time check
   * (`verifyTheme`, `@cogenta/render`): every vocabulary block is declared in
   * `implements`, no forbidden import (`node:fs`, `@cogenta/core`, ...)
   * appears anywhere in the theme's real sources, and its default skin
   * (`tokens.json`) passes `validateSkin` — contract D's token rules, reused
   * exactly as the Skins gallery (task 10) reused them, not reimplemented.
   *
   * No human-review step exists for themes ("Signature, contrat vérifié" is
   * the lot's whole named requirement — no "revue" column value, unlike
   * Skills) — a single automatic decision at submission time, same shape as
   * the fully-automatic Skins gallery, just with more real checks.
   */
  submit(input: ThemeSubmissionInput): Promise<ThemeRegistryEntry>
  listAccepted(): Promise<readonly ThemeRegistryEntry[]>
  get(id: string): Promise<ThemeRegistryEntry | null>
}

interface ThemeRow {
  id: string
  submitter_id: string
  display_name: string
  description: string | null
  status: string
  rejection_code: string | null
  rejection_reason: string | null
  submitted_at: string
}

function toEntry(row: ThemeRow): ThemeRegistryEntry {
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

export function createThemeRegistry(
  db: DatabaseHandle,
  options: ThemeRegistryOptions = {},
  now: () => number = Date.now,
): ThemeRegistry {
  const themes = identifier(REGISTRY_TABLES.themes, db.dialect)
  const trustedPublicKeys = options.trustedPublicKeys ?? TRUSTED_REGISTRY_PUBLIC_KEYS

  return {
    async submit(input) {
      const id = newId(now)
      const submittedAt = new Date(now()).toISOString()

      let status: ThemeSubmissionStatus = 'accepted'
      let rejectionCode: string | null = null
      let rejectionReason: string | null = null

      try {
        const manifest = parseThemeManifest(input.manifest, input.displayName)

        const signed = verifyContentAgainstTrustedKeys(
          manifest,
          input.signatureBase64,
          trustedPublicKeys,
        )
        if (!signed) {
          throw new CogentaError({
            code: 'THEME_SIGNATURE_INVALID',
            message: `The theme "${manifest.name}" has no valid signature from a trusted registry key.`,
            hint: 'Sign the theme manifest with a registered registry key before submitting, or trust the signing key explicitly.',
            details: { theme: manifest.name },
          })
        }

        await verifyTheme({ root: input.themeRoot, manifest })

        const tokensPath = join(input.themeRoot, manifest.tokens)
        const tokensRaw = await readFile(tokensPath, 'utf8')
        validateSkin(JSON.parse(tokensRaw))
      } catch (error) {
        status = 'rejected'
        rejectionCode = error instanceof CogentaError ? error.code : 'THEME_SUBMISSION_INVALID'
        rejectionReason = error instanceof Error ? error.message : String(error)
      }

      const description = input.description ?? null
      await db.query(sql`
        insert into ${themes}
          (id, submitter_id, display_name, description, status, rejection_code, rejection_reason, submitted_at)
        values
          (${id}, ${input.submitterId}, ${input.displayName}, ${description}, ${status}, ${rejectionCode}, ${rejectionReason}, ${submittedAt})`)

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
      const result = await db.query<ThemeRow>(sql`
        select id, submitter_id, display_name, description, status, rejection_code, rejection_reason, submitted_at
        from ${themes} where status = 'accepted' order by submitted_at asc`)
      return result.rows.map(toEntry)
    },

    async get(id) {
      const result = await db.query<ThemeRow>(sql`
        select id, submitter_id, display_name, description, status, rejection_code, rejection_reason, submitted_at
        from ${themes} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : toEntry(row)
    },
  }
}
