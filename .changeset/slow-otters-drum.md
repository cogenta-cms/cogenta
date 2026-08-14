---
'@cogenta/admin': minor
---

Add a per-collection list view (L2 task 6): filters, sort, cursor pagination and a bulk
delete action.

`GET /api/content/{collection}` and `DELETE /api/content/{collection}/{id}` get a small
client mirroring the wire shape `packages/api/src/content/serialise.ts` actually returns
(system fields at the top level, declared fields under `values`) — copied by hand for the
same reason `schema/types.ts` copies the schema document shape: this is a browser bundle,
that package is Node code. `api/client.ts` and the new `content-client.ts` now share one
small `http.ts` (base URL, `ApiError`, the authenticated-fetch helper) instead of each
reimplementing it.

Column sort (id/createdAt/updatedAt, the three the API can order by), a status filter,
and the bulk-delete button are all gated by the same `canPerform` check the collections
list already uses — a role that cannot delete never sees the checkboxes or the button,
matching the acceptance criterion that a hidden action is also refused by the API.
Requesting an unknown collection, or one the actor cannot read, reports "not found"
rather than confirming it exists.

Also fixes a real test-infrastructure bug the new navigation tests exposed:
`BrowserRouter` reads real `window.history`, which persists across tests in the same
file under `jsdom` — a test that navigated left the next test's `<App />` mounting
wherever it had ended up. `test/setup.ts` now resets the URL after every test.
