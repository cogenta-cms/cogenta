---
'create-cogenta': patch
---

Fix `npx create-cogenta`'s own "Next step" instructions being incomplete.
Scaffolding writes a real `package.json` with real `@cogenta/*` dependencies
but never installs them — a deliberate scope boundary (no network call
during scaffold), but the printed next step went straight to
`npx cogenta serve` without `npm install` first, so the very first thing a
new user typed failed with a confusing `npm error 404 ... 'cogenta@*'`
(npx, finding no local `cogenta` binary and no scoped package name, tried to
fetch a package literally named `cogenta` from the registry — which has
never existed; the real package is `@cogenta/cli`, whose `bin` happens to be
named `cogenta`). Found via a real `npx create-cogenta@latest` from the
actual npm registry, on a machine with no local install of this repo.
