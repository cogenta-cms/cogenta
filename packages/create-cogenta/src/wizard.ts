import type { Output } from '@cogenta/cli'
import { BLUEPRINTS, resolveBlueprint } from './blueprints/registry.js'
import { loadConfigFile } from './config-file.js'
import { checkEnvironment } from './environment.js'
import { LLM_PROVIDERS, type LlmProviderId, validateApiKey } from './llm-setup.js'
import type { Prompter } from './prompts.js'
import { printRecap } from './recap.js'
import { scaffoldSite } from './scaffold.js'
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
  if (llmChoice !== 'none') {
    const option = LLM_PROVIDERS.find((entry) => entry.id === llmChoice)
    llmModel = await prompter.text('Model', option?.defaultModel ?? '')
    llmApiKey = await prompter.text('API key', '')
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
  prompter.close()

  const resolvedBlueprint = resolveBlueprint(answers.blueprintId)

  let keyValidation: Awaited<ReturnType<typeof validateApiKey>> | undefined
  if (
    answers.llmProvider !== 'none' &&
    answers.llmApiKey !== undefined &&
    answers.llmApiKey !== ''
  ) {
    const option = LLM_PROVIDERS.find((entry) => entry.id === answers.llmProvider)
    keyValidation = await validateApiKey({
      provider: answers.llmProvider,
      apiKey: answers.llmApiKey,
      model: answers.llmModel ?? option?.defaultModel ?? '',
    })
  }

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
    },
    out,
  )

  return scaffold.migrateExitCode === 0 && scaffold.usersExitCode === 0 ? 0 : 1
}
