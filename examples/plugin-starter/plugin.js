// The plugin's actual runtime code — what runs INSIDE the isolated worker,
// via `runPlugin`/`runIsolated` (`@cogenta/plugins`). Read docs/guide-plugin.md
// "Comment le code s'exécute" before assuming this looks like a normal Node
// module: it does not. There is no `import`, no `require`, no entry-point
// file that gets read from disk automatically yet — the code that runs here
// is passed as a plain string to `runPlugin`, and the sandbox executes it as
// a classic (non-module) script with exactly one real global your plugin can
// use: `sdk`, built with only the methods your manifest's granted
// capabilities allow (`sdk.content`, `sdk.storage` here — nothing else
// exists on it, not even a present-but-refusing stub).
//
// A classic script has no top-level `await` (that is an ES module feature) —
// wrap async work in an IIFE, as below, and make its returned Promise the
// script's final expression. `runIsolated` awaits it before serializing the
// result back to the host as plain JSON: no function, no class instance,
// survives that trip.

;(async () => {
  const entry = await sdk.content.read({ id: 'welcome' })
  await sdk.storage.write({
    key: 'plugins/plugin-starter/last-run.json',
    content: JSON.stringify({ ranAt: new Date().toISOString(), readTitle: entry?.title ?? null }),
  })
  return `Hello from @example/plugin-starter — read "${entry?.title ?? 'nothing'}".`
})()
