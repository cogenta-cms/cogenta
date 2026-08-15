---
"create-cogenta": minor
---

Give every blueprint's demo content something for the new theme to show.

The eight content-pack blueprints seeded a hero, a `collectionList` and sometimes a
`cta` — three block types out of twelve, none of which exercises a card, a panel or an
accordion. Each home page now also carries a `featureGrid` written for that blueprint's
own subject (how a project runs, what we do, how the docs are organised, how we cook),
and `association`, `documentation`, `restaurant` and `saas` gain a real `faq`; `magazine`
gains a pull `quote` and `vitrine` a `stats` row. All of it is plain text: no demo block
references a media asset, because `cogenta serve` has no image pipeline wired to it yet
and a seeded site must render on the first run.

Two things came out of writing it:

- a shared `richTextParagraph` helper, because a `faq` answer is a rich-text document
  too and five blueprints now build one — writing the four nested literals by hand in
  each is how a missing `markDefs` gets in;
- a new test that runs every blueprint's demo blocks through `parseBlocks`, the same
  contract-B validator the admin and the content store use. Nothing validated them
  before: they were only typed, so a constraint violation or a duplicate `_key`
  compiled and then failed at install time on a real user's machine, with the site
  half-seeded.
