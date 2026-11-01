---
"@cogenta/api": patch
---

A password-protected entry no longer hands its content to anyone who asks the API. REST (direct read, list, URL lookup, expanded relations, history, translations) and GraphQL (direct, list and batched relation reads) now return only its listable metadata — title, slug and route fields, system fields — and no other value or block, for any actor who may not edit the collection and has not proved the password for that entry; a filter can no longer confirm a guess about a hidden field. A private published entry reached through a REST relation is now treated as absent in every state, as a direct read already did. `AccessContext` gains an optional `unlocked(entryId)` predicate for a host that has itself verified an unlock proof.
