#!/usr/bin/env node
// Build-time check for docker/Dockerfile — not part of any published package.
//
// Refuses an image whose node_modules holds an external package at a version
// pnpm-lock.yaml does not list: that version was never tested by CI nor
// checked by `pnpm audit`. docker/pack-workspace.mjs pins what it can; this
// is what makes the pinning a guarantee rather than an intention.
//
// Usage: node docker/verify-runtime-lock.mjs <locked-versions.json> <node_modules>

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [lockedArg, modulesArg] = process.argv.slice(2)
if (lockedArg === undefined || modulesArg === undefined) {
  console.error('usage: verify-runtime-lock.mjs <locked-versions.json> <node_modules>')
  process.exit(2)
}
const locked = JSON.parse(readFileSync(resolve(lockedArg), 'utf8'))

const unlisted = []
let checked = 0
const visit = (modulesDir) => {
  let entries
  try {
    entries = readdirSync(modulesDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(join(modulesDir, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) inspect(join(modulesDir, entry.name, scoped.name))
      }
      continue
    }
    inspect(join(modulesDir, entry.name))
  }
}
const inspect = (dir) => {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return
  }
  visit(join(dir, 'node_modules'))
  const { name, version } = manifest
  if (typeof name !== 'string' || typeof version !== 'string') return
  // The workspace's own packages come from the tarballs, not the registry.
  if (name === 'create-cogenta' || name.startsWith('@cogenta/')) return
  checked += 1
  if (!(locked[name] ?? []).includes(version)) unlisted.push(`${name}@${version}`)
}
visit(resolve(modulesArg))

if (checked === 0) {
  console.error(`no installed package found under ${modulesArg}: nothing was verified`)
  process.exit(1)
}
if (unlisted.length > 0) {
  console.error(
    `${unlisted.length} installed package version(s) are not in pnpm-lock.yaml:\n  ${[...new Set(unlisted)].sort().join('\n  ')}`,
  )
  process.exit(1)
}
console.log(
  `runtime lock verified: ${checked} installed packages, all at a version pnpm-lock.yaml lists`,
)
