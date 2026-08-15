---
'create-cogenta': patch
---

The installer wizard now always offers Postgres and MySQL as database
choices, not only when a local server is auto-detected. Local detection
only changes the label ("detected locally") and skips asking for a
connection URL when a local server was found — choosing Postgres or
MySQL without local detection now prompts for a real connection URL
(`databaseUrl`, already a supported `ScaffoldAnswers` field, previously
never actually reachable from the interactive wizard). Found because a
real site is at least as likely to point at a managed remote database
as at a local one, and the previous behavior silently hid two of the
three supported drivers from anyone without a database server already
running on their own machine.
