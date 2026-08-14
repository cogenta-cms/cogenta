---
'@cogenta/core': minor
'@cogenta/agents-builtin': minor
---

Add `deps.patch` (opens a pull request bumping one dependency to a fixed
version — never modifies anything directly; `revert` closes the PR
without merging) and `securityAgent`, the frozen `AgentDeclaration`
tying `deps.scan`/`deps.patch` together with the lot's default autonomy
(`deps.scan` autonomous, `deps.patch` proposed).

One new `@cogenta/core` error code: `SECURITY_DEPENDENCY_NOT_FOUND`.
