---
'create-cogenta': minor
---

`create-cogenta` — the final four blueprints (L9 task 8, batch B of two —
task 8 is now fully complete):

- **`magazine`**: `article` (title/excerpt/section/body, routed at
  `/articles/:slug`) grouped by a `section` select field rather than a
  second category collection; `home` (hero + a live list of recent
  articles) and `about` (prose).
- **`association`** (nonprofit): `event` (title/date/location/description,
  routed at `/events/:slug`); `home` (hero + mission prose + a live
  upcoming-events list + a donate `cta`) and `mission` (prose + a static
  `stats` impact summary).
- **`restaurant`**: `menu_item` (name/description/price/category, routed at
  `/menu/:slug` so the home page's live menu list can link to each item,
  even though nothing else deep-links to one yet); `home` (hero + a live
  menu highlights list) and `contact` (prose with hours and location as
  plain text — no dedicated field kind exists or is warranted for two
  lines).
- **`saas`**: `feature` (name/description, routed at `/features/:slug`);
  `home` (hero + a live features grid + a signup `cta`) and `pricing`
  (prose + a static `stats` row). Deliberately no `pricingPlan` collection:
  page-authored pricing numbers have no independent lifecycle worth a
  second collection.

All four reuse the `BlueprintContentPack` extension point and the shared
`definePageCollection` helper, exactly like batch A. `resolveBlueprint` now
resolves every blueprint named in the lot doc as available — `blank` is the
only one left without a content pack, by design.
