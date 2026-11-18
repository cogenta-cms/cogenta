---
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

An API key carries an autonomy setting for MCP clients: `manual` or `autonomous`.

`ApiKey.autonomy` defaults to `manual` — every write of an MCP client waits for an
administrator's approval, exactly as before. With `autonomous`, a write that can be undone
(a draft, a translation, a publication, a tag, an imported image) runs at once; a write that
cannot be undone (`content.delete`, `media.write`) still waits (R6). The setting is re-read
from the key on every call, so changing it applies to the next message of an open session.

The column is added to existing databases like the earlier columns of this store, and a key
that predates it reads as `manual`. `POST /api/api-keys` and `PATCH /api/api-keys/{id}` accept
and return `autonomy` (human administrators only, as for every key change); rotation and
recovery keep it. Tool descriptions and the MCP server instructions tell the client which
mode applies, and each audit record carries `autonomyMode` next to the level the call ran at.
