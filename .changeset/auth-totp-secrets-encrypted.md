---
"@cogenta/auth": patch
"@cogenta/core": patch
---

TOTP secrets, active and pending, are no longer stored in clear text in `cogenta_credentials`: they are sealed with AES-256-GCM under a key derived (HKDF) from `COGENTA_AUTH_SIGNING_KEY`, bound to their account, in a versioned `enc:v1:` form. Legacy plaintext rows still read and are encrypted the next time they are read. A secret that cannot be decrypted (wrong or missing key) fails closed with the new `AUTH_CREDENTIAL_KEY_INVALID` code instead of reading as "no second factor"; `createCredentialStore` takes the key as `{ signingKey }` and refuses to store a TOTP secret without one. Rotating the signing key now also makes enrolled authenticators unreadable.
