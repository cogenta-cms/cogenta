#!/usr/bin/env node
// Publishes every workspace package whose local package.json version isn't
// on npm yet — a hand-rolled replacement for `changeset publish`, which
// crashes deterministically in this monorepo (TypeError inside
// @changesets/cli's getUnpublishedPackages, triggered by its concurrent
// `pnpm info` fan-out; reproduced three times in CI, not a transient flake).
// Never uses `pnpm publish -r`: it silently ignores `--provenance=false`
// (a real pnpm bug, worked around all session by publishing one directory
// at a time instead).
//
// Usage:
//   node scripts/publish-changed.mjs            # CI: real provenance (OIDC)
//   node scripts/publish-changed.mjs --no-provenance   # manual/local publish

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const noProvenance = process.argv.includes('--no-provenance')

function packageDirs() {
  const dirs = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'packages', entry.name))
  return dirs
}

function readPackageJson(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
}

async function publishedVersions(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`registry lookup for ${name} failed: HTTP ${response.status}`)
  const body = await response.json()
  return Object.keys(body.versions ?? {})
}

async function main() {
  const dirs = packageDirs()
  const published = []
  const skipped = []
  const failed = []

  for (const dir of dirs) {
    const pkg = readPackageJson(dir)
    if (pkg.private) continue

    const versions = await publishedVersions(pkg.name)
    if (versions.includes(pkg.version)) {
      skipped.push(`${pkg.name}@${pkg.version}`)
      continue
    }

    const args = ['publish', '--no-git-checks']
    if (noProvenance) args.push('--provenance=false')

    try {
      execFileSync('pnpm', args, { cwd: dir, stdio: 'inherit', shell: true })
      published.push(`${pkg.name}@${pkg.version}`)
    } catch (error) {
      failed.push({ name: `${pkg.name}@${pkg.version}`, error })
    }
  }

  process.stdout.write(`\nPublished: ${published.length ? published.join(', ') : '(none)'}\n`)
  process.stdout.write(`Already on npm: ${skipped.length ? skipped.join(', ') : '(none)'}\n`)

  if (failed.length > 0) {
    process.stderr.write(`\nFailed: ${failed.map((f) => f.name).join(', ')}\n`)
    process.exitCode = 1
  }
}

await main()
