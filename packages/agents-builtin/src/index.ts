export { securityAgent } from './security/agent.js'
export { bumpDependencyVersion } from './security/bump-version.js'
export type {
  DepsPatchInput,
  DepsPatchOutput,
  DepsPatchToolOptions,
} from './security/deps-patch-tool.js'
export { createDepsPatchTool } from './security/deps-patch-tool.js'
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
export type { OpenPrOptions, PrClient, PrFile, PrResult } from './security/pr-client.js'
export type { SecurityFinding, SecurityReport, SecurityReportEntry } from './security/report.js'
export { buildSecurityReport } from './security/report.js'
export type { SbomEntry } from './security/sbom.js'
export { buildSbom } from './security/sbom.js'
export { seoAgent } from './seo/agent.js'
export { auditSeoPage } from './seo/audit.js'
export type {
  CannibalizationCandidatePage,
  CannibalizationPair,
  DetectCannibalizationOptions,
} from './seo/cannibalization.js'
export { detectCannibalization } from './seo/cannibalization.js'
export type {
  InternalLinkCandidatePage,
  InternalLinkProposal,
  InternalLinkSourcePage,
  ProposeInternalLinksOptions,
} from './seo/internal-linking.js'
export { proposeInternalLinks } from './seo/internal-linking.js'
export type { ArticleJsonLdInput, ArticleJsonLdType, JsonLd } from './seo/json-ld.js'
export { buildArticleJsonLd, validateJsonLd } from './seo/json-ld.js'
export { validateLlmsTxt } from './seo/llms-txt.js'
export { countWords, fleschReadingEase } from './seo/readability.js'
export type { Redirect } from './seo/redirects.js'
export { findOrphanedRedirects } from './seo/redirects.js'
export { cosineSimilarity } from './seo/similarity.js'
export type {
  SeoAuditResult,
  SeoFinding,
  SeoHeading,
  SeoImage,
  SeoIssueSeverity,
  SeoPageInput,
} from './seo/types.js'
