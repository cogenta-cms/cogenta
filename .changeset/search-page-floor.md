---
"@cogenta/cli": patch
"@cogenta/theme-magazine": patch
---

The search results page sets its result count inside the title, so it lands wherever a theme places the title, and carries a zero-specificity floor stylesheet (skin tokens only) so a theme that does not style the summary, date or page width still shows a readable page instead of a title against the window edge.
