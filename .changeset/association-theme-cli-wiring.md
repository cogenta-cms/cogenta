---
"@cogenta/cli": patch
"create-cogenta": minor
---

Wires the new `@cogenta/theme-association` package into `cogenta serve`'s
theme registry and dependency list (L25, Phase 1) — a site can now select
"Association" from the theme gallery, and the `association` blueprint's
`defaultTheme` resolves to a real, installed theme instead of falling back
to canonical. `create-cogenta` gains the `association` starting skin (a
warm off-white ground with a deep-green accent), matching the theme's own
default look before any AI-generated skin is chosen.

Also fixes a real privacy bug found while verifying this theme end to end:
a public entry byline (`PageContent.entry.author`, contract D `theme@1.4`)
used to fall back to an author's login email when their account had no
display name — exactly the `displayName ?? email` fallback the
authenticated `admin-*` screens already use safely in a private context.
`create-cogenta` only ever asks for an email, so a freshly scaffolded
site's admin account has no display name by default, meaning **every**
themed site with author bylines enabled was publishing its own admin's
login email on the very first page a visitor could open. The byline is now
omitted rather than naming an email; a real display name still shows once
one is set.
