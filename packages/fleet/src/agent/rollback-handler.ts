import { CogentaError } from '@cogenta/core'
import type { InventoryComponentKind } from '../inventory/drift.js'

/**
 * The real shape of a `rollback` command's payload, per
 * `../rollout/rollback.js`'s `triggerRollback` — validated here rather than
 * trusted, since a command's `payload` field is `unknown` at the type level
 * until a handler actually inspects it (`../agent/commands.js`'s
 * `FleetCommandHandlers`).
 */
export interface RollbackIntent {
  readonly componentKind: InventoryComponentKind
  readonly componentName: string
  readonly targetVersion: string
}

const COMPONENT_KINDS: readonly InventoryComponentKind[] = ['cms', 'plugin', 'theme']

function parseRollbackPayload(payload: unknown): RollbackIntent {
  if (payload === null || typeof payload !== 'object') {
    throw new CogentaError({
      code: 'FLEET_ROLLBACK_NO_PRIOR_VERSION',
      message: 'Rollback command payload is not an object.',
      hint: 'This indicates a control-plane bug — triggerRollback always sends a real object payload.',
      details: { payload },
    })
  }
  const record = payload as Record<string, unknown>
  const { componentKind, componentName, targetVersion } = record
  if (
    typeof componentKind !== 'string' ||
    !COMPONENT_KINDS.includes(componentKind as InventoryComponentKind) ||
    typeof componentName !== 'string' ||
    componentName.trim() === '' ||
    typeof targetVersion !== 'string' ||
    targetVersion.trim() === ''
  ) {
    throw new CogentaError({
      code: 'FLEET_ROLLBACK_NO_PRIOR_VERSION',
      message: 'Rollback command payload is missing or has malformed fields.',
      hint: 'Expected { componentKind: "cms"|"plugin"|"theme", componentName: string, targetVersion: string }.',
      details: { payload },
    })
  }
  return {
    componentKind: componentKind as InventoryComponentKind,
    componentName,
    targetVersion,
  }
}

/**
 * The real, honest scope of this task's site-side rollback handling:
 * validate the intent a signed, whitelisted `rollback` command carries, then
 * hand it to a caller-supplied callback — never a claim that this package
 * itself reverts installed code. No mechanism exists anywhere in this
 * codebase today to revert a site's installed plugin/theme/CMS code to a
 * prior version (no package-manager integration, no `@cogenta/plugins`
 * uninstall/downgrade path) — that is a real, documented gap, not something
 * papered over with a handler that pretends to act. `recordIntent` is where
 * a real deployment wires whatever it actually has (an operator alert, a
 * queued manual task, or — once real reversion infrastructure exists — the
 * genuine mechanism) without this package inventing one it cannot back.
 */
export function createRollbackIntentHandler(
  recordIntent: (intent: RollbackIntent) => Promise<void>,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const intent = parseRollbackPayload(payload)
    await recordIntent(intent)
  }
}
