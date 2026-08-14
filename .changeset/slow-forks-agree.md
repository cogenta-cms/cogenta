---
'@cogenta/admin': minor
---

Add the schema-driven edit form (L2 task 7): one route for both creating and editing an
entry, generated entirely from `schema.json`'s field list — adding a field to a
collection needs no admin change at all, which is the lot's own acceptance criterion.

`content-client.ts` gains `getEntry`/`createEntry`/`updateEntry`. Both routes read
`state=working`: editing means seeing the draft face of an entry, not just the published
one. A role that can `read` but not `create`/`update` sees the same form with every field
disabled and no save button, rather than a different page — what changes is what the
actor may do with what they see, not what they see.

The "Nouveau" link on the collection list and the edit route itself are both gated by
`canPerform`, same as the list's sort, filter and delete already are: creating a new
entry lands on `/collections/:name/new`, saving it redirects to `/collections/:name/:id`
so the address bar reflects a real entry rather than staying on the transient "new" URL.
