---
"@cogenta/core": patch
---

Postgres: two replicas (or two tests) creating the same table at the same instant no longer fail on "type … already exists". The losing `create … if not exists` now succeeds, since the object it asked for exists (#52).
