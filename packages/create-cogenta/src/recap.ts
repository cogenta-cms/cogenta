import type { Output } from '@cogenta/cli'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import type { ResolvedBlueprint } from './blueprints/registry.js'
import type { EnvironmentReport } from './environment.js'
import type { ValidateKeyResult } from './llm-setup.js'
import type { ScaffoldResult } from './scaffold.js'
import type { SkinOutcome } from './skin-flow.js'
import type { WizardAnswers } from './types.js'

export interface RecapInput {
  readonly answers: WizardAnswers
  readonly environment: EnvironmentReport
  readonly resolvedBlueprint: ResolvedBlueprint
  readonly keyValidation?: ValidateKeyResult
  readonly scaffold: ScaffoldResult
  /** Present only when generation was attempted (L9 task 7) — absent means it was never offered (no LLM, no description). */
  readonly skinOutcome?: SkinOutcome
}

/** Step 10: "ce qui est actif, ce qui est dégradé et pourquoi, prochaine étape." Every degraded item names why, never just that it is degraded. */
export function printRecap(input: RecapInput, out: Output): void {
  const { answers, environment, resolvedBlueprint, keyValidation, scaffold, skinOutcome } = input

  out.heading('Your site')
  out.ok(`${answers.siteName} — ${answers.siteUrl}`)
  out.detail(answers.targetDir)

  out.heading('Blueprint')
  if (resolvedBlueprint.fellBackToBlank) {
    out.warn(`"${answers.blueprintId}" is not built yet — used "blank" instead.`)
  } else {
    out.ok(resolvedBlueprint.blueprint.label)
  }

  out.heading('Database')
  out.ok(answers.databaseDriver)
  if (answers.databaseDriver === 'sqlite') {
    out.detail('One machine, no vector index — fine for a single site, not for a fleet.')
  }

  out.heading('LLM provider')
  if (answers.llmProvider === 'none') {
    out.warn('None configured. Everything works except the agents.')
  } else if (keyValidation === undefined) {
    out.warn(`${answers.llmProvider} configured, but no API key was given to validate.`)
  } else if (keyValidation.valid) {
    out.ok(`${answers.llmProvider} (${answers.llmModel ?? 'default model'}) — key validated.`)
  } else {
    out.bad(
      `${answers.llmProvider} key did not validate: ${keyValidation.reason ?? 'unknown error'}. The agents will not run until this is fixed.`,
    )
  }

  const hasContentPack = BLUEPRINT_CONTENT_PACKS[resolvedBlueprint.blueprint.id] !== undefined

  out.heading('Skin')
  if (!hasContentPack) {
    out.warn(
      'Default skin — this blueprint has no theme.tokens.json step yet. AI skin generation applies only to blueprints with a real content pack today.',
    )
  } else if (skinOutcome?.kind === 'generated') {
    out.ok(
      `AI-generated skin, validated in ${skinOutcome.attempts} attempt${skinOutcome.attempts === 1 ? '' : 's'} — written to theme.tokens.json.`,
    )
  } else if (skinOutcome?.kind === 'default') {
    out.warn(`@cogenta/theme-canonical default skin — kept because ${skinOutcome.reason}.`)
  } else {
    out.ok('@cogenta/theme-canonical default skin — written to theme.tokens.json.')
    if (answers.llmProvider === 'none' || answers.siteDescription === undefined) {
      out.detail(
        'AI skin generation was not offered: it needs an LLM provider and a site description. Run `cogenta skin generate` later (a future CLI task) to try it.',
      )
    }
  }

  if (hasContentPack) {
    out.heading('Recommended agents')
    out.detail(
      'Not enabled — no site runs a live agent scheduler yet. Recorded in .cogenta/recommended-agents.json for when one exists.',
    )
  }

  out.heading('Admin account')
  if (scaffold.usersExitCode === 0) {
    out.line(scaffold.usersOutput.trim())
  } else {
    out.bad('Could not create the admin account.')
    out.detail(scaffold.usersOutput.trim())
  }

  if (environment.checks.some((check) => check.status === 'warn')) {
    out.heading('Degraded')
    for (const check of environment.checks) {
      if (check.status === 'warn') out.warn(check.message)
    }
  }

  out.heading('Next step')
  out.line(`cd ${answers.targetDir}`)
  out.line('npx cogenta serve')
  out.detail(
    'Sign in with the admin account above and enrol a passkey from the admin UI — that ceremony needs a browser, so it never runs during install.',
  )
}
