---
"@cogenta/cli": minor
"@cogenta/api": minor
"@cogenta/auth": minor
---

An administrator can now undo what an autonomous MCP key did, from the audit log. `cogenta serve` gains `GET /api/mcp/actions/{auditId}` (can this call be undone, was it already) and `POST /api/mcp/actions/{auditId}/revert`, which runs the tool's own `revert` from the receipt the audit record keeps, as the signed-in administrator (an API key is refused whatever its role, so an agent cannot undo through itself). The undo is its own audit entry (`agent.tool.<tool>.revert`, `revertOf` naming the call); undoing the same call twice is refused, and a tool refusal (`TOOL_REVERT_REFUSED`, the content was edited since) is returned with its hint. The receipt of a very long article is no longer lost to the 64 KiB bound of an audit record. `@cogenta/api` maps `RECEIPT_UNKNOWN` to 404 and `RECEIPT_ALREADY_REVERTED`/`RECEIPT_NOT_REVERTIBLE` to 409; `@cogenta/auth` reads an undo recorded by a person as a human action, not an agent's.
