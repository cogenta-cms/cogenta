---
"@cogenta/channels": patch
---

The file email transport creates its directory with mode 0700 (and tightens an existing one) and writes each message with mode 0600, since a stored reset link or invitation is a credential.
