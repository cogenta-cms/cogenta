---
"@cogenta/agents": patch
---

Fixes every provider call that declares a tool. Contract C tool names carry a dot (`content.read`), and OpenAI-compatible endpoints (OpenAI, DeepSeek, Qwen, OpenRouter…) as well as Anthropic refuse that character in a function name — DeepSeek answered every agent run with `400 Invalid 'tools[0].function.name'` before any model was reached. The adapters now encode tool names on the way out (`content__read`) and decode them on the way back, so no other layer sees a wire name; two tools that would collide once encoded are refused loudly. A provider's own error message is now quoted in `PROVIDER_REQUEST_FAILED` instead of a bare status code.

The "Cogenta Agent" seed gains the read-only `content.collections`/`content.list` pair (same permission as `content.read`), and `ensureBuiltinAgents` grants that pair to an already-seeded built-in that holds `content.read` — without them the superagent could only read an entry whose id it already knew, and was seen guessing ids to count a site's posts.
