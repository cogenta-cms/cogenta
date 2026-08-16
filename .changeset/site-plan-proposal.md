---
'@cogenta/agents': minor
---

The rest of L19's planning agents (tasks 3, 4 and the review model), and the
orchestrator that runs them.

`generateSkinCandidates` widens `generateSkin` from one design to between two
and five (task 3). Each candidate is steered by its own design direction and
goes through `generateSkin`'s existing generate-validate-correct loop against
contract D, unchanged — asking one model for "three different skins" in one
call reliably produces three near-identical ones, asking three times with three
different briefs does not. A duplicate is dropped and a run that leaves fewer
than two valid candidates reports failure rather than presenting a choice of
one, which would not be a choice.

`proposeContentModel` turns a brief into real contract A collections (task 4).
The field kinds offered to the model are read from `FIELD_KINDS` at runtime
rather than listed by hand, every field is built through the real `f.*`
constructors — so a proposed `relation` comes out with `onDelete: 'restrict'`
and a proposed `media` with its full `accept` list — and every collection goes
through the real `defineCollection` and `validateCollectionSet`. A failure
becomes the next attempt's correction. `proposeDemoContent` writes starter
entries and validates each against `collectionInputSchema`, dropping and
reporting what would not save rather than inventing a value.

`summarisePlan` / `resolveApprovedPlan` are the review model, and there is no
"accept everything" in them by construction: resolving refuses unless every
item carries its own explicit decision, and refuses again if handed a decision
for an item that is not in the plan — which is what stops a caller inventing a
blanket `{"*": "accepted"}` and calling it consent. The design section is
`one-of`: accepting two is an error.

`proposeSitePlan` runs the four in dependency order and reports which stage
failed rather than returning half a plan. `createMemorySitePlanStore` /
`createFileSitePlanStore` keep a draft (and the decisions taken on it so far)
between the process that proposed it and the human who reviews it — two
implementations, neither needing a service, one contract suite.

Nothing here applies anything. Every one of these produces a draft.
