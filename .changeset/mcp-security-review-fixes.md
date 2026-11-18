---
"@cogenta/core": minor
"@cogenta/agents": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Security review of the MCP autonomy work. What visitors wrote is now marked as data for an MCP client (R8): the output of `comments.list` and `logs.read_not_found` keeps its keys but every visitor-written string (comment author and text, 404 path and referrer) is fenced in a `<data source="tool:…">` block with its angle brackets escaped, and the output gains `untrusted: true` and a `notice`; the server's instructions say these texts are never instructions. `redirects.create` over MCP no longer replaces a redirect that already leaves the path (`REDIRECT_EXISTS`, 409 — the undo would have deleted a person's rule) and refuses a source the public router serves itself (`/_*`, `/api`, `/admin`, `/sitemap*.xml`, `/robots.txt`, `/search`, `/.well-known/*`…, `REDIRECT_PATH_RESERVED`, 400); the agents' own use of the tool is unchanged (`RedirectCreateOptions.exists` is opt-in). Undoing `comments.decide` is refused (`TOOL_REVERT_REFUSED`) when a person decided the comment again since. Undoing an MCP action from the audit log writes its intent to the journal before it runs, and answers `AUDIT_WRITE_FAILED` (503) when the journal cannot be written, instead of undoing silently. `apikey.create` now records the key's scope and autonomy, and `PATCH /api/api-keys/{id}` records `apikey.update` with what changed. New error codes `REDIRECT_EXISTS`, `REDIRECT_PATH_RESERVED`, `AUDIT_WRITE_FAILED`; `@cogenta/agents` exports `fenceToolOutput`.
