---
"@cogenta/core": patch
---

The SSRF guard moves into core (`src/http/ssrf.ts`): `isPrivateAddress` (byte-based IPv4/IPv6 classifier), `resolvePublicTarget`, `assertPublicUrl`, `createPinnedFetch` (connects to the validated address only, keeping the host name for `Host`, SNI and certificate checks) and `fetchPublicOnce`. Adds the error code `HTTP_TARGET_UNSAFE`.
