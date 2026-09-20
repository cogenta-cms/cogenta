---
'@cogenta/starters': minor
---

Give every shipped blueprint drafts and version history.

Of the twenty-five publishable collections the nine blueprints ship, exactly
one declared `versioning` — `blog`'s `post`. The other twenty-four had
neither half, and both halves live in that one object, so a single omission
produced two separate failures on every other site:

- **No drafts.** Every save of a published entry went straight to the public
  page. There was no such thing as an unpublished edit: opening a live
  article, fixing a sentence and pressing save published it, with nothing to
  review and no way back but another edit.
- **No history.** The store keeps a bare minimum of two versions without it,
  so the admin's History tab — which is shown on every saved entry, of every
  collection — could hold at most two, and restoring an older one evicted it.

Both stay opt-in in the contract, deliberately: unlimited history is a slow
leak, and a collection that genuinely wants neither should be able to say so.
What was not deliberate is twenty-four shipped collections silently not
asking.

A test now walks every blueprint and fails on a publishable collection
missing either half, the same guard the `publish` permission got.

Verified against a freshly scaffolded magazine site: editing a published
article left the public page untouched until `publish`, which then showed the
edit; six versions were kept across six writes where two would have been.
