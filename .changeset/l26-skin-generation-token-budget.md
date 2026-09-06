---
'@cogenta/agents': minor
---

Fix theme/skin generation failing with "No usable skin could be generated" (or "no candidate passed contract D validation") against a reasoning-tier model.

`generateSkin`'s completion budget (`MAX_TOKENS`) was 2000 — enough for the visible JSON answer alone, but a reasoning model (confirmed live against DeepSeek's `deepseek-v4-flash`) spends several thousand tokens "thinking" before ever writing it, and that hidden reasoning counts against the same budget. The call hit `finish_reason: "length"` with an **empty** response before reaching the answer, which `extractJson` reported as "the model did not return a JSON object" — indistinguishable from a real refusal. Raised to 8000, with real headroom rather than the observed minimum. Verified end-to-end against a live DeepSeek key: the exact request that previously produced zero usable candidates now reliably produces two to three.
