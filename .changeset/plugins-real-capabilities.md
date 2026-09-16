---
"@cogenta/plugins": minor
"@cogenta/cli": minor
---

Capabilities a plugin can actually use (L31 step 3). Five more are implemented and wired into `cogenta serve` and `cogenta plugin run`: `schema.read` (the site's collections and fields), `content.write_draft` (creates or updates a draft and never publishes it — what a plugin writes stays invisible until a human publishes), `content.publish`, `content.delete` (to the trash, reversible since `schema@2.0`) and `media.read` (metadata, never bytes). The four content capabilities can now name the collection they apply to (`content.write_draft:article`), re-checked on every call the way `http.fetch` re-checks a hostname; the bare form still means every collection. `cogenta plugin grant` refuses a capability nothing implements rather than handing a plugin a method that does nothing, and `isCapabilityImplemented`/`IMPLEMENTED_CAPABILITY_NAMES` say which those are.
