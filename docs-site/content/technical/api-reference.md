---
title: API reference
order: 5
---

# API reference — REST, GraphQL, MCP

**Scope of this page**: the real entry points and the permission rule
shared by all three — not a field-by-field schema of every collection,
which depends entirely on the schema your own site declares.

## One permission layer for all three

REST, GraphQL and MCP all go through the **same** `PermissionLayer` — a
role or an API key has exactly the same rights no matter which entry point
is used to exercise them. None of the three is a shortcut around what the
other two refuse.

## REST

Root: `/api/content/{collection}` — the five contract A actions (`read`,
`create`, `update`, `delete`, `publish`), plus the routes each minor
contract bump adds (`.../submit`, `.../approve`, `.../request-changes` for
the editorial workflow; `.../untrash`, `.../purge` for trash). `DELETE`
moves an entry to trash — it never destroys anything directly;
`POST .../purge` is the only real SQL `DELETE`, and it stays a `POST` on
its own path rather than giving `DELETE` a second meaning.

Other notable routes: `/api/taxonomies` (taxonomies aren't collections — a
site can name a collection and a taxonomy the same thing, which is why the
routes are separate), `/api/media`, `/api/search`, `/api/export`,
`/robots.txt` and `/sitemap.xml` generated from published content.

Every response follows the same error shape: a stable `code`, a message,
and a hint about what to do — never a raw, unstructured message.

## GraphQL

One entry point, `/api/graphql`, over the same content schema and the same
permission layer as REST — the two never diverge in what they allow, only
in the shape of the request.

## MCP (Model Context Protocol)

`cogenta mcp` starts an MCP server over STDIO — the same contract C tool
registry the internal agent runtime uses, exposed to an external MCP client
(a coding assistant, for instance). The same permissions apply: a tool
exposed through MCP never grants more than the account invoking it already
has.

## Authentication

A session token (cookie, for the admin) or an API key (`/api-keys`,
carrying a specific role's permissions) — both forms are accepted
interchangeably by REST and GraphQL. MCP over STDIO inherits the
permissions of the account that starts the process.
