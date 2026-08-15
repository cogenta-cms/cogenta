---
'@cogenta/cli': minor
---

Add `GET /api/schema` and wire the admin's collection list to it — L2 task 4, "rôles et
affichage conditionnel selon permissions".

`cogenta serve` computes the schema document once at startup (collections do not change
while the process runs) and serves it read-only, unauthenticated: it describes shapes and
which role names an action needs, never content. `@cogenta/admin` fetches it once per
session through a new `SchemaProvider`, and a small `canPerform`/`readableCollections`
pair — independently re-implemented rather than imported from `@cogenta/api`, which pulls
in the database and GraphQL layers that do not belong in a browser bundle — decides what
to show. The collections page lists only what the signed-in actor may read; the rest are
not merely disabled, they are absent, matching the acceptance criterion that a hidden
action is also refused by the API rather than just hidden by convention.
