export type {
  DepsScanInput,
  DepsScanOutput,
  DepsScanToolOptions,
} from './security/deps-scan-tool.js'
export { createDepsScanTool } from './security/deps-scan-tool.js'
export type { EpssScore, QueryEpssOptions } from './security/epss-client.js'
export { queryEpss } from './security/epss-client.js'
export type { ExploitabilityAssessment, Urgency } from './security/exploitability.js'
export { assessExploitability } from './security/exploitability.js'
export type { OsvMatch, OsvVulnerability, QueryOsvOptions } from './security/osv-client.js'
export { queryOsv } from './security/osv-client.js'
export type { SecurityFinding, SecurityReport, SecurityReportEntry } from './security/report.js'
export { buildSecurityReport } from './security/report.js'
export type { SbomEntry } from './security/sbom.js'
export { buildSbom } from './security/sbom.js'
