---
'@cogenta/agents': minor
'@cogenta/cli': minor
---

**A site plan can propose categories.**

It could not, and the reason was honest: a proposal had no way to declare a
taxonomy, so a `taxonomy` field would always have named something that did not
exist. `taxonomy` was withheld from the field kinds offered, and a plan
answered "my articles need categories" with a `select` of frozen strings
nobody could rename afterwards.

`proposeContentModel` now declares them — real contract A taxonomies through
`defineTaxonomy`, hierarchical or flat, with the same refusal of public write
permissions collections already get, and their labels filed under the site's
own locale. `taxonomy` fields come back with them, and the check becomes the
one a model can act on: not "this is unsupported" but "this names a taxonomy
nothing declares, here are the ones that exist". A taxonomy the site already
has is never redeclared, and one that contradicts an explicit constraint is
removed and reported like any other proposal — a document ruling out a blog
rules out a `blog` category just as squarely.

They are their own review section, so accepting a collection never silently
accepts the classification it depends on. Applying writes them to the schema
file as the **named** export contract A actually reads
(`export const taxonomies = [...]`, alongside the default export it already
wrote) and creates their tables before the collections whose fields point at
them. Like any schema write, that half needs `cogenta dev`; under
`cogenta serve` each one is refused by name, and the rest of the plan still
applies.
