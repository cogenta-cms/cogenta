---
"@cogenta/agents": minor
"@cogenta/cli": patch
---

An agent whose preferred and fallback providers are both missing now runs on any configured provider, with that provider's default model. Every built-in agent prefers Anthropic then OpenAI, so a site set up with only DeepSeek, Mistral or a local model ran none of them, while its assistant already used whatever was configured. `createProviderRegistry` gains `names()`.
