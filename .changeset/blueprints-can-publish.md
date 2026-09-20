---
'@cogenta/starters': minor
---

Let a site publish the content it was scaffolded with. Nothing could.

Every one of the nine blueprints shipped at least one collection that no role
could publish — and on all nine, one of them was `page`. A person who created
a page on a fresh Cogenta site got a status control offering only "Draft", no
publish button, and `403 — collection "page" grants "publish" to no role` from
the API. Nineteen collections in total: the shared `page` on all nine, plus
every collection of `vitrine` (solution, case study, testimonial, job, post),
`saas` (feature, changelog), `association` (event, programme) and
`documentation` (doc page).

`CollectionPermissions` is a `Partial<Record<ContentAction, …>>`, and an action
nobody declares normalises to `{ roles: [], own: false }` — nobody, admin
included. That is the right default for a permission system, and it is exactly
why the compiler was no help: omitting `publish` is a perfectly well-typed way
to ship a collection whose content can never go live. The six collections that
did work were right by vigilance, not by construction.

It stayed invisible because seeded demo content is written straight into the
store, bypassing the permission layer entirely: every demo site looked
complete, and only the first hand-written entry hit the wall.

`test/blueprint-permissions.test.ts` now walks every blueprint we ship and
fails on any collection missing any of the five actions, so forgetting one on
a new blueprint is a failing test rather than a site nobody can use. The
`vitrine` blueprint's permission constant is split in two along the way: it was
shared with a taxonomy, and `publish` has no meaning on a term — which is how
one omission spread across six collections.
