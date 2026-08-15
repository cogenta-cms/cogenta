---
'@cogenta/seo': minor
---

`isPublished` no longer refuses an entry whose `publishedAt` is `null`.

`publishedAt` is an ordinary contract A field, not a system column:
`ContentStore` returns `null` for it on every entry of every collection
that does not declare one — which is most of them, including all nine
`create-cogenta` blueprints. Treating that as "not published" made the
whole package refuse the site it was pointed at: every rendered page got
`<meta name="robots" content="noindex, nofollow">`, no canonical, no
`hreflang`, and `sitemap.xml` came back as an empty `<urlset/>`.

`status` remains the authority on whether an entry is public and `state`
on which face is being read — both are still required. A `publishedAt`
that exists and is in the future still blocks, so scheduled publication
is unaffected, and a collection with no such field cannot have scheduled
anything in the first place.

Found the first time the package ran against a real `cogenta serve`
(L10 task 1) rather than against values; every existing fixture set a
date by hand, so no unit test could have caught it.
