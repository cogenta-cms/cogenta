---
'@cogenta/core': minor
'@cogenta/plugins': minor
---

`runPlugin` (L7 task 6) now enforces the lot's own words in full: "un plugin
qui dépasse son temps ou sa mémoire est tué et désactivé, avec alerte. Il ne
peut pas faire tomber le CMS."

- A worker failure is now classified (`IsolatedRunResult.reason`:
  `'timeout' | 'memory' | 'crash'`) — `'memory'` is detected from Node's
  real `resourceLimits` heap-violation error message, `'timeout'` from the
  existing kill switch, everything else is `'crash'`.
- Only a `'timeout'` or `'memory'` violation disables the plugin — an
  ordinary thrown error never does. Disablement is real and persisted
  (`createPluginDisableStore`, `cogenta_plugin_disabled` table, mirroring
  `cogenta_plugin_grants`'s `ensurePluginTables` pattern). `runPlugin` now
  requires a `disableStore` and refuses (`PLUGIN_DISABLED`, a new
  `@cogenta/core` error code) to even spawn a worker for an already-disabled
  plugin — checked before every run, not just after a violation.
- The "avec alerte" half is a structural callback (`onPluginDisabled`), not
  a hard dependency on `@cogenta/channels` or any specific transport —
  wiring a disablement to a real notification is an integration decision
  for whatever assembles a site.
- Proven by real, worker-based tests: a genuine heap-exhaustion fixture
  trips the real `resourceLimits` ceiling and is classified `'memory'`; the
  host process is proven to survive and remain usable (a follow-up run
  succeeds immediately after either violation type); a disabled plugin's
  next run attempt is refused before a worker is spawned; a human can
  re-enable a disabled plugin.
