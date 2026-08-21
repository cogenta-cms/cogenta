---
title: Technical documentation
order: 0
---

# Technical documentation

For whoever builds around Cogenta — a theme, a plugin, a headless
integration, or the core project itself. Written in English, matching this
project's own convention for developer-facing material
(`docs/getting-started.md`, `docs/guide-plugin.md`). If you administer a
site without developing anything, see the
[functional documentation](../functional/index.html) instead — written in
French, matching `docs/guide-editeur.md`'s own precedent.

| Topic | Page |
|---|---|
| How the project is structured: the two planes, packages, drivers | [Architecture](architecture.html) |
| Packages and drivers | [Packages and drivers](packages-and-drivers.html) |
| The frozen, versioned interface contracts (A through G) | [Interface contracts](contracts.html) |
| Building a theme, with a downloadable starter | [Creating a theme](creating-a-theme.html) |
| Building a plugin, with a downloadable starter | [Creating a plugin](creating-a-plugin.html) |
| REST, GraphQL, MCP | [API reference](api-reference.html) |

Two real, tested starting points — not documentation describing code that
doesn't exist:

- [Download the theme starter](../downloads/theme-starter.zip)
  (`examples/theme-starter/` in the repository)
- [Download the plugin starter](../downloads/plugin-starter.zip)
  (`examples/plugin-starter/` in the repository)

Each has its own test suite that actually runs it — if it breaks, CI sees it
before you do.
