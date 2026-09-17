---
'@cogenta/agents': patch
'@cogenta/api': minor
'@cogenta/cli': minor
---

The writing assistant, the site planner and image generation follow the providers saved in
the admin

They read `config.llm` only, so a site whose keys were saved from `/admin/providers` — the
path the admin itself offers — had a superagent that answered and an assistant that said
"no AI provider configured". All three now resolve their provider from the admin's
encrypted provider store first, choosing by the superagent's own declared preference,
falling back to any enabled provider and then to `config.llm`, **read on every call**: a
key saved, changed or disabled takes effect on the next request, with no restart. The
assistant route asks for the current toolset per request rather than the one built at
boot, and `/api/site-plans` reports whether planning is available the same way.

Also fixed: a site seeded before the agent-identity prompt was rewritten kept the old
builtin template, whose `{{purpose}}` placeholder the tool no longer supplies — so
"generate an identity" failed on every such site. A builtin template whose text is exactly
one a previous version shipped is refreshed; one anybody edited is left alone.
