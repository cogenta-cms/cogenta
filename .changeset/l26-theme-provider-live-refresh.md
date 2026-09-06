---
'@cogenta/agents': minor
'@cogenta/agents-builtin': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Fix the Appearance screen (and `theme.propose_theme`) reporting "no LLM provider configured" even after one is set up — two compounding bugs, both real:

1. `theme-wiring.ts` resolved a provider **once**, at `cogenta serve` boot, and captured it — a provider registered afterwards through `/admin/providers` never took effect for the rest of that process's life, unlike every other agent's client (which is refreshed live). `resolveThemeProvider` is now called fresh on every request; `SkinGeneratorLike` gains `isAvailable()` so `GET /api/theme`'s `aiAvailable` reflects the live state instead of a snapshot.
2. Provider *choice* was a hardcoded `{preferred: 'anthropic', fallback: 'openai'}` guess, duplicating — and never actually reading — the "Cogenta Theme Creator" agent's own admin-configurable `model.preferred`/`model.fallback`. An admin who repointed that agent at a different provider from its own settings screen saw the theme generator keep ignoring the choice. The theme generator and `theme.propose_theme` now both read that agent's live declaration (`THEME_CREATOR_AGENT_NAME`, newly exported from `@cogenta/agents`), falling back to the old hardcoded pair only when no agent record exists (a bare `Site` built by hand, tests included).

`ProposeThemeToolOptions.resolveProvider` replaces the old fixed `client`/`model` fields for the same reason — resolved on every `execute()`, not once at tool-registration time.
