---
'@cogenta/api': minor
'@cogenta/cli': minor
---

**Breaking: `DELETE /api/content/{collection}/{id}` now means "move to the
trash"**, not "destroy" (`schema@2.0`, ADR-0022). Two routes complete it:

- `POST /{collection}/{id}/untrash` — take it back out;
- `POST /{collection}/{id}/purge` — destroy it for good.

Purge is a POST on its own path rather than a second meaning for `DELETE`,
because two verbs on one path with two very different consequences is how
someone destroys content by reflex. A client that used `DELETE` to really
remove an entry must now follow it with `/purge`.

`?trashed=include|only` on a list opens the trash; without it a pre-2.0 client
sees exactly what it saw before. All four operations — including *seeing* the
trash — require the `delete` permission on the collection: contract A freezes
the five actions, so the trash borrows the one that fills it.

Serialised entries gain `deletedAt`, orthogonal to `status`: an entry in the
trash still reports the status it had, which is what restoring gives back.

### Taxonomy terms over HTTP

`createTaxonomyRouter` mounts `/api/taxonomies`:

```
GET    /{taxonomy}            the tree, in tree order
POST   /{taxonomy}            create a term
GET    /{taxonomy}/{id}       one term
PATCH  /{taxonomy}/{id}       rename, relabel, reorder
DELETE /{taxonomy}/{id}       delete (?cascade=true for the whole branch)
POST   /{taxonomy}/{id}/move  re-parent it
```

Mounted apart from `/api/content` because a taxonomy is not a collection and a
site may legitimately name both the same thing. The materialised path is
deliberately **not** serialised — it is a storage decision, and `parent` plus
`depth` are what a tree renderer needs.

`PermissionLayer` gains `canTerm`/`assertTerm` rather than a widened `can`:
same role rules, no preview path. A preview token names a collection and an
entry, so with a `category` collection beside a `category` taxonomy, sharing
the code path would let a token minted for one unlock the other. Custom
`PermissionLayer` implementations must add the two methods.

### In `cogenta serve`

A project declares its taxonomies as a named `taxonomies` export beside the
default one in `cogenta.schema.*`; a schema file written before 2.0 keeps
loading unchanged and declares none. The server creates the terms tables before
the collections, mounts `/api/taxonomies`, and passes `siblings` to every
content store so `restrict` is still enforced when an entry is trashed.
