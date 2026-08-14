import { basename, resolve as resolvePath } from 'node:path'
import { parseArgs } from 'node:util'
import { createOutput, shouldUseColour, type Writer } from '@cogenta/cli'
import { createDefaultsPrompter, createInteractivePrompter } from './prompts.js'
import { runWizard } from './wizard.js'

export type {
  BlueprintContentPack,
  RecommendedAgentHint,
  SeedDemoContent,
} from './blueprints/content-pack.js'
export { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
export type { Blueprint, ResolvedBlueprint } from './blueprints/registry.js'
export { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint } from './blueprints/registry.js'
export { ConfigFileError, loadConfigFile } from './config-file.js'
export type { CheckStatus, EnvironmentCheck, EnvironmentReport } from './environment.js'
export { checkEnvironment } from './environment.js'
export type {
  CreateProviderClientOptions,
  LlmProviderId,
  LlmProviderOption,
  ValidateKeyOptions,
  ValidateKeyResult,
} from './llm-setup.js'
export { createProviderClient, LLM_PROVIDERS, validateApiKey } from './llm-setup.js'
export type { ResetPlaygroundDataOptions } from './playground-reset.js'
export { resetPlaygroundData } from './playground-reset.js'
export type { Choice, Prompter, PromptIO } from './prompts.js'
export { createDefaultsPrompter, createInteractivePrompter } from './prompts.js'
export { printRecap } from './recap.js'
export type { ScaffoldAnswers, ScaffoldResult } from './scaffold.js'
export { scaffoldSite } from './scaffold.js'
export type { ChooseSkinOptions, SkinOutcome } from './skin-flow.js'
export { chooseSkin } from './skin-flow.js'
export type { SkinPreviewPage } from './skin-preview.js'
export { renderSkinPreview } from './skin-preview.js'
export type { WizardAnswers } from './types.js'
export { defaultAnswers } from './types.js'
export type { RunWizardOptions } from './wizard.js'
export { runWizard } from './wizard.js'

const USAGE = `create-cogenta — scaffold a new Cogenta site

Usage
  npm create cogenta [directory] [options]

Options
  --yes                Accept every default, no questions asked
  --config <file>       Install non-interactively from a JSON config file
  --no-color            Never colour the output (NO_COLOR is honoured too)
`

export interface RunOptions {
  readonly argv: readonly string[]
  readonly cwd?: string
  readonly stdout?: Writer
  readonly stderr?: Writer
  readonly stdin?: NodeJS.ReadableStream
  readonly env?: Record<string, string | undefined>
  readonly isTty?: boolean
}

/** Mirrors `@cogenta/cli`'s own `run()`: nothing here calls `process.exit` or writes to a stream directly, so the whole wizard is testable without spawning a process. */
export async function run(options: RunOptions): Promise<number> {
  const env = options.env ?? process.env
  const stdout = options.stdout ?? ((text) => void process.stdout.write(text))
  const stderr = options.stderr ?? ((text) => void process.stderr.write(text))

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...options.argv],
      allowPositionals: true,
      strict: true,
      options: {
        yes: { type: 'boolean' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 2
  }

  if (parsed.values.help === true) {
    stdout(USAGE)
    return 0
  }

  const colour =
    parsed.values['no-color'] === true ? false : shouldUseColour(env, options.isTty ?? false)
  const out = createOutput(stdout, colour)

  const cwd = options.cwd ?? process.cwd()
  const targetArg = parsed.positionals[0] ?? '.'
  const targetDir = resolvePath(cwd, targetArg)
  const siteName = targetArg === '.' ? basename(cwd) : basename(targetArg)

  // `--config` never prompts at all — building an interactive readline
  // interface for it would needlessly hold stdin open.
  const useYes = parsed.values.yes === true || typeof parsed.values.config === 'string'
  const prompter = useYes
    ? createDefaultsPrompter()
    : createInteractivePrompter({ input: options.stdin ?? process.stdin, output: process.stdout })

  return runWizard({
    targetDir,
    siteName,
    prompter,
    out,
    env,
    ...(typeof parsed.values.config === 'string'
      ? { configPath: resolvePath(cwd, parsed.values.config) }
      : {}),
  })
}
