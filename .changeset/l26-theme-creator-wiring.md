---
'@cogenta/cli': patch
---

`cogenta serve` swaps `POST /api/theme/generate`'s implementation to call `@cogenta/agents`' `proposeThemeCandidates` (theme choice + skin tokens) instead of `generateSkinCandidates` directly, threading through the new `attachments`/`baseline` fields. Registers the Theme Creator's `theme.propose_theme` tool (`@cogenta/agents-builtin`, new dependency) into the live agent tool registry whenever an LLM provider is configured — absent otherwise (R2).
