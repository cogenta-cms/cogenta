import type { ExtractedDocument, SitePlanDraft } from '@cogenta/agents'
import type { Output } from '@cogenta/cli'
import {
  blueprintSettings,
  inferBlueprint,
  resolveBlueprintSettings,
} from './blueprint-defaults.js'
import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import { BLUEPRINTS, resolveBlueprint } from './blueprints/registry.js'
import { loadConfigFile } from './config-file.js'
import { collectDocuments, readDocuments } from './document-step.js'
import { checkEnvironment } from './environment.js'
import {
  createProviderClient,
  LLM_PROVIDERS,
  type LlmProviderId,
  validateApiKey,
} from './llm-setup.js'
import { type PlanFlowOutcome, runPlanFlow } from './plan-flow.js'
import type { Prompter } from './prompts.js'
import { printRecap } from './recap.js'
import { scaffoldSite } from './scaffold.js'
import { chooseSkin, type SkinOutcome } from './skin-flow.js'
import { defaultAnswers, type WizardAnswers } from './types.js'

export interface RunWizardOptions {
  readonly targetDir: string
  readonly siteName: string
  readonly prompter: Prompter
  readonly out: Output
  readonly configPath?: string
  readonly env?: Record<string, string | undefined>
  /** Where a relative document path typed by the user is resolved from. Defaults to `process.cwd()`. */
  readonly cwd?: string
  /**
   * Test seam only — the same one `llm-setup.ts` already carries. It lets a
   * test drive the whole installer, document step included, without a key
   * and without the network, rather than mocking a shared module.
   */
  readonly fetchImpl?: typeof fetch
}

interface EnvironmentDetected {
  readonly postgres: boolean
  readonly mysql: boolean
}

interface LlmSetup {
  readonly provider: LlmProviderId
  readonly model?: string
  readonly apiKey?: string
  readonly validation?: Awaited<ReturnType<typeof validateApiKey>>
}

/**
 * The provider question, asked before everything else now.
 *
 * It moved for one reason: L19's document step needs a model, and the lot
 * puts that step "avant même de poser les questions actuelles". Nothing else
 * changed about it — `none` is still the default, still the first option,
 * and answering it still leaves an installer that asks nothing further about
 * AI and produces the same site it always did (R2).
 */
async function collectLlmSetup(
  prompter: Prompter,
  fetchImpl: typeof fetch | undefined,
): Promise<LlmSetup> {
  const provider = await prompter.choice<LlmProviderId>(
    'LLM provider (optional — Cogenta works fully without one)',
    LLM_PROVIDERS.map((entry) => ({ label: entry.label, value: entry.id })),
    0,
  )
  if (provider === 'none') return { provider }

  const option = LLM_PROVIDERS.find((entry) => entry.id === provider)
  const model = await prompter.text('Model', option?.defaultModel ?? '')
  const apiKey = await prompter.secret('API key')
  if (apiKey === '') return { provider, model }

  const validation = await validateApiKey({
    provider,
    apiKey,
    model,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  })
  return { provider, model, apiKey, validation }
}

interface Prefill {
  /** From an approved plan's locales. Offered as the default of the language question, never applied silently. */
  readonly defaultLocale?: string
  /** Inferred from the brief, deterministically. Offered as the default of the "Site type" question. */
  readonly blueprintId?: string
  /** The brief's own summary, offered as the default of the skin-description question. */
  readonly siteDescription?: string
  /** Why each of the above is being suggested, printed once before the questions. */
  readonly because: readonly string[]
}

