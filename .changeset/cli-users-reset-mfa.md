---
"@cogenta/cli": patch
"@cogenta/auth": patch
---

New operator command `cogenta users reset-mfa --email <address> [--passkeys]`: deletes the account's authenticator, any pending enrolment and its recovery codes without reading them (so it works after `COGENTA_AUTH_SIGNING_KEY` was rotated and the stored secrets no longer decrypt), signs the account out, voids its sign-in tickets and writes a `user.mfa_reset` audit entry. Passkeys are kept unless `--passkeys` is given. `CredentialStore` gains `removeWebAuthnCredentials(userId)`.
