---
'@cogenta/api': minor
'@cogenta/cli': minor
---

Document-driven site planning on a site that is already running (L19 tasks 5
and 7). `@cogenta/api` gains `createSitePlanRouter` and `cogenta serve` mounts
it at `/api/site-plans`; the admin gets a screen on top of it.

Upload a brief, read what the agent understood, and decide on it one item at a
time — every collection, page, demonstration entry and constraint read out of
the document is its own yes or no. The API has no `acceptAll` parameter and the
screen has no control that decides more than one item; `apply` calls
`resolveApprovedPlan`, which refuses a plan with an undecided item, so there is
no path that skips the review even for a caller writing raw HTTP.

Applying is **additive**. A proposed collection whose name the site already
uses is refused and reported — replacing a live collection is a migration with
a diff and a backup, not a side effect of accepting a suggestion. What is
applied writes the schema file, creates the new tables and seeds approved
demonstration entries as drafts, never published. The report says plainly that
`cogenta serve` has to be restarted to see the new collections, rather than
implying the change is already live. A plan is applied at most once.

Every route is admin-only. On a site with no LLM provider the routes that need
a model answer `SITE_PLAN_NO_PROVIDER` (501) with a hint, and the list route
reports `plannerAvailable: false` so the screen can explain itself — a plan
proposed during installation is still readable and appliable there, which is
what makes the installer's "save it for later" path mean something (R2).
