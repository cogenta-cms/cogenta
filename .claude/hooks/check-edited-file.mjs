#!/usr/bin/env node
// PostToolUse hook — cheap, synchronous guardrails on TypeScript source files.
// Catches the AGENTS.md violations that are expensive to find later in review.
//
// Exit 0 = silent, exit 2 = feed the findings back to the model for correction.

import { readFileSync } from 'node:fs'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path
if (typeof filePath !== 'string') process.exit(0)

const normalised = filePath.replace(/\\/g, '/')
if (!/\.(ts|tsx|mts)$/.test(normalised)) process.exit(0)
if (/[/\\]node_modules[/\\]|\.d\.ts$/.test(normalised)) process.exit(0)

let source
try {
  source = readFileSync(filePath, 'utf8')
} catch {
  process.exit(0)
}

const isTest = /[./](test|spec)\.|[/\\]test[/\\]|[/\\]tests[/\\]/.test(normalised)

/** @type {Array<{ line: number, message: string }>} */
const findings = []

source.split('\n').forEach((line, index) => {
  const n = index + 1
  const code = line.replace(/\/\/.*$/, '')

  if (/(:|\bas\s+|<)\s*any\b/.test(code)) {
    findings.push({
      line: n,
      message: 'AGENTS.md « Pas de `any` ». Type explicite ou `unknown` + narrowing.',
    })
  }
  if (/@ts-(ignore|expect-error|nocheck)/.test(line)) {
    findings.push({
      line: n,
      message: 'AGENTS.md « sans `@ts-ignore` ». Corrige le type plutôt que de le taire.',
    })
  }
  if (/\bconsole\.(log|info|warn|error|debug)\b/.test(code) && !isTest) {
    findings.push({
      line: n,
      message: 'AGENTS.md « Logs structurés, jamais de `console.log` ». Utilise le logger.',
    })
  }
  if (/\brequire\s*\(|\bmodule\.exports\b|\bexports\./.test(code)) {
    findings.push({ line: n, message: 'AGENTS.md « Pas de CommonJS ». ESM uniquement.' })
  }
  if (/throw new Error\s*\(/.test(code) && !isTest) {
    findings.push({
      line: n,
      message:
        'AGENTS.md « Jamais de `throw new Error("…")` nu ». Utilise CogentaError avec `code` et `hint`.',
    })
  }
  if (/\bTODO\b/.test(line) && !/#\d+|issues?\/\d+/.test(line)) {
    findings.push({
      line: n,
      message: 'AGENTS.md « Pas de TODO sans issue GitHub associée ». Ajoute `#<numéro>`.',
    })
  }
})

if (findings.length === 0) process.exit(0)

const report = findings
  .slice(0, 12)
  .map((f) => `  ${normalised}:${f.line} — ${f.message}`)
  .join('\n')

process.stderr.write(
  `Règles AGENTS.md non respectées dans le fichier que tu viens d'écrire :\n\n${report}\n\n` +
    `Corrige-les maintenant, avant de passer à la suite.\n`,
)
process.exit(2)
