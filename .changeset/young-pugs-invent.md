---
'@cogenta/blocks': minor
'@cogenta/core': minor
---

Add `@cogenta/blocks`: the twelve-block semantic vocabulary of contract B.

`defineBlock` declares a block manifest — `name`, `version`, `schema`, `runtime`,
`fallback`, `a11y` — and compiles it into a Zod validator. The twelve blocks of
`blocks@1.0` ship registered and ready: `hero`, `prose`, `mediaFigure`,
`featureGrid`, `cta`, `gallery`, `quote`, `faq`, `stats`, `logos`,
`collectionList` and `embed`.

- `parseBlock` / `parseBlocks` validate on write and refuse anything
  presentational: HTML in a text field, an unrecognised `className`, a `style`
  value. The error names the block and the field.
- `loadBlock` / `loadBlocks` migrate a block whose schema version has moved on,
  one version step at a time, and report `migrated` so the caller writes the
  result back. A block's `_key` survives the migration by construction.
- Register your own steps on a `BlockMigrationRegistry`; a missing step is a
  refusal, never a silent partial migration.

`@cogenta/core` gains the `BLOCK_UNKNOWN`, `BLOCK_INVALID`,
`BLOCK_DEFINITION_INVALID` and `BLOCK_MIGRATION_FAILED` error codes.
