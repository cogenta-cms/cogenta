import { CogentaError } from '@cogenta/core'
import type { ProviderClient } from '../providers/types.js'
import type { NoDataLeavesPolicy } from './types.js'

/**
 * The enforcement point for "mode « rien ne sort »" — throws, rather than
 * degrading or warning, the moment a run would call a provider outside the
 * declared local allowlist. A privacy leak is not a condition to recover
 * from gracefully; it is a configuration error that must stop the run.
 */
export function assertProviderAllowed(client: ProviderClient, policy: NoDataLeavesPolicy): void {
  if (!policy.enabled) return
  if (policy.localProviderNames.includes(client.name)) return

  throw new CogentaError({
    code: 'PRIVACY_NO_DATA_LEAVES_VIOLATION',
    message: `"no data leaves" mode is active; "${client.name}" is not in the local provider allowlist.`,
    hint: 'Add the provider name to localProviderNames only if it genuinely never leaves this machine, or disable the policy for this run.',
    details: { provider: client.name, allowed: [...policy.localProviderNames] },
  })
}
