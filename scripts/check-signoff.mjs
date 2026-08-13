#!/usr/bin/env node
// commit-msg hook — AGENTS.md requires `Signed-off-by` on every commit.
// Sign with `git commit -s`, or configure `git config format.signOff true`.

import { readFileSync } from 'node:fs'
import process from 'node:process'

const messagePath = process.argv[2]
if (!messagePath) process.exit(0)

let message
try {
  message = readFileSync(messagePath, 'utf8')
} catch {
  process.exit(0)
}

// Ignore comment lines: git strips them before the commit is created.
const body = message
  .split('\n')
  .filter((line) => !line.startsWith('#'))
  .join('\n')

if (/^Signed-off-by: .+ <.+@.+>$/m.test(body)) process.exit(0)

process.stderr.write(
  'Missing Signed-off-by trailer (AGENTS.md § Conventions).\n\n' +
    '  git commit -s        sign this commit\n' +
    '  git config format.signOff true    sign every commit in this repo\n',
)
process.exit(1)
