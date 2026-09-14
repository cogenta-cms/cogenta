---
'create-cogenta': patch
---

The `documentation` blueprint now scaffolds the documentation of a
self-hosted webhook delivery server: an application sends it events over HTTP,
and it signs, sends, retries and records a request for every subscribed
endpoint. The product is named after the site, with a trailing "Docs" or
"Documentation" dropped (falling back to "Relay"), and its command, environment
variables and header names are derived from that name, so the quickstart, the
CLI reference and the HTTP API reference always agree.

Thirteen published pages in four sections, with real code in shell, YAML,
JSON, TypeScript and Python, notes, and reference tables the theme lays out in
columns: Introduction, Installation, Quickstart and Core concepts; Verifying
signatures, Retries and replay, Configuration and Deploying to production; the
CLI, configuration and HTTP API references; Troubleshooting and What's new.
The home page opens on the statement and the search field, then three places to
start, the whole documentation by section, the code to send a first event,
common questions and where to go when something fails.

`doc_page` gains a `summary` field, shown under the page title, and its `order`
now runs across the whole documentation. The footer menu is seeded in four
headed columns, comments are closed, the footer note is a licence line, and
the starting skin matches `@cogenta/theme-docs` (IBM Plex Sans and IBM Plex
Mono, white and cool grey, one teal).

Pictures: the abstract hero and page panels are gone. One diagram of how an
event becomes signed requests, rendered once with IBM Plex (OFL) and bundled
as a PNG, illustrates "Core concepts".
