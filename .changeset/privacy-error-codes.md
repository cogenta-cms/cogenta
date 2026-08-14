---
'@cogenta/core': minor
---

Add one error code for L4's privacy layer: `PRIVACY_NO_DATA_LEAVES_VIOLATION`
(a run configured with `privacyPolicy.enabled: true` tried to call a
provider outside its declared local allowlist).
