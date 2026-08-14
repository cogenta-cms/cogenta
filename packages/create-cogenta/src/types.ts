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
  /** Free text (sector, mood, audience, brand colours) driving AI skin generation (L9 task 7). Empty or absent: generation is skipped, the default skin is used. */
  readonly siteDescription?: string
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
