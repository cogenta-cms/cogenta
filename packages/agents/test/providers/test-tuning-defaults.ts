import type { ProviderTuningDefaults } from '../../src/providers/defaults.js'

/** Fixed values for the `defaults` every client config now requires — never asserted on, just present. */
export const TEST_TUNING_DEFAULTS: ProviderTuningDefaults = {
  maxOutputTokens: 8000,
  requestTimeoutMs: 180_000,
  maxCorrectionAttempts: 3,
}
