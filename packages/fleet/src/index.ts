export { assertNoForbiddenFields } from './agent/assert.js'
export { fingerprintSbom, summarizeAdminAccounts } from './agent/build.js'
export type { SignedTelemetry } from './agent/sign.js'
export { signTelemetryPayload, verifyTelemetrySignature } from './agent/sign.js'
export type {
  AdminAccountsSummary,
  AggregatedErrorsSummary,
  AvailabilitySummary,
  BackupSummary,
  CertificateExpirySummary,
  InstalledVersions,
  OpenCveSummary,
  TelemetryPayload,
} from './agent/types.js'
export type { IngestResult } from './control/ingest.js'
export { ingestTelemetry } from './control/ingest.js'
export type { FleetFilter, RiskReason, RiskTier, SiteRisk } from './control/risk.js'
export {
  computeSiteRisk,
  filterRisks,
  groupRisksByClient,
  rankSitesByRisk,
} from './control/risk.js'
export type { SiteStateStore, TelemetrySnapshot } from './control/state.js'
export { createSiteStateStore } from './control/state.js'
export { CONTROL_TABLES, ensureControlTables } from './control/tables.js'
export type {
  EnrollmentStore,
  PairingConsumeResult,
  PairingToken,
  SiteRegistration,
} from './enrollment/store.js'
export { createEnrollmentStore } from './enrollment/store.js'
export { ensureFleetTables, FLEET_TABLES } from './enrollment/tables.js'
export { generatePairingToken, hashPairingToken } from './enrollment/tokens.js'
export type {
  DriftDirection,
  DriftEntry,
  FleetBaseline,
  InventoryComponent,
  InventoryComponentKind,
  SiteInventory,
} from './inventory/drift.js'
export { computeFleetBaseline, detectDrift, extractInventory } from './inventory/drift.js'
