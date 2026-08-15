---
'@cogenta/fleet': minor
---

`@cogenta/fleet` gains the control-plane-to-site command channel: "## Appairage"'s
"Les commandes du plan de contrôle vers un site sont récupérées par le site lors de
son prochain contact, signées, et exécutables uniquement dans une liste blanche
d'actions."

- **A closed action whitelist** (`FLEET_COMMAND_ACTIONS`: `update`, `rollback`) — named
  now, ahead of tasks 7/8's real execution logic, so this is the real, non-bypassable
  transport/verification layer those tasks plug handlers into, not a whitelist widened
  later under a design already shipped.
- **`createCommandQueueStore`**: real, persisted, strictly per-site command queue
  (`enqueue`/`fetchPending`) — fetching signs each pending command with the control
  plane's own real Ed25519 private key and marks it delivered, so a site's next fetch
  never re-sees it.
- **A real control-plane identity** (`ControlPlaneIdentity`, `packages/fleet/src/control/identity.ts`)
  — distinct from any site's own keypair. A site signs telemetry with ITS key
  (verified by the control plane); the control plane signs commands with ITS OWN key
  (verified by the site) — two independent keypairs, two independent verification
  directions, never the same key checked both ways. `EnrollmentStore.issuePairingToken`
  now hands the control plane's public key to a site at pairing time
  (`PairingToken.controlPlanePublicKey`), and `getControlPlanePublicKey()` exposes it
  directly.
- **`verifyFleetCommand`/`dispatchFleetCommand`** (site side): checks the whitelist
  FIRST — an action outside it is refused even with a perfectly valid signature, since
  signature validity alone must never be sufficient to authorize an action a site
  doesn't recognise. A rejected command never reaches a handler; a whitelisted,
  validly-signed command with no registered handler is refused too, never silently
  ignored.
- Scoping: this task verifies and dispatches; marking a command "delivered" happens on
  fetch (preventing infinite re-delivery), but "executed successfully" bookkeeping is
  left to the real update/rollback logic tasks 7/8 will build.
