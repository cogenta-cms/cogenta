---
'@cogenta/agents-builtin': minor
---

Add the Content agent: `createContentDraftTool` forces `provenance:
generated|assisted` on every draft it writes — the input schema never
offers a `provenance` field for the model to set, and `execute`
overwrites anything smuggled into `values` under that key,
unconditionally, on every call. `checkTerminology` scans text against
the site's glossary for banned terms. `suggestTopicGaps` reuses the
hashing-trick `EmbeddingProvider` (`@cogenta/agents`, L4 task 14) to
find candidate topics unlike anything already published.
`contentAgent` declares only `content.read`/`content.write_draft`/
`media.read`/`agent.delegate` — no `content.publish`.
