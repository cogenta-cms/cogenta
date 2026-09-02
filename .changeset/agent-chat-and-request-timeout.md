---
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/cli": patch
---

A real, persisted conversation with an agent, and two robustness fixes found by using it live against DeepSeek.

**The conversation.** Two chat surfaces — the agent detail page and the floating widget — used to keep their own local transcript, so starting a conversation on one and reopening the other never "loaded" it: there was nothing server-side to load. `@cogenta/agents` gains `AgentConversationStore` (memory + file implementations, one per `(agentName, actorId)` thread) and `RunAgentOptions.history` (real prior turns threaded into the model call, not folded into the instruction text); `@cogenta/api`'s `agents-router.ts` gains `GET/DELETE /api/agents/:name/conversation` and `POST .../conversation/messages`; `@cogenta/cli` wires a file-backed store under `.cogenta/agents-runtime/conversations`. Both admin chat surfaces now read and write through the same thread.

**Found while testing it for real:**
- A content-generation reply came back empty (`stopReason: 'max_tokens'`) — the default per-call budget (2000 tokens) was tuned for a short reply, not a real draft with a rich-text body. Raised to 8000 (6000 for a sub-agent hop).
- A stalled DeepSeek response left the request — and the browser tab awaiting it — hanging for minutes with nothing logged and no way to recover short of killing the process. None of the three provider adapters (OpenAI-compatible, Anthropic, Google) ever bounded a call on their own. Each now falls back to a 180s timeout when the caller supplies no cancellation signal of its own, and reports a named "did not answer in time" error rather than hanging forever.

Also: the `content.schema` tool (introspects a collection's field shape and the block vocabulary — closes the gap where the superagent could only guess field names when asked to draft content) is now visible in the admin's own permission checkboxes, and the superagent detail page opens straight on the chat, with every configuration field moved behind a "Réglages" button, and the technical log truncated with a "show all" toggle.
