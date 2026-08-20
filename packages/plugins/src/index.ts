export type { CapabilityCallContext, CapabilityHandler } from './host/capabilities.js'
export {
  createContentReadHandler,
  createHttpFetchHandler,
  createStorageReadHandler,
  createStorageWriteHandler,
} from './host/capabilities.js'
export type {
  IsolatedRunResult,
  PluginDisabledEvent,
  RunIsolatedOptions,
  RunPluginOptions,
} from './host/worker-runner.js'
export { runIsolated, runIsolatedOrThrow, runPlugin } from './host/worker-runner.js'
export type { LoadPluginOptions, PluginSource, ResolvedPlugin } from './loader.js'
export {
  loadMarketplacePlugin,
  loadPlugin,
  PLUGIN_MANIFEST_FILE_NAMES,
  resolveSignatureStatus,
} from './loader.js'
export type {
  PluginBlockProvision,
  PluginCapabilityName,
  PluginManifest,
  PluginManifestIssue,
  PluginProvides,
  PluginRuntime,
} from './manifest.js'
export {
  definePlugin,
  PLUGIN_CAPABILITY_NAMES,
  PLUGIN_RUNTIMES,
} from './manifest.js'
export type {
  PluginCapabilityDescription,
  PluginCapabilityRisk,
} from './permissions/describe.js'
export { DESCRIBABLE_CAPABILITY_NAMES, describeCapability } from './permissions/describe.js'
export type {
  PluginDisabledRecord,
  PluginDisableStore,
  PluginViolationReason,
} from './permissions/disabled.js'
export { createPluginDisableStore } from './permissions/disabled.js'
export type { PluginGrant, PluginGrantStore } from './permissions/grants.js'
export { createPluginGrantStore } from './permissions/grants.js'
export {
  detectCapabilitiesNeedingApproval,
  resolveGrantedCapabilities,
} from './permissions/resolve.js'
export type {
  GrantedCapabilityReview,
  PendingCapabilityReview,
} from './permissions/review.js'
export {
  describePendingApproval,
  listGrantedCapabilities,
  revokeCapability,
} from './permissions/review.js'
export { ensurePluginTables, PERMISSION_TABLES } from './permissions/tables.js'
export type {
  PluginRunObservation,
  PluginRunOutcome,
  PluginUsageRecord,
  PluginUsageStore,
} from './permissions/usage.js'
export { createPluginUsageStore } from './permissions/usage.js'
export type {
  MarketplaceCatalog,
  MarketplaceCatalogEntry,
  MarketplaceCatalogFilter,
  MarketplaceChangelogEntry,
  MarketplaceInstaller,
  MarketplaceInstallerOptions,
  MarketplaceInstallRecord,
  MarketplaceItemKind,
  MarketplacePreview,
  MarketplaceUpdateResult,
} from './registries/marketplace.js'
export { createMarketplaceCatalog, createMarketplaceInstaller } from './registries/marketplace.js'
export { ensureMarketplaceTables, MARKETPLACE_TABLES } from './registries/marketplace-tables.js'
export type {
  PluginRegistry,
  PluginRegistryOptions,
  PluginReviewDecision,
  PluginReviewResult,
  PluginSubmissionEntry,
  PluginSubmissionInput,
  PluginSubmissionStatus,
} from './registries/plugins.js'
export { createPluginRegistry } from './registries/plugins.js'
export type {
  SkillRegistry,
  SkillReviewDecision,
  SkillReviewResult,
  SkillSubmissionEntry,
  SkillSubmissionInput,
  SkillSubmissionStatus,
} from './registries/skills.js'
export { createSkillRegistry } from './registries/skills.js'
export type {
  SkinGallery,
  SkinGalleryEntry,
  SkinSubmissionInput,
  SkinSubmissionStatus,
} from './registries/skins.js'
export { createSkinGallery } from './registries/skins.js'
export { ensureRegistryTables, REGISTRY_TABLES } from './registries/tables.js'
export type {
  ThemeRegistry,
  ThemeRegistryEntry,
  ThemeRegistryOptions,
  ThemeSubmissionInput,
  ThemeSubmissionStatus,
} from './registries/themes.js'
export { createThemeRegistry } from './registries/themes.js'
export type { SemverVersion } from './semver.js'
export { compareVersions, parseVersion, satisfiesRange } from './semver.js'
export type { SigningKeyPair } from './signing/keys.js'
export { exportPrivateKey, exportPublicKey, generateSigningKeyPair } from './signing/keys.js'
export {
  canonicalizeContent,
  canonicalizeManifest,
  signContent,
  signManifest,
} from './signing/sign.js'
export {
  readSignatureFile,
  TRUSTED_REGISTRY_PUBLIC_KEYS,
  verifyContentAgainstTrustedKeys,
  verifyContentSignature,
  verifyManifestSignature,
  verifyPluginSignature,
} from './signing/verify.js'
