---
'@cogenta/core': minor
---

Add the S3 storage driver as the optimal tier, verified against MinIO.

The AWS SDK is an optional peer loaded through a dynamic import: a site storing media on
disk installs none of it, and the published type declarations do not reference it. A
buffer goes through `PutObject`; a stream goes through multipart `Upload`, so a large
video is never buffered in memory to be stored.

`forcePathStyle` is set whenever a custom endpoint is configured. MinIO, R2 and most
self-hosted gateways serve buckets as a path rather than a subdomain, and assuming
virtual-host style breaks all of them with what looks like a DNS error.

The contract suite also caught a parity break: an object stored with no declared content
type reads back as `application/octet-stream` from S3 but was `undefined` from the local
driver, which would have made the two impossible to substitute when serving media. Both
now return the HTTP default.
