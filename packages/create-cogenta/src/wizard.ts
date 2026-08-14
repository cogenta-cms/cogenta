import type { Output } from '@cogenta/cli'
import { BLUEPRINTS, resolveBlueprint } from './blueprints/registry.js'
import { loadConfigFile } from './config-file.js'
import { checkEnvironment } from './environment.js'
import {
  createProviderClient,
  LLM_PROVIDERS,
  type LlmProviderId,
  validateApiKey,
} from './llm-setup.js'
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
}

async function collectAnswers(
  prompter: Prompter,
  targetDir: string,
  siteName: string,
  detectedDatabases: EnvironmentDetected,
): Promise<WizardAnswers> {
  const defaults = defaultAnswers(targetDir, siteName)

  const name = await prompter.text('Site name', defaults.siteName)
  const url = await prompter.text('Site URL', defaults.siteUrl)
  const locale = await prompter.text('Primary language (locale code)', defaults.defaultLocale)

  const blueprintId = await prompter.choice(
    'Site type',
    BLUEPRINTS.map((entry) => ({ label: entry.label, value: entry.id })),
    0,
  )

  const databaseChoices: readonly { label: string; value: WizardAnswers['databaseDriver'] }[] = [
    { label: 'SQLite (default — you can change this later)', value: 'sqlite' },
    ...(detectedDatabases.postgres
      ? [{ label: 'Postgres (detected)', value: 'postgres' as const }]
      : []),
    ...(detectedDatabases.mysql ? [{ label: 'MySQL (detected)', value: 'mysql' as const }] : []),
  ]
  const databaseDriver = await prompter.choice('Database', databaseChoices, 0)

  const llmChoice = await prompter.choice<LlmProviderId>(
    'LLM provider',
    LLM_PROVIDERS.map((entry) => ({ label: entry.label, value: entry.id })),
    0,
  )

  let llmModel: string | undefined
  let llmApiKey: string | undefined
  let siteDescription: string | undefined
  if (llmChoice !== 'none') {
    const option = LLM_PROVIDERS.find((entry) => entry.id === llmChoice)
    llmModel = await prompter.text('Model', option?.defaultModel ?? '')
    llmApiKey = await prompter.text('API key', '')
    siteDescription = await prompter.text(
      'Site description for AI skin generation (sector, mood, audience, brand colours — leave blank to skip and keep the default skin)',
      '',
    )
  }

  const adminEmail = await prompter.text('Admin email', defaults.adminEmail)

  return {
    ...defaults,
    siteName: name,
    siteUrl: url,
    defaultLocale: locale,
    blueprintId,
    databaseDriver,
    llmProvider: llmChoice,
    ...(llmModel === undefined || llmModel === '' ? {} : { llmModel }),
    ...(llmApiKey === undefined || llmApiKey === '' ? {} : { llmApiKey }),
    ...(siteDescription === undefined || siteDescription === '' ? {} : { siteDescription }),
    adminEmail,
  }
}

interface EnvironmentDetected {
  readonly postgres: boolean
  readonly mysql: boolean
}

/**
 * The whole ten-step wizard, orchestrated. Returns a process exit code: `0`
 * a working site, `1` the environment or the install failed, `2` a `--config`
 * file was invalid.
 */
export async function runWizard(options: RunWizardOptions): Promise<number> {
  const { out, prompter } = options
  const env = options.env ?? process.env

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
  if (options.configPath !== undefined) {
    try {
      answers = await loadConfigFile(options.configPath, options.targetDir)
    } catch (error) {
      out.bad(error instanceof Error ? error.message : String(error))
      prompter.close()
      return 2
    }
  } else {
    answers = await collectAnswers(prompter, options.targetDir, options.siteName, {
      postgres: environment.detectedDatabases.includes('postgres'),
      mysql: environment.detectedDatabases.includes('mysql'),
    })
  }
  const resolvedBlueprint = resolveBlueprint(answers.blueprintId)

  let keyValidation: Awaited<ReturnType<typeof validateApiKey>> | undefined
  let llmModel = ''
  if (
    answers.llmProvider !== 'none' &&
    answers.llmApiKey !== undefined &&
    answers.llmApiKey !== ''
  ) {
    const option = LLM_PROVIDERS.find((entry) => entry.id === answers.llmProvider)
    llmModel = answers.llmModel ?? option?.defaultModel ?? ''
    keyValidation = await validateApiKey({
      provider: answers.llmProvider,
      apiKey: answers.llmApiKey,
      model: llmModel,
    })
  }

  // "Aperçu proposé sur trois pages types, avec possibilité de régénérer ou
  // d'ajuster" (L9 task 7) needs the prompter, so it stays open until here —
  // only `blog` writes a `theme.tokens.json` a generated skin could replace.
  let skinOutcome: SkinOutcome | undefined
  if (
    resolvedBlueprint.blueprint.id === 'blog' &&
    answers.llmProvider !== 'none' &&
    answers.llmApiKey !== undefined &&
    answers.llmApiKey !== '' &&
    keyValidation?.valid === true &&
    answers.siteDescription !== undefined &&
    answers.siteDescription !== ''
  ) {
    out.heading('Skin generation')
    skinOutcome = await chooseSkin({
      prompter,
      out,
      client: createProviderClient({
        provider: answers.llmProvider,
        apiKey: answers.llmApiKey,
        model: llmModel,
      }),
      model: llmModel,
      description: answers.siteDescription,
      blueprintLabel: resolvedBlueprint.blueprint.label,
      siteName: answers.siteName,
      targetDir: answers.targetDir,
    })
  }
  prompter.close()

  const scaffold = await scaffoldSite(
    {
      targetDir: answers.targetDir,
      siteName: answers.siteName,
      siteUrl: answers.siteUrl,
      defaultLocale: answers.defaultLocale,
      databaseDriver: answers.databaseDriver,
      ...(answers.databaseUrl === undefined ? {} : { databaseUrl: answers.databaseUrl }),
      ...(answers.llmProvider === 'none'
        ? {}
        : { llm: { provider: answers.llmProvider, model: answers.llmModel ?? '' } }),
      adminEmail: answers.adminEmail,
      blueprintId: resolvedBlueprint.blueprint.id,
      ...(skinOutcome?.kind === 'generated' ? { skinTokens: skinOutcome.tokens } : {}),
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
    },
    out,
  )

  return scaffold.migrateExitCode === 0 && scaffold.usersExitCode === 0 ? 0 : 1
}
