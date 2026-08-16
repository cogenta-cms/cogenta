import type { Output } from '@cogenta/cli'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import type { ResolvedBlueprint } from './blueprints/registry.js'
import type { EnvironmentReport } from './environment.js'
import type { ValidateKeyResult } from './llm-setup.js'
import type { PlanFlowOutcome } from './plan-flow.js'
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
  /** Present only when a specification document was read (L19). Absent means the step was never entered. */
  readonly plan?: PlanFlowOutcome
}

/** Step 10: "ce qui est actif, ce qui est dégradé et pourquoi, prochaine étape." Every degraded item names why, never just that it is degraded. */
export function printRecap(input: RecapInput, out: Output): void {
  const { answers, environment, resolvedBlueprint, keyValidation, scaffold, skinOutcome, plan } =
    input

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

  if (plan !== undefined) {
    out.heading('Your document')
    if (plan.kind === 'failed') {
      out.bad(`No plan could be produced (${plan.stage}): ${plan.reason}`)
      out.detail(
        'The site was created from your answers alone. Nothing was applied from the document.',
      )
    } else if (plan.kind === 'deferred') {
      out.warn('A plan was proposed but nobody reviewed it, so nothing from it was applied.')
      if (scaffold.sitePlanPath !== undefined) out.detail(`Saved at ${scaffold.sitePlanPath}`)
      out.detail(
        'Open the admin and review it there — it applies only once you accept it, item by item.',
      )
    } else {
      out.ok(
        `${scaffold.approvedCollectionNames.length} collection(s) you approved were added${scaffold.approvedCollectionNames.length === 0 ? '' : `: ${scaffold.approvedCollectionNames.join(', ')}`}.`,
      )
      if (scaffold.approvedEntriesSeeded > 0) {
        out.detail(
          `${scaffold.approvedEntriesSeeded} demonstration entr${scaffold.approvedEntriesSeeded === 1 ? 'y was' : 'ies were'} created as drafts, never published — read them before you publish them.`,
        )
      }
      if (plan.approved.rejected.length > 0) {
        out.detail(`You refused: ${plan.approved.rejected.join(', ')}.`)
      }
      for (const violation of plan.draft.violations) out.detail(violation.explanation)
    }
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
  out.line('npm install')
  out.line('npx cogenta serve')
  out.detail(`Then open ${answers.siteUrl}/admin and sign in with the admin account above.`)
  out.detail(
    'A password is all it takes to sign in, for every role (ADR-0021). The admin recommends a second factor for an account that can publish or administer, and the profile screen is where to turn one on — it is never demanded at the door.',
  )
}
