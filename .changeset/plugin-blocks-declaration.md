---
'@cogenta/blocks': minor
'@cogenta/plugins': minor
'@cogenta/cli': minor
---

A plugin can declare a block, and it becomes a real block of the site

`provides.blocks` has been in the manifest shape since L7 with nothing reading
it. It now carries what registering a block actually needs: a label, a field
schema declared as data, an optional heading level, and `fallbackFrom` — where
the fallback block's fields take their values from.

That last one is what makes falling back a promise the site can keep: a
`countdown`'s data does not satisfy `prose`'s schema, so "it degrades to prose"
would have meant "it disappears". Naming the mapping makes the degradation
something the plugin author decided and a reader can check.

`@cogenta/blocks` gains `blockFieldFromDeclaration`/`blockSchemaFromDeclaration`:
a block schema written as data rather than as calls to `f.*`, built by those
same constructors, so a declared block is a first-class block — same validator,
same envelope, same fallback chain. Nothing here knows what a plugin is.

`@cogenta/cli` gains `pluginBlockDefinitions`, `collectPluginBlocks` (which
reports a name already taken instead of overwriting someone else's block) and
`pluginBlockFallback`. Contract B is untouched: a plugin block never joins the
seventeen of the vocabulary, it is registered beside them.
