---
'@cogenta/agents': minor
---

Add `proposeThemeCandidates` (`src/theme-creator/`) — the Theme Creator agent's core logic: pick exactly one installed theme package from a free-text description and optional attachments (documents via `extractDocumentText`, images via a multimodal content block when the provider supports vision), then reuse `generateSkinCandidates` unchanged to fill contract D's skin tokens. Never applies anything. Attachment text travels through `assembleContext`'s `data` channel (R8); an image dropped for lack of vision support is never sent to the model and only ever produces a warning.
