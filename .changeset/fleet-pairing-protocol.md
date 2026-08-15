---
'@cogenta/fleet': minor
---

New package `@cogenta/fleet` — the multi-site fleet control plane (L8). This
first task builds the pairing protocol: a real, single-use, time-limited
enrollment token (`issuePairingToken`/`consumePairingToken`,
`packages/fleet/src/enrollment/`), a real site registration recording the
site's own Ed25519 public key at consumption time, and revocation.

- Pairing tokens follow `@cogenta/auth`'s session-token shape (32 random
  bytes, base64url, stored SHA-256-hashed, never in the clear) rather than
  `@cogenta/channels`' shorter human-typed linking codes — a pairing token
  is copy-pasted into a site's own configuration, never hand-typed.
- Reuses `@cogenta/plugins`'s real, already-tested Ed25519 primitives
  (`generateSigningKeyPair`/`signContent`/`verifyContentSignature`) as a
  new workspace dependency, rather than a second signing implementation —
  a real end-to-end test proves a signature made with a site's private key
  verifies against exactly the public key its pairing recorded, and fails
  against a different key or tampered content.
- Consuming an already-used token, an unknown token, or an expired token
  each fail with a distinct, discriminated reason
  (`'already_used' | 'invalid' | 'expired'`) rather than a raw exception —
  the literal "rejeu de jeton d'appairage" security test this task's own
  acceptance criteria name.
- Revocation is real and immediately checkable (`revokeSite`/`isRevoked`) —
  the primitive later tasks (a site's periodic contact loop, signed
  command retrieval) will refuse against.

Not built in this task, deliberately: the site-side contact/polling loop,
telemetry emission, and command retrieval — later tasks in this lot own
those; this task is the pairing/key/revocation data layer they call.
