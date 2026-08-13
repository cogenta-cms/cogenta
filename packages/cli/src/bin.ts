#!/usr/bin/env node
import process from 'node:process'
import { run } from './index.js'

/**
 * Node prints "ExperimentalWarning: SQLite is an experimental feature" on every
 * command that opens a database, which is every useful command. It is Node's
 * notice about its own module, not something a Cogenta user can act on, and it
 * would train people to ignore warnings — including the ones that matter.
 *
 * Only that one warning is dropped. Everything else is re-emitted exactly as
 * Node would have printed it.
 */
process.removeAllListeners('warning')
process.on('warning', (warning) => {
  const isSqliteNotice =
    warning.name === 'ExperimentalWarning' && warning.message.includes('SQLite')

  if (!isSqliteNotice) process.stderr.write(`${warning.stack ?? warning.message}\n`)
})

// Only `serve` reads this; every other command finishes on its own and
// nothing ever calls `abort()`. Ctrl-C or a process manager's SIGTERM should
// close the listening socket and the database cleanly rather than dropping
// whatever request was in flight.
const shutdown = new AbortController()
process.once('SIGINT', () => shutdown.abort())
process.once('SIGTERM', () => shutdown.abort())

process.exitCode = await run({
  argv: process.argv.slice(2),
  isTty: process.stdout.isTTY === true,
  signal: shutdown.signal,
})
