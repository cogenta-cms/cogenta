/**
 * A stand-in for `node:sqlite` in the admin's test environment.
 *
 * The admin is a browser SPA. It never opens a database, and it must not: its
 * only path to one is that `@cogenta/core`'s single public entry re-exports
 * `db/index.js`, so importing `@cogenta/render` (markdown and skin helpers) or
 * `@cogenta/blocks` (the block vocabulary) drags the whole driver stack behind
 * it. `vite build` tree-shakes that branch away and the shipped bundle
 * contains none of it. Vitest's module runner has no such luxury — it
 * transforms each module alone, meets a Node built-in it cannot bundle for a
 * client environment, and fails the *file*, which is how seventy admin suites
 * died at load without a single assertion running.
 *
 * So this mirrors, in the test environment, what the production build already
 * does: nothing from SQLite reaches the browser. It is deliberately not a
 * working fake. Every member throws, so a test that genuinely reaches for a
 * database fails loudly and says why, instead of quietly passing against a
 * pretend one.
 *
 * The structural fix is for `@cogenta/core` to stop routing its drivers
 * through the barrel every consumer imports. That is a real change to a
 * package's public surface, and it is not this file's job.
 */

const refuse = (): never => {
  throw new Error(
    'The admin reached for node:sqlite. It is a browser application and has no database; ' +
      "this import can only have arrived through @cogenta/core's re-exports.",
  )
}

export class DatabaseSync {
  constructor() {
    refuse()
  }
}

export class StatementSync {
  constructor() {
    refuse()
  }
}

export const constants = {}
