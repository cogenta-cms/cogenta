---
'@cogenta/cli': minor
---

The editor offers the blocks a plugin provides

`GET /api/plugins/blocks` reports what this site's plugins add to the block
list — name, label, fields, which plugin brings it, and what it degrades to.
Readable by anyone who may edit content rather than by administrators only:
without it, a plugin's block on the page being edited would have no label and
no fields.

The seventeen blocks of the vocabulary are baked into the admin bundle because
they never change; these depend on which plugins a site has installed, so only
the server can know them.
