#!/usr/bin/env node
// pre-commit hook — refuses to commit anything that looks like a credential.
// Cheap, deliberately noisy on the side of caution: a false positive costs one
// `--no-verify`, a leaked key costs a rotation and a disclosure.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

/** @type {Array<{ name: string, pattern: RegExp }>} */
const PATTERNS = [
  { name: 'Anthropic API key', pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: 'OpenAI API key', pattern: /\bsk-(proj-)?[a-zA-Z0-9]{32,}/ },
  { name: 'AWS access key id', pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'Hardcoded credential',
    pattern:
      /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
  },
  { name: 'Connection string with password', pattern: /\b[a-z+]+:\/\/[^:@\s/]+:[^@\s/]{6,}@/ },
]

const ALLOWED_PATHS =
  /^(\.env\.example|docker-compose\.test\.yml|scripts[/\\]check-staged-secrets\.mjs)$/

let staged
try {
  staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
} catch {
  process.exit(0)
}

/** @type {string[]} */
const findings = []

for (const file of staged) {
  if (ALLOWED_PATHS.test(file)) continue
  if (/\.(png|jpe?g|gif|ico|woff2?|pdf|zip|lock)$/i.test(file)) continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (content.length > 2_000_000) continue

  content.split('\n').forEach((line, index) => {
    if (/cogenta:cogenta|COGENTA_TEST_/.test(line)) return // documented test fixtures
    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`  ${file}:${index + 1} — ${name}`)
        return
      }
    }
  })
}

if (findings.length === 0) process.exit(0)

process.stderr.write(
  `Possible secret in staged changes — commit refused:\n\n${findings.slice(0, 20).join('\n')}\n\n` +
    'Move it to the environment. Secrets come from env vars only, never from a\n' +
    'committed file (AGENTS.md, rule R7). If this is a false positive, commit with\n' +
    '--no-verify and say why in the commit body.\n',
)
process.exit(1)
