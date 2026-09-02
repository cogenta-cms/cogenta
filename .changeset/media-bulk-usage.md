---
"@cogenta/api": minor
---

Added `POST /api/media/-/bulk-usage`, a new route that reports content usage for
several media assets at once (one `MediaUsageReport` per id, reusing the same bounded
scan `GET /api/media/{id}/usage` already runs). Lets the admin warn before a bulk
delete orphans a real reference, without blocking the delete itself.
