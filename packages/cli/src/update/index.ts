/**
 * The update system (L22 task 9) — checking npm for a newer
 * `@cogenta/core`/`@cogenta/cli`, applying one with a mandatory restore
 * point first, and the honest, best-effort contract-risk warning that goes
 * with it. See each module's own doc comment for the reasoning; this file
 * is only the barrel.
 */
export type {
  ApplyUpdateInput,
  ApplyUpdateResult,
  RunPackageInstall,
  RunPackageInstallInput,
  RunPackageInstallResult,
} from './apply.js'
export { applyUpdate, runNpmInstall } from './apply.js'
export type { ChangelogSection, ContractRiskWarning } from './changelog-risk.js'
export { sectionsMentioningContractRisk, splitChangelogSections } from './changelog-risk.js'
export type { CheckForUpdatesInput, PackageUpdateStatus, UpdateCheckReport } from './check.js'
export { checkForUpdates } from './check.js'
export type { AssessContractRiskInput, ContractRiskAssessment } from './contract-risk.js'
export { assessContractRisk, contractRiskUnknownError } from './contract-risk.js'
export type { UpdateHistoryEntryInput } from './history.js'
export {
  listUpdateHistory,
  recordUpdateHistory,
  UPDATE_APPLIED_ACTION,
  UPDATE_APPLY_FAILED_ACTION,
  UPDATE_CHECKED_ACTION,
} from './history.js'
export type { RestorePointSummary } from './list-restore-points.js'
export { listRestorePoints } from './list-restore-points.js'
export type { NpmPackageSummary } from './npm-registry.js'
export { fetchNpmPackageSummary } from './npm-registry.js'
export type { CreateUpdateRestorePointOptions, UpdateRestorePoint } from './restore-point.js'
export { createUpdateRestorePoint } from './restore-point.js'
export type { TarEntry } from './tar.js'
export { findPackageFile, readTarEntries, readTarGz } from './tar.js'
export type { AutoUpdatePolicy, UpdateBump } from './version-compare.js'
export {
  AUTO_UPDATE_POLICIES,
  classifyBump,
  higherRiskBump,
  policyAllows,
} from './version-compare.js'
