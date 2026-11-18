---
"@cogenta/agents": minor
"@cogenta/mcp": minor
"@cogenta/cli": minor
---

An MCP client can now write in the site's own style and manage more than content (contract C `tools@1.11`, additive). Two read-only tools, `skills.list` and `skills.read` (new permission `skills.read`), hand out the skills the administrators wrote in *IA → Compétences* (`SKILL.md`), read from the same store as the admin screen, and the server's instructions tell the client to read them before writing; any authenticated key of any role can read them, and the admin screen now says so. `@cogenta/mcp` implements `prompts/list` and `prompts/get` (advertised only when a prompt source is given); `cogenta serve` and `cogenta mcp` offer each skill as a prompt. Five existing tools are now exposed to MCP behind the gate of their REST route: `comments.list` and `comments.decide` (comment permissions), `analytics.summary`, `logs.read_not_found` and `redirects.create` (admin). `redirects.create` is not offered over stdio, where the live-page check is not available. Failing requests (unknown or settled comment, a decision against the anti-spam verdict, a redirect from a live page or to an address) are refused before an administrator is asked.
