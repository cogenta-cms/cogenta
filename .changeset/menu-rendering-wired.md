---
"@cogenta/cli": minor
---

Navigation menus reach the public theme. `@cogenta/schema`'s menu store, `@cogenta/api`'s
`createMenuRouter` and the admin's `/menus` screen were complete and tested (see the
`menus-navigation` changeset), but nothing ever rendered one — the changeset that added
them named the exact gap and where to close it, and this closes it.

Convention (undeclared by contract A or D — navigation is not content, and `Base.astro`'s
real header/footer slots are not reachable from `cogenta serve`'s render pipeline, which
builds its own minimal frame): a menu named `main` renders in the header, one named
`footer` renders in the footer. Neither existing is unchanged behaviour — the same empty
slots as before this was wired.

Rendering is a flat list of links (the documented MVP): every item of the menu, in the
order the store returns them, regardless of `parent`/`depth`. The hierarchy the store
already carries is not thrown away — a real sub-menu render only needs a new
`renderMenuLinks`, not a data change — it is simply not built yet, for time.

The lookup itself is `GET /api/menus/by-name/{name}` called in-process through the exact
same `MenuRouter` `/api/menus/*` is mounted with (`RestRequest` in, `RestResponse` out) —
never a second lookup path, and never a real HTTP round trip to itself.
