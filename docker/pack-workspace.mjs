#!/usr/bin/env node
// Build-time helper for docker/Dockerfile — not part of any published package.
//
// Turns this workspace into what `npm install` would have fetched from the
// registry: one tarball per publishable package (`pnpm pack` rewrites
// `workspace:*` and `catalog:` to real versions) and a package.json that
// installs them all, so an image can be built from any commit, published or
// not. npm must be told that a transitive "@cogenta/core": "0.14.0" means the
// tarball and not the registry copy: every tarball is a direct dependency and
// `overrides` points every nested occurrence at it ("$name").
//
// Usage: node docker/pack-workspace.mjs <tarball-dir> <install-dir>

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [tarballArg, installArg] = process.argv.slice(2)
if (tarballArg === undefined || installArg === undefined) {
  console.error('usage: pack-workspace.mjs <tarball-dir> <install-dir>')
  process.exit(2)
}
const tarballDir = resolve(tarballArg)
const installDir = resolve(installArg)

/** What the image is for: the installer pulls in the CLI and every theme with it. */
const ROOTS = ['create-cogenta']

const packagesDir = 'packages'
const workspace = new Map()
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifest = JSON.parse(readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8'))
  workspace.set(manifest.name, { dir: join(packagesDir, entry.name), manifest })
}

const closure = new Set()
const visit = (name) => {
  if (closure.has(name)) return
  const found = workspace.get(name)
  if (found === undefined) throw new Error(`${name} is not a package of this workspace`)
  if (found.manifest.private === true) throw new Error(`${name} is private and cannot be installed`)
  closure.add(name)
  for (const dependency of Object.keys(found.manifest.dependencies ?? {})) {
    if (workspace.has(dependency)) visit(dependency)
  }
}
for (const root of ROOTS) visit(root)

mkdirSync(tarballDir, { recursive: true })
const dependencies = {}
for (const name of [...closure].sort()) {
  const { dir, manifest } = workspace.get(name)
  const output = execFileSync('pnpm', ['pack', '--pack-destination', tarballDir, '--json'], {
    cwd: dir,
    encoding: 'utf8',
  })
  const filename = JSON.parse(output.slice(output.indexOf('{'))).filename
  dependencies[name] = `file:${filename}`
  console.log(`packed ${name}@${manifest.version}`)
}

// Optional drivers and clients the packages load by name at run time
// (`@cogenta/core` declares them as optional peers, so nothing installs them
// for us). Versions come from the workspace catalog — the ones CI tests.
const catalog = new Map()
{
  let inCatalog = false
  for (const line of readFileSync('pnpm-workspace.yaml', 'utf8').split('\n')) {
    if (/^catalog:/u.test(line)) {
      inCatalog = true
      continue
    }
    if (inCatalog && /^\S/u.test(line)) break
    const match = /^\s+['"]?([^'":]+)['"]?:\s*(\S+)\s*$/u.exec(line)
    if (inCatalog && match) catalog.set(match[1], match[2])
  }
}
const RUNTIME_EXTRAS = [
  'postgres',
  'mysql2',
  // Native fast path for images; `@cogenta/render` falls back to WebAssembly
  // libvips without it (R10), and bookworm has prebuilt binaries for both
  // architectures, so there is nothing to compile.
  'sharp',
  '@redis/client',
  'bullmq',
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner',
  '@aws-sdk/lib-storage',
]
for (const name of RUNTIME_EXTRAS) {
  const range = catalog.get(name)
  if (range === undefined) throw new Error(`${name} is not in the workspace catalog`)
  dependencies[name] = range
}

// Every external version pnpm-lock.yaml resolved — the graph CI tested and
// `pnpm audit` checked. npm has no way to read that lockfile, so without this
// it would resolve every range afresh and the image could run versions nobody
// tested. A package locked at a single version is pinned to it through
// `overrides`; the few the workspace holds at several versions keep their
// ranges, and docker/verify-runtime-lock.mjs then refuses an image holding any
// version the lockfile does not list.
const lockedVersions = new Map()
{
  let inPackages = false
  for (const line of readFileSync('pnpm-lock.yaml', 'utf8').split('\n')) {
    if (/^packages:/u.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages && /^\S/u.test(line)) break
    const match = /^ {2}'?((?:@[^@/']+\/)?[^@']+)@([^(':]+)/u.exec(line)
    if (!inPackages || match === null) continue
    const versions = lockedVersions.get(match[1]) ?? new Set()
    versions.add(match[2])
    lockedVersions.set(match[1], versions)
  }
}
const lockedSingle = (name) => {
  const versions = lockedVersions.get(name)
  return versions?.size === 1 ? [...versions][0] : undefined
}

for (const name of RUNTIME_EXTRAS) {
  dependencies[name] = lockedSingle(name) ?? dependencies[name]
}

// `@langchain/langgraph` (the agent loop) lists `@langchain/core` as a required
// peer. npm would normally install it for us, but peers are skipped on purpose
// (the Dockerfile explains why), so it is named here at the exact version the
// lockfile — and therefore the test suites — resolved.
{
  const locked = lockedSingle('@langchain/core')
  if (locked === undefined)
    throw new Error('@langchain/core is not locked at one version in pnpm-lock.yaml')
  dependencies['@langchain/core'] = locked
}

const overrides = Object.fromEntries([...closure].sort().map((name) => [name, `$${name}`]))
/** The caret range a version belongs to — what one dependent's `^x.y.z` would accept. */
const lineOf = (version) => {
  const [major, minor] = version.split('.')
  return major === '0' ? `^0.${minor}` : `^${major}`
}
const newest = (versions) =>
  [...versions].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1)
for (const [name, versions] of [...lockedVersions].sort(([a], [b]) => a.localeCompare(b))) {
  if (workspace.has(name)) continue
  if (versions.size === 1) {
    // A direct dependency must be overridden by reference, or npm refuses the
    // override as conflicting with the dependency's own spec.
    overrides[name] = name in dependencies ? `$${name}` : [...versions][0]
    continue
  }
  // Held at several versions: one override per release line (`p-queue@^6`,
  // `p-queue@^9`), each pinned to the newest version locked on that line.
  const lines = new Map()
  for (const version of versions) {
    lines.set(lineOf(version), [...(lines.get(lineOf(version)) ?? []), version])
  }
  for (const [line, onLine] of lines) overrides[`${name}@${line}`] = newest(onLine)
}

writeFileSync(
  join(tarballDir, 'locked-versions.json'),
  `${JSON.stringify(Object.fromEntries([...lockedVersions].map(([name, versions]) => [name, [...versions]])))}\n`,
)

mkdirSync(installDir, { recursive: true })
writeFileSync(
  join(installDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'cogenta-runtime',
      version: '0.0.0',
      private: true,
      type: 'module',
      description:
        'Everything the Cogenta container image runs. Generated by docker/pack-workspace.mjs.',
      dependencies,
      overrides,
    },
    null,
    2,
  )}\n`,
)
console.log(`wrote ${join(installDir, 'package.json')} for ${closure.size} workspace packages`)
