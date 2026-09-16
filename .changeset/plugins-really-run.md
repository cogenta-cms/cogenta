---
"@cogenta/plugins": minor
"@cogenta/core": minor
"@cogenta/cli": minor
---

Plugins actually run (L31 step 1). A plugin's code now lives in a file its manifest names (`main`, `plugin.js` by default), which `readPluginCode` reads and a signature covers — signing a plugin covers its code and not only its manifest, so changing one character of it invalidates the signature. The worker protocol gains a structured invocation: `runPlugin(…, { invoke, input })` calls one named handler of the plugin with a payload, instead of a caller building a code string per call. A site holds its plugins in one directory per plugin under `plugins/` (`loadInstalledPlugins`, configurable with `plugins.dir`, switched off entirely with `plugins.enabled: false`), and `cogenta plugin list|check|grant|revoke|run` is the hand path onto all of it — running a plugin against the site's real database and storage, with only the capabilities it has really been granted. `cogenta serve` still calls no plugin: an extension point (content events, a public route, a scheduled job) is the next step.
