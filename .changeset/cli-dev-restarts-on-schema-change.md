---
"@cogenta/cli": minor
---

`cogenta dev` now restarts itself, in-process and on the same port, when `cogenta.schema.*` changes, so a schema written from the admin (a site plan, sample data) is served without a manual restart. A schema that no longer loads leaves the server down until the next save instead of exiting. `cogenta serve` is unchanged and never restarts implicitly.
