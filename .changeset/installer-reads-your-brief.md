---
'create-cogenta': minor
---

`npm create cogenta` can read your specification document (L19 tasks 3, 6, 8).

An optional step now runs before the usual questions: point the installer at a
brief — PDF, DOCX, Markdown or plain text — and it proposes a content model,
a page list, two to five designs and demonstration content written for your
activity rather than for nobody's. You then walk it item by item: every
collection, every page, every demonstration entry and every constraint read
out of your document is its own yes or no. There is no "accept all", and there
cannot be: `resolveApprovedPlan` refuses a plan with an undecided item.

Only what you accepted is applied. Approved collections are written into
`cogenta.schema.mjs` and their tables created; approved demonstration entries
are seeded as **drafts**, never published, because a model wrote them about
your business and you have not read them yet. What the document rules out is
removed before you ever see it, with the sentence it came from quoted — a
brief that says "pas de blog" cannot produce a site with a blog, whatever the
model proposed.

The answers that follow are pre-filled from the brief — language, site type,
design description — and every one of them is a *default in a question*, shown
under a heading that says so.

`chooseSkin` now proposes several designs instead of one, each previewed on
three real pages in its own directory under `.cogenta/skin-preview/`, each
validated against contract D by the loop that was already there. A round that
cannot produce two distinct valid designs falls back rather than presenting a
choice of one.

Site types gained real defaults (task 8): a per-type page cache written into
`security.pageMaxAge`, whether to seed the type's demo content, and an HSTS
question that is recommended *off* everywhere because a wrong answer takes a
site offline for a year. Each is confirmed one at a time, with why it is
recommended printed above it. Nothing here is a placeholder — a setting that
wrote no config and created nothing would be a lie told in a friendly voice.

**Nothing changes for an install that declines all of this.** With no LLM
provider configured the document question is never even asked, `--yes` never
enters the step, and the site produced is byte-for-byte the one this installer
produced before (R2 — tested explicitly). A `--config` file may list
`documents`, but a config file cannot consent on your behalf: the plan is
analysed and saved as a draft under `.cogenta/site-plans/`, never applied.
