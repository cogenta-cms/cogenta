---
'@cogenta/cli': minor
---

Journal the four writes that reshape a site: menus, widgets, redirects, theme.

Settings, media, API keys, role permissions and the admin template each had
their own audit recorder. These four had none, so an administrator opening the
Audit screen to answer "who changed the navigation?" — or who added a
redirect, moved a widget, switched the site's theme — found nothing at all.

`recordSiteShapeAudit` sits where every other recorder does, in the host
rather than the routers: it reads the response a router already produced, so
no router gains an audit dependency. One recorder for the four rather than
four near-copies, because unlike the others they have nothing route-specific
to read back — the action and the path are the whole entry.

Same restraint as the recorders it joins: a `GET` writes nothing, a refused
write writes nothing, and a failed journal write is logged without undoing the
change it was describing.

New audit actions: `menu.write`, `widget.write`, `redirect.write`,
`theme.write`.
