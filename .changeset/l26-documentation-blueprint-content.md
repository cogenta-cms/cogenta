---
'create-cogenta': minor
---

The `documentation` blueprint's ten seeded doc pages read like an actual reference site now — substantially longer, specific prose (real requirements, a fuller config example, health checks, permission gates, plugin isolation, more CLI commands and flags) instead of the two-paragraph placeholders every page carried before. Two of the ten pages ("Content model", "Themes") gain a decorative illustration via the existing zero-dependency `demo-art` generator (`DemoMediaSpec`/`seedDemoMedia`, no new photography and no external API — this blueprint has neither) — `DOCUMENTATION_MEDIA_SPECS` grows from one entry to three, so `scaffoldSite`'s `mediaSeeded` count for this blueprint changes from 1 to 3.
