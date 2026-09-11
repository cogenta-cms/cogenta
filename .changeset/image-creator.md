---
'@cogenta/agents': minor
'@cogenta/agents-builtin': minor
'@cogenta/cli': minor
---

**Images get an owner: a "Cogenta Image Creator" agent, and a way to keep what
it makes.**

`assist.generate_image` could produce candidates and, by its own contract,
store nothing — so an image a model made could be looked at and never kept.
Nothing bridged generating and keeping.

`media.store_generated_image` is that bridge, and deliberately the only one.
Every file it writes is recorded as `generated`, naming the agent and the
model. `sideEffects: true` with `reversible: false` puts it through
`withAutonomy`'s forced-approval path **whatever** the configured level, so
`autonomous` cannot fill a library on its own: generating is the agent's,
keeping is the operator's. `alt` is required, not optional — a model that can
describe an image well enough to generate it can describe it well enough to be
read aloud.

The host side (`createImageLibrary`, `@cogenta/cli`) decodes the data URL and
refuses anything that is not an inline image: a remote URL would be a
server-side fetch whose target an agent's prompt chose. It refuses a type this
site does not store and an image that decoded to nothing, and mints the id
before the storage key so two pictures from the same prompt never collide.

The agent itself is disabled by default like every other seed, pinned to
`autonomy: propose`, and given a small budget — image generation is the most
expensive call in this codebase by an order of magnitude. Its identity says
what a good site image is: no text baked in (it cannot be translated or
corrected), composed for the slot it has to sit in, room left where a title
will go, and never an invented person presented as real.

One governance catch, fixed: adding provenance to `MediaAsset` had quietly
widened `media.read`'s output. Contract C figures a shipped tool's signature —
which is why `folderId` was stripped there rather than added — so provenance
is stripped the same way, with a test that keeps it out.