async function collectAnswers(
  prompter: Prompter,
  out: Output,
  targetDir: string,
  siteName: string,
  detectedDatabases: EnvironmentDetected,
  llm: LlmSetup,
  prefill: Prefill,
): Promise<WizardAnswers> {
  const defaults = defaultAnswers(targetDir, siteName)

  if (prefill.because.length > 0) {
    out.heading('Pre-filled from your document')
    out.line('Every answer below is only a suggestion. Change any of them.')
    for (const line of prefill.because) out.detail(line)
  }

  const name = await prompter.text('Site name', defaults.siteName)
  const url = await prompter.text('Site URL', defaults.siteUrl)
  const locale = await prompter.text(
    'Primary language (locale code)',
    prefill.defaultLocale ?? defaults.defaultLocale,
  )

  const blueprintIndex = Math.max(
    0,
    BLUEPRINTS.findIndex((entry) => entry.id === (prefill.blueprintId ?? defaults.blueprintId)),
  )
  const blueprintId = await prompter.choice(
    'Site type',
    BLUEPRINTS.map((entry) => ({ label: entry.label, value: entry.id })),
    blueprintIndex,
  )

  // Postgres and MySQL are always offered, not only when a local server is
  // detected — a real site is as likely to point at a managed remote
  // database (Neon, PlanetScale, a hosting provider's MySQL) as at one
  // running on this machine, and hiding the option entirely made those two
  // of the three supported drivers unreachable from the wizard.
  const databaseChoices: readonly { label: string; value: WizardAnswers['databaseDriver'] }[] = [
    { label: 'SQLite (default — no separate database server needed)', value: 'sqlite' },
    {
      label: detectedDatabases.postgres ? 'Postgres (detected locally)' : 'Postgres',
      value: 'postgres',
    },
    { label: detectedDatabases.mysql ? 'MySQL (detected locally)' : 'MySQL', value: 'mysql' },
  ]
  const databaseDriver = await prompter.choice('Database', databaseChoices, 0)

  let databaseUrl: string | undefined
  if (databaseDriver === 'postgres' && !detectedDatabases.postgres) {
    databaseUrl = await prompter.text('Postgres connection URL', '')
  } else if (databaseDriver === 'mysql' && !detectedDatabases.mysql) {
    databaseUrl = await prompter.text('MySQL connection URL', '')
  }

  // Only asked when no document already answered it: a plan carries its own
  // designs, generated from the brief, and asking for the same information
  // twice is how an installer earns its reputation.
  let siteDescription: string | undefined = prefill.siteDescription
  if (llm.provider !== 'none' && prefill.siteDescription === undefined) {
    siteDescription = await prompter.text(
      'Site description for AI design generation (sector, mood, audience, brand colours — leave blank to skip and keep the default skin)',
      '',
    )
  }

  // L19 task 8 — the per-site-type recommendations, confirmed one at a time.
  const recommendations = blueprintSettings(blueprintId)
  const settingAnswers: Record<string, boolean> = {}
  if (recommendations.settings.length > 0) {
    out.heading('Defaults for this kind of site')
    for (const setting of recommendations.settings) {
      out.detail(setting.why)
      settingAnswers[setting.id] = await prompter.confirm(setting.question, setting.recommended)
    }
  }

  const adminEmail = await prompter.text('Admin email', defaults.adminEmail)

  return {
    ...defaults,
    siteName: name,
    siteUrl: url,
    defaultLocale: locale,
    blueprintId,
    databaseDriver,
    ...(databaseUrl === undefined || databaseUrl === '' ? {} : { databaseUrl }),
    llmProvider: llm.provider,
    ...(llm.model === undefined || llm.model === '' ? {} : { llmModel: llm.model }),
    ...(llm.apiKey === undefined || llm.apiKey === '' ? {} : { llmApiKey: llm.apiKey }),
    ...(siteDescription === undefined || siteDescription === '' ? {} : { siteDescription }),
    adminEmail,
    blueprintSettings: settingAnswers,
  }
}

function prefillFrom(plan: PlanFlowOutcome | undefined): Prefill {
  if (plan === undefined || plan.kind === 'failed') return { because: [] }
  const brief = plan.draft.brief
  const locale =
    (plan.kind === 'reviewed' ? plan.approved.locales[0] : undefined) ?? brief.languages[0]
  const blueprintId = inferBlueprint(brief)

  const because: string[] = []
  if (locale !== undefined) because.push(`Language “${locale}” — from the brief.`)
  if (blueprintId !== undefined) {
    because.push(`Site type “${blueprintId}” — matched from what the brief describes.`)
  }
  because.push(`Design description — the brief's own summary.`)

  return {
    ...(locale === undefined ? {} : { defaultLocale: locale }),
    ...(blueprintId === undefined ? {} : { blueprintId }),
    siteDescription: brief.summary,
    because,
  }
}

/**
 * The whole wizard, orchestrated. Returns a process exit code: `0` a working
 * site, `1` the environment or the install failed, `2` a `--config` file was
 * invalid.
 *
 * L19 inserts one optional step ahead of everything else — read a
 * specification document, propose a plan, let a human approve it item by
 * item — and changes nothing about the run that declines it. With no
 * provider configured, or with `--yes`, that step is never entered and the
 * site produced is the one this installer produced before L19 existed.
 */
