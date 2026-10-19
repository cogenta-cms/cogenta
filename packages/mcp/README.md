# `@cogenta/mcp` — connecting an MCP client to a Cogenta site

This package is the MCP (Model Context Protocol) server and client primitives
(`createMcpServer`, `serveMcpOverStdio`, `createMcpStdioClient`). The thing you
actually run against a site is the CLI command built on top of it:

```sh
cogenta mcp
```

It starts a real MCP server on the process's own `stdin`/`stdout` — no HTTP
port, no network listener — exposing this site's content tools (and, for an
authenticated actor, its media and site-config tools) to whatever process
spawned it: Claude Desktop, Claude Code, Cursor, or any other MCP client that
speaks stdio.

## Who the server runs as (R4)

`cogenta mcp` never runs with an implicit admin identity. Pick one:

```sh
cogenta mcp --email you@example.com   # a real user, looked up in the site's own user store
cogenta mcp --role viewer             # a synthetic actor for local testing, no real account
cogenta mcp --api-key cogenta_sk_…    # a key minted from the admin's "MCP" or "Clés API" screen
cogenta mcp                           # anonymous ("public") — the default, no flag needed
```

- **`--email`** resolves the account's real roles from the user store the
  admin and REST API already share. The account must already exist —
  `cogenta users create --email you@example.com --roles editor` first if it
  doesn't. Every tool call this server makes then runs with exactly that
  user's permissions, checked by the same `PermissionLayer` REST and GraphQL
  use — a role that cannot publish over the admin UI cannot publish through
  this server either.
- **`--role`** hands a synthetic actor with the given role(s)
  (comma-separated: `--role editor,reviewer`) and no real account behind it.
  Meant for local testing against a scratch site, not for pointing a real
  client at a real site.
- **`--api-key`** resolves an actor from a machine-to-machine bearer key,
  through the exact same `ApiKeyStore` (`@cogenta/auth`) and "roles = scope"
  mapping REST's own `resolveActor` uses for a `cogenta_sk_…` bearer token —
  one store, two callers. Mint one from the admin's dedicated **MCP** screen
  (which also shows the client configuration below, pre-filled with the raw
  key), or from the general-purpose **Clés API** screen — either works, since
  a key is a key regardless of which screen minted it. A revoked, expired, or
  unknown key refuses to start the server at all (`MCP_ACTOR_API_KEY_INVALID`)
  rather than silently falling back to anonymous.
- **With none of these flags**, the server runs as the anonymous `public`
  actor —
  the same actor an unauthenticated REST request gets. Its manifest includes
  only the effective collection capabilities. Media and site-config tools
  are left off the manifest entirely in this mode.

## What's on the manifest

Content capabilities are selected from the actor's effective collection grants,
including role overrides stored in the site's database. Every call also passes
through `ContentService`, which applies the collection and ownership checks used
by REST and GraphQL. A revocation written by another transport is re-read before
execution, including while an action is awaiting human approval.

Media reads are available to authenticated viewers, editors and admins. Media
writes require editor or admin. The runtime uses the same media grant policy as
REST; the tools contain no role checks (R4). Site-config reads require an
authenticated actor. An excluded capability returns an unknown-tool error before
execution.

## Connecting a client

Every MCP client that supports a stdio server wants roughly the same three
things: a command, its arguments, and the working directory to run it in
(your site's root, next to `cogenta.config.mjs`).

**Claude Desktop** (`claude_desktop_config.json`) / **Claude Code**
(`.mcp.json` in your project, or `claude mcp add`) / **Cursor** (MCP settings)
all accept this shape:

```json
{
  "mcpServers": {
    "cogenta": {
      "command": "npx",
      "args": ["cogenta", "mcp", "--email", "you@example.com"],
      "cwd": "/absolute/path/to/my-site"
    }
  }
}
```

Drop `--email …` for the anonymous default, swap it for `--role viewer`
while testing locally, or swap it for `--api-key cogenta_sk_…` to connect
with a key minted from the admin — the admin's **MCP** screen generates this
exact JSON block for you, with the key already filled in, right after you
create one. If `cogenta` is installed as a project dependency rather than
globally, point `command` at the local binary instead of `npx` (for example
`"command": "./node_modules/.bin/cogenta"`).

`COGENTA_AUTH_SIGNING_KEY` and any other environment variables your site's
`cogenta.config.mjs` needs must be visible to the spawned process — most
clients accept an `"env"` block alongside `"command"`/`"args"` for exactly
this; check your client's own MCP configuration docs for the exact key.

## Execution and approval

The manifest follows the actor's effective collection grants. Media reads are
available to viewer, editor and admin; media writes are restricted to editor
and admin, using the same policy as REST. Calling a capability outside that
manifest returns an unknown-tool error and does not execute a tool.

Content uses the shared decorated-store factory: full-text indexing,
slug-change redirects and scheduled-publication enqueueing follow the HTTP
pipeline. The default locale comes from the site's configuration, and content
mutations record the acting account. Optional vector indexing and lifecycle
callbacks are enabled when supplied by the runtime assembly.

Every executable MCP call passes through the common autonomy and hash-chained
audit decorators. Audit entries identify the actor, target and MCP origin and
include input, output and duration. The existing content and media mutation
tools declare themselves non-reversible and require a human decision before
execution. Starting the MCP process or passing an admin API key is not approval.

Human approval uses the file queue shared with `cogenta serve` at
`.cogenta/agents-runtime/approvals`. An administrator reviews the request in
the admin; the requesting call remains pending and makes no write until approval.
The queue keeps requests and decisions across process restarts. Decisions are
immutable and only one concurrent decision can win. Disconnecting the MCP client
cancels its pending execution; approving the old request later does not replay it.
A filesystem that cannot atomically publish a hard link causes the queue to fail
closed. The memory queue remains available for integrations and tests.
