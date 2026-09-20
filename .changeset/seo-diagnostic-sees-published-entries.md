---
'@cogenta/seo': minor
'@cogenta/api': patch
---

Make the SEO diagnostic see the entries a site has actually published.

It reported zero published entries beside a sitemap of fifteen URLs, in the
same response. Worse than the number: every content check is computed over
that same set, so missing descriptions, over-long titles and duplicate titles
all reported zero whatever the site contained. The whole content-quality panel
was inert, not just its counter.

The scan lists as the signed-in admin, deliberately, so it can see collections
the public role cannot. The gateway derives the face an actor reads from the
permission layer — there is no `state:` argument to ask for the published one,
and that invariant is worth more than this diagnostic. So every entry carrying
an unpublished edit arrives in its working face, and `isPublished` refuses that
face: rightly, since its job is deciding whether *this face* may be rendered
into a page, a feed or a sitemap.

`@cogenta/seo` gains `isPublishedEntry`, the same question without the face
check — for a caller that knows which face it holds and is asking about the
entry behind it. Both predicates share the `publishedAt` scheduling check, so a
scheduled entry still counts as unpublished in either.

Measured against a running site: fifteen published entries against fifteen
sitemap URLs, and five entries missing a description that the panel had never
been able to name.
