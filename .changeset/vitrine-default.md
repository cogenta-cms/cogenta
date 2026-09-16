---
'create-cogenta': minor
---

The installer proposes the showcase site by default

Every default — including `npm create cogenta --yes` and a `--config` file that
names no blueprint — now installs `vitrine`: a complete site with its theme,
home page and demo content. It is first in the list; `blank`, the empty schema,
moves last and says it is for developers. `DEFAULT_BLUEPRINT_ID` is now
`'vitrine'`; the new `FALLBACK_BLUEPRINT_ID` (`'blank'`) is what an unknown
blueprint id, or a programmatic `scaffoldSite` call naming none, resolves to.
