import { verifyContentSignature } from '@cogenta/plugins'
import {
  FLEET_COMMAND_ACTIONS,
  type FleetCommand,
  type FleetCommandAction,
  type SignedFleetCommand,
} from '../control/commands.js'

export type FleetCommandVerification =
  | { readonly ok: true; readonly command: FleetCommand }
  | { readonly ok: false; readonly reason: 'action_not_whitelisted' | 'invalid_signature' }

function isWhitelistedAction(action: string): action is FleetCommandAction {
  return (FLEET_COMMAND_ACTIONS as readonly string[]).includes(action)
}

/**
 * The real security boundary "## Appairage" describes: "exécutables
 * uniquement dans une liste blanche d'actions." Whitelist checked first — a
 * command naming an action outside `FLEET_COMMAND_ACTIONS` is refused before
 * its signature is even inspected, since signature validity alone must never
 * be sufficient to authorize an action this site doesn't recognise at all.
 * Verifies against the CONTROL PLANE'S public key (`../control/identity.js`,
 * learned once at pairing — `../enrollment/store.js`'s
 * `PairingToken.controlPlanePublicKey`), the reverse direction from
 * `../agent/sign.js`'s telemetry signing, which uses the site's own key.
 */
export function verifyFleetCommand(
  signed: SignedFleetCommand,
  controlPlanePublicKeyBase64: string,
): FleetCommandVerification {
  if (!isWhitelistedAction(signed.command.action)) {
    return { ok: false, reason: 'action_not_whitelisted' }
  }
  const valid = verifyContentSignature(
    signed.command,
    signed.signatureBase64,
    controlPlanePublicKeyBase64,
  )
  if (!valid) return { ok: false, reason: 'invalid_signature' }
  return { ok: true, command: signed.command }
}

export type FleetCommandHandlers = {
  readonly [K in FleetCommandAction]?: (payload: unknown) => Promise<void>
}

export type FleetCommandDispatchResult =
  | { readonly ok: true; readonly executed: true }
  | {
      readonly ok: false
      readonly reason: 'action_not_whitelisted' | 'invalid_signature' | 'no_handler_registered'
    }

/**
 * Verifies, then — and only then — looks up a real handler for the
 * command's action. A rejected command never reaches a handler: this is the
 * one real call site a site deployment should ever use to act on a fleet
 * command, so "verify, then dispatch" is not something a caller can
 * accidentally skip by calling a handler directly.
 */
export async function dispatchFleetCommand(
  signed: SignedFleetCommand,
  controlPlanePublicKeyBase64: string,
  handlers: FleetCommandHandlers,
): Promise<FleetCommandDispatchResult> {
  const verification = verifyFleetCommand(signed, controlPlanePublicKeyBase64)
  if (!verification.ok) return verification

  const handler = handlers[verification.command.action]
  if (handler === undefined) return { ok: false, reason: 'no_handler_registered' }

  await handler(verification.command.payload)
  return { ok: true, executed: true }
}
