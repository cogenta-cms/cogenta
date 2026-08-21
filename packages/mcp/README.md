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
  the same actor an unauthenticated REST request gets. Content tools
  (`content.read`, `content.write_draft`, `content.publish`,
  `content.delete`) are still on the manifest and still permission-checked
  per call, so a public actor can read what a public actor may read and
  nothing else. Media, site-config and HTTP-fetch tools are left off the
  manifest entirely in this mode — see "What's on the manifest" below for
  why.

## What's on the manifest

Content tools are always on the manifest, authenticated or not, because their
actual permission gate lives one layer down: they call into the site's real
`ContentService`, which asserts against `PermissionLayer` on every read and
write, exactly as `/api/content/*` does. There is nothing extra this server
needs to enforce for them.

Media (`media.read`, `media.write`) and site-config (`site.config_read`)
tools have no such check of their own — by design, per their own doc
comments in `@cogenta/agents`, *the manifest itself* is the permission gate
for these three. `cogenta mcp` therefore only puts them on the manifest for
an authenticated actor (`--email`, `--role`, or `--api-key`); the anonymous
default never sees them at all, so there is no way to reach one without
first naming who you are running as.

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

## Known limitation

Content written or published through `cogenta mcp` goes through the same
`ContentStore` as `cogenta serve`'s REST and GraphQL routes, but **not**
through the same decorated stores `assembleSite` builds — the full-text
search index, the vector (semantic search) index, redirect tracking on a
slug rename, and scheduled-publish enqueueing are all decorators applied at
`cogenta serve` startup, and `cogenta mcp` does not currently wire them in.
An entry an MCP client creates or edits is real, permission-checked content,
immediately visible to `cogenta serve` on its next read — but it will not
appear in full-text or semantic search results, and a slug rename will not
leave a redirect, until the next full reindex (`cogenta`'s "Outils" admin
screen, or a restart that touches the entry again). See `BLOCKERS.md`,
"MCP actor scoping", for the fuller account and the reasoning behind not
gold-plating this in the first pass.
