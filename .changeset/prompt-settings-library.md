---
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/core": minor
---

Fiche 45 — Prompt Settings, a shared, editable library for every utility prompt an `assist.*` tool sends the model. Until now, each instruction line (`assist.rewrite`, `assist.proofread`, `assist.summarise`, `assist.translate`, `assist.meta_description`, `assist.titles`, `assist.tags`, `assist.alt_text`, `assist.classify`, `assist.moderate`, `assist.faq_draft`, `assist.schema_org_draft`, `assist.chat`) was a literal string baked into the package.

`@cogenta/agents` gains a new `prompts/` module: `PromptTemplateStore` (`createFilePromptTemplateStore` — one JSON file per template, same "real but local" tier as the existing agent/skill/provider stores, R1), `renderPromptTemplate`/`resolveInstruction` (`{{field}}` placeholder substitution that throws `PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED` rather than sending a literal unresolved placeholder to the model), and `builtinPromptTemplateSeeds`/`ensureBuiltinPromptTemplates` (thirteen templates reproducing every existing `assist.*` instruction verbatim as editable text, plus two new ones — `generate_text_block` for the future page-builder "Générer" button and `generate_agent_system_prompt` for the future agent-creation flow — written with the same care as a built-in agent's `identity.md`).

Every migrated `assist.*` tool constructor now accepts an optional trailing `PromptTemplateStore` argument (`createWritingTools`, `createClassifyTool`, `createModerateTool`, `createFaqTool`, `createSchemaOrgTool`, `createContentChatTool`'s options). Backward compatible: omitting it (or a site whose store has never been seeded) reproduces the exact pre-existing hard-coded instruction, byte for byte — proven by a dedicated non-regression test comparing the seeded-store path against the original inline construction for every migrated tool. A tool's `role`/objectives and the R8 anti-injection rule stay in code, deliberately not migrated — they are the security boundary, not the prompt text an editor should be able to reword from a settings screen.

`@cogenta/api` gains `createPromptTemplatesRouter` (`/api/prompt-templates`) — `GET` open to any signed-in actor, `POST`/`PATCH`/`DELETE` restricted to `admin`, mirroring `agent-skills-router.ts`'s shape. New `ErrorCode`s (`@cogenta/core`): `PROMPT_TEMPLATE_UNKNOWN` (404), `PROMPT_TEMPLATE_DUPLICATE` (409), `PROMPT_TEMPLATE_BUILTIN_UNDELETABLE` (409), `PROMPT_TEMPLATE_INVALID` (400), `PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED` (400).

`@cogenta/cli`'s `cogenta serve` now builds a `PromptTemplateStore` under `.cogenta/agents-runtime/prompt-templates` (seeded on first boot, idempotent) and threads it through both `buildAssistant` (so the writing-assistant tools resolve their instruction text from it) and `buildAgentRuntime` (which mounts `/api/prompt-templates`) — the same directory, two file-store instances, safe because neither caches across calls.

The admin's "Prompt Settings" screen (`packages/admin`, private, no changeset) is a new admin-only entry in the AI nav group: list/create/edit/delete a template, with a builtin always editable but never removable.
