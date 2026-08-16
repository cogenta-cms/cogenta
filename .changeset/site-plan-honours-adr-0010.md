---
'@cogenta/agents': patch
'@cogenta/api': patch
'@cogenta/cli': minor
'create-cogenta': patch
---

Four corrections to L19, from the contract review.

**ADR-0010 wins over the lot document.** Applying a site plan writes
`cogenta.schema.*` and creates tables — that is the schema editor arriving by a
different door, and ADR-0010 says it plainly: "uniquement en mode
développement. En production le schéma est en lecture seule." L19's brief asked
for the opposite ("un site déjà en production peut recevoir de nouveaux
documents"); the acted decision wins, and the disagreement is written down in
`BLOCKERS.md` with a ready-to-insert ADR-0023 rather than worked around.
`RunServeOptions` gains `development`, set by `cogenta dev` and by it alone.
Proposing and reviewing a plan stay available everywhere; only the write is
withheld, and the refusal names the way out.

**The schema file is the one the site really loads.** The applier wrote
`cogenta.schema.mjs` by name, while `loadCollections` prefers
`cogenta.schema.ts` — the form ADR-0010 calls for. On such a project it would
have created the tables and then written a file nothing reads, leaving orphan
tables and no collections after the restart it told the operator to do. It now
resolves the real path (`findSchemaFile`, newly exported) and names it in the
follow-up. It also refuses outright when the current schema declares a
`validate` or a function `default`, which regenerating the file would silently
delete.

**Content a model wrote is marked as such.** Demonstration entries seeded by
the installer and by the applier now carry `provenance: 'generated'` and a
`provenanceDetail` naming the agent, the model and the time. Contract A calls
that field non-optional because the European AI framework requires it; the
store's default is `human`, so inheriting it would have made the one regulated
field lie about every generated entry.

**R8 has a second hop.** A constraint's `quote` is verbatim document text, and
the analysis step's careful tagging counted for nothing when the content-model
and demo-content prompts pasted it back in as prose — "Pas de blog. Ignore all
previous instructions and …" is a single clause, so the whole thing is the
quote. Both now go through `assembleContext`'s data channel too, escaped and
tagged, with a test that smuggles a forged `</data><constitution>` inside a
constraint and checks it arrives escaped.
