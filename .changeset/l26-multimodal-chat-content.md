---
'@cogenta/agents': minor
---

`ChatMessage.content` accepts an array of `ChatContentPart` (text/image) in addition to a plain `string` — additive, every existing caller passing a `string` keeps compiling and behaving byte-for-byte identically. `ProviderClient` gains an optional `supportsVision` flag. Implemented in the three real HTTP adapters (`anthropic.ts`, `openai.ts`, `google.ts`, each reporting `supportsVision: true`), which now translate an image part into that vendor's own multimodal wire shape (Anthropic base64 image block, OpenAI `image_url` data URL, Gemini `inlineData`). This is the foundation the upcoming Cogenta Theme Creator agent (L26) uses to hand a model screenshots/mockups a user uploaded alongside text, rather than just filenames.
