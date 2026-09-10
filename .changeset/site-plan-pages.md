---
'@cogenta/api': minor
'@cogenta/cli': minor
---

**Approving a page in a site plan now creates one.**

It did not. `proposeSitePlan` proposed standing pages, the review screen asked
a human to accept them one by one, and the applier never read
`approved.pages` — so every accepted page was dropped, and the operator was
shown a success report. That is the worst shape a gap can take: from the
outside it is indistinguishable from having worked.

Each approved page is now created as a real draft entry, carrying its title,
its slug and its purpose, marked `provenance: 'generated'` like every other
thing a model wrote. The target collection is read from the site's own
schema — one named `page` with a title, or any routed collection with a title
and a slug — and only fields that collection actually declares are written,
so a page can never fail the whole apply over a shape the plan guessed at.

When no collection can hold a page, or one entry is refused by contract A,
`AppliedPlanReport` says so page by page (`pagesCreated`, `pagesSkipped`)
instead of dropping it quietly, and the review screen prints both.
