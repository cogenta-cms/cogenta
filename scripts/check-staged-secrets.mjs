#!/usr/bin/env node
// pre-commit hook — refuses to commit anything that looks like a credential.
// Cheap, deliberately noisy on the side of caution: a false positive costs one
// `--no-verify`, a leaked key costs a rotation and a disclosure.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

// `shape: true` means the pattern matches the documented shape of a real
// credential (a provider prefix, a key block). Those run everywhere.
// `shape: false` is the generic "a field called secret holds a long string"
// heuristic. It is right often enough to keep, and wrong on every test that
// exercises secret handling — so it is skipped in test files, where the
// shape-based patterns still apply.
/** @type {Array<{ name: string, pattern: RegExp, shape: boolean }>} */
const PATTERNS = [
  { name: 'Anthropic API key', pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/, shape: true },
  { name: 'OpenAI API key', pattern: /\bsk-(proj-)?[a-zA-Z0-9]{32,}/, shape: true },
  { name: 'AWS access key id', pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, shape: true },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/, shape: true },
  {
    name: 'Private key block',
    pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    shape: true,
  },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, shape: true },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, shape: true },
  {
    name: 'Hardcoded credential',
    pattern:
      /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
    shape: false,
  },
  {
    name: 'Connection string with password',
    pattern: /\b[a-z+]+:\/\/[^:@\s/]+:[^@\s/]{6,}@/,
    shape: false,
  },
]

const TEST_FILE = /(^|[/\\])(test|tests|__tests__)[/\\]|\.(test|spec)\.[cm]?[jt]sx?$/

const ALLOWED_PATHS =
  /^(\.env\.example|docker-compose\.test\.yml|scripts[/\\]check-staged-secrets\.mjs)$/

// A file that must contain credential-shaped strings — a redactor, a detector,
// or their tests — declares it at the top and says why. Deliberate, reviewable,
// and visible in a diff, unlike a growing allowlist of paths in this script.
const OPT_OUT = 'cogenta:allow-fake-credentials'

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

  const isTest = TEST_FILE.test(file)
  const optedOut = content.slice(0, 2000).includes(OPT_OUT)

  content.split('\n').forEach((line, index) => {
    if (/cogenta:cogenta|COGENTA_TEST_/.test(line)) return // documented test fixtures
    for (const { name, pattern, shape } of PATTERNS) {
      if (isTest && !shape) continue
      if (optedOut && shape) continue
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
