---
'create-cogenta': patch
---

A scaffolded blueprint no longer ends its home page (or any template page) with a
"Post comment" form: the `page` collection every blueprint builds through
`definePageCollection` is opted out of comments at the collection level — the same switch
the admin's Discussion screen exposes — while posts, articles and every other collection
keep the site-wide `discussion.enabled` default.
