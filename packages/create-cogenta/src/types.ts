import type { LlmProviderId } from './llm-setup.js'

/** What every wizard step (interactive, `--yes`, or `--config file`) converges on before scaffolding. */
export interface WizardAnswers {
  readonly targetDir: string
  readonly siteName: string
  readonly siteUrl: string
  readonly defaultLocale: string
  readonly blueprintId: string
  readonly databaseDriver: 'sqlite' | 'postgres' | 'mysql'
  readonly databaseUrl?: string
  readonly llmProvider: LlmProviderId
  readonly llmModel?: string
  readonly llmApiKey?: string
  readonly adminEmail: string
}

export function defaultAnswers(targetDir: string, siteName: string): WizardAnswers {
  return {
    targetDir,
    siteName,
    siteUrl: 'http://localhost:4000',
    defaultLocale: 'en',
    blueprintId: 'blank',
    databaseDriver: 'sqlite',
    llmProvider: 'none',
    adminEmail: 'admin@example.com',
  }
}
