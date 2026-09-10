---
'@cogenta/agents-builtin': minor
'@cogenta/cli': minor
---

**A generated theme is told what the site actually stores.**

A theme is a container for content, and a writer that does not know the
container's shape guesses at it. A guessed collection name renders nothing —
and the tempting fix for "nothing renders" is to hardcode articles into the
markup, where they cannot be edited from the admin, cannot be translated, and
cannot grow past the three the design happened to show.

`createThemeWiring` now takes the site's `collections` and describes them for
the writer — each collection's real name, its fields, and whether it has a
public page worth linking to or should be rendered inline. Both the
generation and the refinement paths receive it, and a caller with no schema in
hand simply omits it, leaving the prompt as it was.
