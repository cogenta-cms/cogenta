#!/usr/bin/env node
import process from 'node:process'
import { run } from './index.js'

// Same reasoning as `@cogenta/cli`'s `bin.ts`: Node's own "SQLite is
// experimental" notice is unactionable noise on every command that opens a
// database, which here is every successful install.
process.removeAllListeners('warning')
process.on('warning', (warning) => {
  const isSqliteNotice =
    warning.name === 'ExperimentalWarning' && warning.message.includes('SQLite')
  if (!isSqliteNotice) process.stderr.write(`${warning.stack ?? warning.message}\n`)
})

process.exitCode = await run({
  argv: process.argv.slice(2),
  isTty: process.stdout.isTTY === true,
})
