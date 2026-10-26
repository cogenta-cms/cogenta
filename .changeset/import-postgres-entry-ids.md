---
"@cogenta/import": patch
"@cogenta/cli": patch
---

Importing a WordPress export into a site of its own shape works on PostgreSQL: the WordPress post id (`1`, `42`…) was written as the entry id, which a `uuid` column refuses. It is now hashed into a stable UUID, so an interrupted import still resumes. Comment text stripped of WordPress markup is decoded in a single pass (no double unescaping), and a request's query string can no longer set an object prototype through `__proto__`.
