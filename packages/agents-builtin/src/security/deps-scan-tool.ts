import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'
import { queryEpss } from './epss-client.js'
import { assessExploitability } from './exploitability.js'
import { queryOsv } from './osv-client.js'
import { buildSecurityReport, type SecurityFinding } from './report.js'
import { buildSbom } from './sbom.js'

export interface DepsScanToolOptions {
  readonly fetchImpl?: typeof fetch
  readonly osvBaseUrl?: string
  readonly epssBaseUrl?: string
  readonly now?: () => number
}

const DepsScanInputSchema = z.object({
  /** Exact, resolved versions — from a lockfile, not `package.json` ranges. */
  dependencies: z.record(z.string(), z.string()),
})
export type DepsScanInput = z.infer<typeof DepsScanInputSchema>

const SecurityReportEntrySchema = z.object({
  finding: z.object({
    package: z.string(),
    version: z.string(),
    vulnerability: z.object({
      id: z.string(),
      summary: z.string().optional(),
      details: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      cvssScore: z.number().optional(),
    }),
    assessment: z.object({
      cvss: z.number().optional(),
      epss: z.number().optional(),
      urgency: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  }),
  whatIsAffected: z.string(),
  whatAnAttackerCouldDo: z.string(),
  isTheSiteExposed: z.string(),
  whatIsProposed: z.string(),
  whatHappensIfNothingIsDone: z.string(),
})

const DepsScanOutputSchema = z.object({
  entries: z.array(SecurityReportEntrySchema),
  generatedAt: z.string(),
})
export type DepsScanOutput = z.infer<typeof DepsScanOutputSchema>

/**
 * `deps.scan` — SBOM → OSV correlation (only versions genuinely installed
 * and affected) → EPSS → exploitability → imposed-format report, in one
 * call. Read-only (`sideEffects: false`): it never patches anything, that
 * is `deps.patch`'s job (a later task). No side-effecting HTTP call goes
 * unrestricted through the generic `http.fetch` tool here — OSV/EPSS access
 * is baked into this tool's own implementation, testable with an injected
 * `fetchImpl` exactly like `http.fetch` itself.
 */
export function createDepsScanTool(
  options: DepsScanToolOptions = {},
): ToolDefinition<DepsScanInput, DepsScanOutput> {
  return defineTool({
    name: 'deps.scan',
    version: '1.0.0',
    description:
      'Scans the resolved dependency set for vulnerabilities genuinely affecting the installed versions, cross-referenced with real-world exploitation likelihood.',
    input: DepsScanInputSchema,
    output: DepsScanOutputSchema,
    permissions: ['deps.scan'],
    sideEffects: false,
    reversible: false,
    cost: 'medium',
    async execute(input) {
      const sbom = buildSbom(input.dependencies)
      const matches = await queryOsv(sbom, {
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        ...(options.osvBaseUrl === undefined ? {} : { baseUrl: options.osvBaseUrl }),
      })

      const allCveIds = matches
        .flatMap((match) => match.vulnerabilities)
        .flatMap((vuln) => vuln.aliases ?? [])
        .filter((alias) => alias.startsWith('CVE-'))
      const epssScores = await queryEpss(allCveIds, {
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        ...(options.epssBaseUrl === undefined ? {} : { baseUrl: options.epssBaseUrl }),
      })

      const findings: SecurityFinding[] = matches.flatMap((match) =>
        match.vulnerabilities.map((vulnerability) => {
          const cveAlias = vulnerability.aliases?.find((alias) => alias.startsWith('CVE-'))
          const epss = cveAlias === undefined ? undefined : epssScores.get(cveAlias)
          return {
            package: match.entry.name,
            version: match.entry.version,
            vulnerability,
            assessment: assessExploitability(vulnerability, epss),
          }
        }),
      )

      return buildSecurityReport(findings, {
        ...(options.now === undefined ? {} : { now: options.now }),
      }) as DepsScanOutput
    },
  })
}
