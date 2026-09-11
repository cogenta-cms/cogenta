---
'@cogenta/core': minor
'@cogenta/agents': patch
'@cogenta/api': patch
---

**A media file now records who or what made it.**

Contract A made `provenance` non-optional on a content entry because the
European AI framework requires it — and then the media library, where the
pictures live, had no such field at all. A generated illustration was
indistinguishable from a photograph the site owner took, which is exactly the
claim nobody is allowed to make by accident. It is the prerequisite for
letting an agent produce images at all.

`MediaAsset` gains `provenance` (`human` | `assisted` | `generated`, the same
vocabulary contract A uses) and `provenanceDetail` — which agent, which model,
when. `CreateMediaInput` defaults to `human`, so every existing caller keeps
its exact meaning.

The columns are added in place, with the same try-not-check pattern the tags,
content-hash and folder columns already use, and **without a backfill**: a
null reads as `human`, which is the true answer for a library uploaded by
people, not a guess. `media.read` reports both, so an agent browsing the
library can tell a photograph from something a model produced.
