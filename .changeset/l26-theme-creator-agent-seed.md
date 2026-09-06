---
'@cogenta/agents': minor
---

Seed "Cogenta Theme Creator" as a fifth built-in agent (`ensureBuiltinAgents`), enabled by default. It was built with a full identity and a registered tool (`theme.propose_theme`) but was never actually seeded into `AgentDeclarationStore` — the admin's Agents screen reads from that store, not from `@cogenta/agents-builtin`'s exports directly, so the agent was invisible there regardless of whether an LLM provider was configured. `sideEffects: false` on its only tool means enabling it by default can never do anything unprompted.
