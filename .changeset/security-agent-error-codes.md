---
'@cogenta/core': minor
'@cogenta/agents-builtin': minor
---

Add the `deps.scan` tool: SBOM → OSV.dev correlation (only versions
genuinely installed and affected, matched by OSV's own query semantics)
→ EPSS lookup → exploitability assessment crossing CVSS and EPSS →
imposed-format security report (what's affected / what an attacker
could do / is the site exposed / what's proposed / what happens if
nothing is done).

Two new `@cogenta/core` error codes: `SECURITY_OSV_QUERY_FAILED` and
`SECURITY_EPSS_QUERY_FAILED`.