export async function runWizard(options: RunWizardOptions): Promise<number> {
  const { out, prompter } = options
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()

  const environment = await checkEnvironment({ targetDir: options.targetDir, env })
  out.heading('Environment')
  for (const check of environment.checks) {
    if (check.status === 'ok') out.ok(check.message)
    else if (check.status === 'warn') out.warn(check.message)
    else out.bad(check.message)
  }
  if (!environment.ok) {
    out.line()
    out.line('Fix the problem above and run this again.')
    prompter.close()
    return 1
  }

  let answers: WizardAnswers
  let llm: LlmSetup
  let plan: PlanFlowOutcome | undefined

  if (options.configPath !== undefined) {
    try {
      answers = await loadConfigFile(options.configPath, options.targetDir)
    } catch (error) {
      out.bad(error instanceof Error ? error.message : String(error))
      prompter.close()
      return 2
    }
    llm = {
      provider: answers.llmProvider,
      ...(answers.llmModel === undefined ? {} : { model: answers.llmModel }),
      ...(answers.llmApiKey === undefined ? {} : { apiKey: answers.llmApiKey }),
    }
    if (llm.provider !== 'none' && llm.apiKey !== undefined && llm.apiKey !== '') {
      llm = {
        ...llm,
        validation: await validateApiKey({
          provider: llm.provider,
          apiKey: llm.apiKey,
          model: llm.model ?? '',
          ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        }),
      }
    }
    plan = await runDocumentStepFromConfig({
      answers,
      llm,
      out,
      cwd,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    })
  } else {
    llm = await collectLlmSetup(prompter, options.fetchImpl)
    plan = await runDocumentStepInteractively({
      llm,
      prompter,
      out,
      cwd,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    })
    answers = await collectAnswers(
      prompter,
      out,
      options.targetDir,
      options.siteName,
      {
        postgres: environment.detectedDatabases.includes('postgres'),
        mysql: environment.detectedDatabases.includes('mysql'),
      },
      llm,
      prefillFrom(plan),
    )
  }

  const resolvedBlueprint = resolveBlueprint(answers.blueprintId)
  const keyValidation = llm.validation
  const llmModel = llm.model ?? ''

  // A reviewed plan already carries the design its owner picked, so the
  // separate skin round is skipped rather than asking the same question a
  // second time. Everything else about it is unchanged from L9 task 7.
  const approvedSkin = plan?.kind === 'reviewed' ? plan.approved.skin : undefined
  let skinOutcome: SkinOutcome | undefined
  if (
    approvedSkin === undefined &&
    BLUEPRINT_CONTENT_PACKS[resolvedBlueprint.blueprint.id] !== undefined &&
    answers.llmProvider !== 'none' &&
    answers.llmApiKey !== undefined &&
    answers.llmApiKey !== '' &&
    keyValidation?.valid === true &&
    answers.siteDescription !== undefined &&
    answers.siteDescription !== ''
  ) {
    out.heading('Design proposals')
    skinOutcome = await chooseSkin({
      prompter,
      out,
      client: createProviderClient({
        provider: answers.llmProvider,
        apiKey: answers.llmApiKey,
        model: llmModel,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      }),
      model: llmModel,
      description: answers.siteDescription,
      blueprintLabel: resolvedBlueprint.blueprint.label,
      siteName: answers.siteName,
      targetDir: answers.targetDir,
    })
  }
  prompter.close()

  const confirmed = resolveBlueprintSettings(
    resolvedBlueprint.blueprint.id,
    answers.blueprintSettings ?? {},
  )
  const approved = plan?.kind === 'reviewed' ? plan.approved : undefined
  const locales =
    approved !== undefined && approved.locales.length > 0
      ? [...new Set([answers.defaultLocale, ...approved.locales])]
      : [answers.defaultLocale]

  const scaffold = await scaffoldSite(
    {
      targetDir: answers.targetDir,
      siteName: answers.siteName,
      siteUrl: answers.siteUrl,
      defaultLocale: answers.defaultLocale,
      locales,
      databaseDriver: answers.databaseDriver,
      ...(answers.databaseUrl === undefined ? {} : { databaseUrl: answers.databaseUrl }),
      ...(answers.llmProvider === 'none'
        ? {}
        : { llm: { provider: answers.llmProvider, model: answers.llmModel ?? '' } }),
      adminEmail: answers.adminEmail,
      blueprintId: resolvedBlueprint.blueprint.id,
      security: { pageMaxAge: confirmed.pageMaxAge, hstsMaxAge: confirmed.hstsMaxAge },
      seedDemoContent: confirmed.seedDemoContent,
      ...(approvedSkin === undefined
        ? skinOutcome?.kind === 'generated'
          ? { skinTokens: skinOutcome.tokens }
          : {}
        : { skinTokens: approvedSkin }),
      ...(approved === undefined
        ? {}
        : {
            approvedCollections: approved.collections,
            approvedDemoContent: approved.demoContent,
          }),
      // A proposal nobody reviewed is stored, never applied.
      ...(plan?.kind === 'deferred' ? { sitePlan: { draft: plan.draft } } : {}),
      ...(plan?.kind === 'reviewed'
        ? { sitePlan: { draft: plan.draft, decisions: plan.decisions } }
        : {}),
    },
    env,
  )

  printRecap(
    {
      answers,
      environment,
      resolvedBlueprint,
      scaffold,
      ...(keyValidation === undefined ? {} : { keyValidation }),
      ...(skinOutcome === undefined ? {} : { skinOutcome }),
      ...(plan === undefined ? {} : { plan }),
    },
    out,
  )

  return scaffold.migrateExitCode === 0 && scaffold.usersExitCode === 0 ? 0 : 1
}

