---
"@cogenta/agents": minor
"@cogenta/agents-builtin": minor
"@cogenta/cli": minor
---

The plugin workshop (L31 step 4). "Cogenta Plugin Builder" is a built-in agent that writes real plugins — manifest and code — into `.cogenta/plugin-sandbox/<id>/`, through three tools carrying the new contract C permission `plugin.write_sandbox` (`tools@1.7`, additive): `plugin.write_sandbox_file` (`sideEffects: true`, `reversible: true`, its `revert` deletes the file it wrote), `plugin.read_sandbox_file` and `plugin.check_sandbox`, which validates the manifest, evaluates the code in the real isolated worker with nothing granted, and checks that every declared event, route and schedule has its handler. The agent is pinned to `autonomy: propose` and **has no deploy tool at all**: installing what a sandbox holds is a human action from the new admin Plugins screen (or the CLI), where each capability a plugin asks for is granted one at a time — installing grants nothing. `/api/plugins` serves the screen: what is installed with what it was granted, the sandboxes, their files and checks, deploy, grant and revoke, admin-only throughout.
