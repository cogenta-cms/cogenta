---
'@cogenta/cli': minor
---

Add `GET /api/health`, restricted to the `admin` role: the same database and
storage driver/tier/latency report `cogenta doctor` prints from a terminal,
now queryable from the running server. Backs the admin dashboard's site
health widget.