function canPlan(llm: LlmSetup): boolean {
  return (
    llm.provider !== 'none' &&
    llm.apiKey !== undefined &&
    llm.apiKey !== '' &&
    llm.validation?.valid === true
  )
}

async function planFrom(input: {
  readonly documents: readonly ExtractedDocument[]
  readonly llm: LlmSetup
  readonly prompter: Prompter
  readonly out: Output
  readonly fetchImpl?: typeof fetch
}): Promise<PlanFlowOutcome | undefined> {
  if (input.documents.length === 0 || input.llm.provider === 'none') return undefined
  const provider = input.llm.provider
  return runPlanFlow({
    prompter: input.prompter,
    out: input.out,
    client: createProviderClient({
      provider,
      apiKey: input.llm.apiKey ?? '',
      model: input.llm.model ?? '',
      ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    }),
    model: input.llm.model ?? '',
    documents: input.documents,
  })
}

async function runDocumentStepInteractively(input: {
  readonly llm: LlmSetup
  readonly prompter: Prompter
  readonly out: Output
  readonly cwd: string
  readonly fetchImpl?: typeof fetch
}): Promise<PlanFlowOutcome | undefined> {
  // Never even asked without a working provider: a question whose only
  // possible answer is "no" is noise, and R2 means that answer must remain
  // a complete, unremarkable path through this installer.
  if (!canPlan(input.llm)) return undefined

  const collected = await collectDocuments({
    prompter: input.prompter,
    out: input.out,
    cwd: input.cwd,
  })
  return planFrom({ ...input, documents: collected.documents })
}

/**
 * `--config` with a `documents` list. The same analysis runs, but the review
 * cannot: `Prompter.confirm` answers its own default in a non-interactive
 * run, and `runPlanFlow`'s default is "do not review". The plan is therefore
 * saved as a draft, and the site is scaffolded exactly as the rest of the
 * config file describes.
 */
async function runDocumentStepFromConfig(input: {
  readonly answers: WizardAnswers
  readonly llm: LlmSetup
  readonly out: Output
  readonly cwd: string
  readonly fetchImpl?: typeof fetch
}): Promise<PlanFlowOutcome | undefined> {
  const paths = input.answers.documentPaths ?? []
  if (paths.length === 0) return undefined
  if (!canPlan(input.llm)) {
    input.out.warn(
      'Documents were listed but no working LLM provider is configured, so they were not read. The site was created from the rest of the config file.',
    )
    return undefined
  }

  const read = await readDocuments(paths, input.cwd)
  for (const failure of read.failures) input.out.bad(failure)
  if (read.documents.length === 0) return undefined

  return planFrom({
    documents: read.documents,
    llm: input.llm,
    out: input.out,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    // A prompter that always declines: this path must never claim consent.
    prompter: {
      async text(_question, defaultValue) {
        return defaultValue
      },
      async secret(_question) {
        return ''
      },
      async choice(_question, choices, defaultIndex) {
        return (choices[defaultIndex] ?? choices[0])?.value as never
      },
      async confirm(_question, defaultValue) {
        return defaultValue
      },
      close() {},
    },
  })
}

export type { SitePlanDraft }
