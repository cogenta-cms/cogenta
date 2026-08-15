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
export { loadPlugin, PLUGIN_MANIFEST_FILE_NAMES } from './loader.js'
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
export { ensurePluginTables, PERMISSION_TABLES } from './permissions/tables.js'
export type { SemverVersion } from './semver.js'
export { compareVersions, parseVersion, satisfiesRange } from './semver.js'
