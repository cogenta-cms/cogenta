---
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': patch
---

A private entry is invisible everywhere it is read, not only on its page

The per-entry gate that already decided who may see a draft now also decides
who may see a restricted published entry, composed once in
`@cogenta/api`'s content layer and reached by both transports: by id, in a
list, through a batched relation, and in GraphQL. Filtering the rendered page
and leaving the row in the API would have been a rendering preference, not
privacy.

A password-protected entry is deliberately *not* filtered: it exists, it is
listed and it can be linked to — what the password gates is its content.

Two places that read content for a crawler or a searcher exclude both:
`/sitemap.xml` skips a protected entry (nobody following that URL can read
it), and `withSearchIndexing` removes an entry from the index the moment it
stops being public — an excerpt in a result list is content. Changing
visibility reindexes, which the test that asked found missing.
