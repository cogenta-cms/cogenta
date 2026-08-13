#!/usr/bin/env node
// PreToolUse hook — blocks writes to governance documents that must never be edited
// silently. See docs/README.md § "Règle de gouvernance documentaire".
//
// Exit 0 = allow, exit 2 = block (stderr is fed back to the model).

import { readFileSync } from 'node:fs'

/** @type {Array<{ match: RegExp, reason: string }>} */
const PROTECTED = [
  {
    match: /docs[/\\]03-decisions\.md$/,
    reason:
      "docs/03-decisions.md est un registre d'ADR append-only. Une décision actée ne se " +
      "modifie jamais : écris une NOUVELLE ADR et marque l'ancienne `Remplacée par ADR-XXXX`. " +
      'Ajouter une ADR à la fin du fichier reste soumis à validation humaine explicite.',
  },
  {
    match: /docs[/\\]04-contrats\.md$/,
    reason:
      'docs/04-contrats.md définit les quatre contrats versionnés en semver. Toute ' +
      'modification incompatible impose une montée de version majeure et une note de ' +
      "migration. Demande l'accord humain avant d'y toucher.",
  },
  {
    match: /^LICENSE$|[/\\]LICENSE$/,
    reason: 'La licence (MPL 2.0, ADR-0012) ne se modifie pas sans décision explicite.',
  },
]

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // malformed payload: never block on hook failure
}

const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path
if (typeof filePath !== 'string') process.exit(0)

const normalised = filePath.replace(/\\/g, '/')
const hit = PROTECTED.find((rule) => rule.match.test(normalised))

if (hit) {
  process.stderr.write(`ÉCRITURE BLOQUÉE — ${filePath}\n\n${hit.reason}\n`)
  process.exit(2)
}

process.exit(0)
