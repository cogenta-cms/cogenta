import type { CruxMetrics, Urgency } from '@cogenta/agents-builtin'

/**
 * What a site is allowed to send to the control plane — the closed
 * enumeration of "## Ce qui remonte, et ce qui ne remonte pas"
 * (`docs/lots/L8-flotte.md`), and nothing else. No field on this type, or
 * any type it references, can hold content, media, visitor PII, an API key,
 * agent memory, or a raw log line — that is a property of the SHAPE, not a
 * filter applied after the fact: there is no `content`/`media`/`raw`/`logs`
 * key anywhere on this type for a caller to even attempt to fill in.
 *
 * Some fields are wired to a real, existing data source in this codebase
 * today (see each field's own doc comment); others are a real, honest SHAPE
 * with no data source built yet — `docs/lots/L8-flotte.md`'s own "remonte"
 * list names them regardless, and building the shape now means a later
 * task's real data source slots in without a breaking payload change.
 */
export interface TelemetryPayload {
  readonly siteId: string
  readonly collectedAt: string

  /** Shape only — no real CMS/plugin/theme version inventory exists anywhere in this codebase yet (`cogenta doctor` reports only the Node runtime version). */
  readonly installedVersions: InstalledVersions

  /**
   * A SHA-256 hex digest of the site's real SBOM (`buildSbom`,
   * `@cogenta/agents-builtin`'s security agent) — the fingerprint travels,
   * never the SBOM's actual dependency list, which would itself be more
   * detail than "## Ce qui remonte" asks for.
   */
  readonly sbomFingerprint: string

  /** Real — one entry per open CVE the security agent's real OSV/EPSS pipeline (`assessExploitability`) has assessed for this site's dependencies. */
  readonly openCves: readonly OpenCveSummary[]

  /** Real — the performance agent's real, aggregated CrUX field-data metrics (`CruxMetrics`, `@cogenta/agents-builtin`). `null` when no CrUX data exists for this site (not enough real-user traffic — not an error). */
  readonly coreWebVitalsAggregate: CruxMetrics | null

  /** Shape only — no uptime/availability monitoring exists anywhere in this codebase yet. */
  readonly availability: AvailabilitySummary

  /** Shape only — no real backup dump/restore mechanism exists anywhere in this codebase yet (confirmed absent, L9 task 9's own honest CLI scoping). */
  readonly backups: BackupSummary

  /** Shape only, and nullable — no TLS certificate expiry check exists anywhere in this codebase yet. */
  readonly certificateExpiry: CertificateExpirySummary | null

  /**
   * Real — `count` from `@cogenta/auth`'s real `UserStore.list()` filtered
   * to admin-role users; `mfaEnabledCount` from `CredentialStore.kinds()`
   * reporting a real second factor (`totp` or `webauthn`, never `password`
   * alone) for each. Never an identity — no email, no user id, only counts.
   */
  readonly adminAccounts: AdminAccountsSummary

  /** Shape only — no structured error-aggregation sink exists anywhere in this codebase yet (the logger is real and structured, but nothing aggregates its output for fleet reporting). */
  readonly aggregatedErrors: AggregatedErrorsSummary
}

export interface InstalledVersions {
  readonly cms: string | null
  readonly plugins: readonly { readonly name: string; readonly version: string }[]
  readonly themes: readonly { readonly name: string; readonly version: string }[]
}

export interface OpenCveSummary {
  readonly id: string
  readonly urgency: Urgency
  readonly status: 'open' | 'patched' | 'ignored'
}

export interface AvailabilitySummary {
  /** 0..1 over the reporting window. `null` when no measurement exists yet. */
  readonly uptimeRatio: number | null
}

export interface BackupSummary {
  readonly lastBackupAt: string | null
  readonly lastResult: 'success' | 'failure' | 'unknown'
}

export interface CertificateExpirySummary {
  readonly domain: string
  readonly expiresAt: string
}

export interface AdminAccountsSummary {
  readonly count: number
  readonly mfaEnabledCount: number
}

export interface AggregatedErrorsSummary {
  readonly count: number
  readonly windowStart: string
  readonly windowEnd: string
}
