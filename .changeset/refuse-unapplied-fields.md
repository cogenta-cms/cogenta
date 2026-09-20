---
'@cogenta/api': minor
---

Refuse a request field a route will never apply, instead of dropping it.

Three routes accepted a field, answered `200`/`201`, and ignored it:
`POST /api/users` with `password` (the response carried a *different*,
generated one, so signing in with the chosen password failed) or
`displayName`; `PATCH /api/menus/{id}/items/{itemId}` with `parent`;
`PATCH /api/widgets/{id}` with `area`.

Not applying them is deliberate in each case, and documented beside the code:
an admin does not set somebody else's password, re-parenting rewrites a whole
subtree's materialised path and must not ride along with a label edit, and
moving a widget needs a position. What was wrong was doing it silently.

**These requests now fail** where they used to succeed and quietly do less
than the caller believed, naming the route that performs the action.

`POST /api/widgets` and `POST /api/widgets/{id}/move` also refuse an area the
active theme does not declare — the widget was created invisible, renderable
by no theme and listed in no column.
