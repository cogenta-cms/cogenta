import { CogentaError } from '@cogenta/core'
import type { PromptTemplate, PromptTemplateStore } from './types.js'

/**
 * Fiche 45's known pitfall, verbatim: "un placeholder `{{champ}}` non résolu
 * doit échouer explicitement, jamais être envoyé tel quel au modèle." A
 * placeholder the caller did not supply a value for throws rather than being
 * left in the text (which would otherwise reach the model as literal
 * `{{targetLocale}}`, indistinguishable from real instruction text).
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu

export function renderPromptTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    if (!Object.hasOwn(vars, key)) {
      throw new CogentaError({
        code: 'PROMPT_TEMPLATE_PLACEHOLDER_UNRESOLVED',
        message: `The prompt template placeholder "{{${key}}}" has no value.`,
        hint: 'Every {{placeholder}} the template declares must be one this tool actually supplies — check the template against the tool it is used by.',
        details: { placeholder: key },
      })
    }
    return vars[key] ?? ''
  })
}

/**
 * The shape every migrated `assist.*` tool resolves before sending an
 * instruction to the model: a store-backed template when one exists for
 * `id`, the tool's own hard-coded string otherwise. `fallback` is a thunk
 * (not a plain string) so a site with no store configured at all pays
 * nothing beyond the exact call it already made — the fallback text is
 * built by the same inline logic the tool used before this fiche existed,
 * never routed through the template renderer, which is what keeps a
 * never-migrated site byte-for-byte unchanged (fiche 45 §4's acceptance
 * criterion).
 */
export interface ResolveInstructionOptions {
  readonly store: PromptTemplateStore | undefined
  readonly id: string
  readonly fallback: () => string
  readonly vars: Readonly<Record<string, string>>
}

export async function resolveInstruction(options: ResolveInstructionOptions): Promise<string> {
  if (options.store !== undefined) {
    const record = await options.store.get(options.id)
    if (record !== undefined) return renderPromptTemplate(record.template, options.vars).trim()
  }
  return options.fallback()
}

/** Renders a `PromptTemplate` on its own — used outside the `assist.*` tools (e.g. a future consumer resolving `generate_text_block` directly by id; `generate_agent_system_prompt` instead goes through `resolveInstruction` above, exactly like every other `assist.*` tool). */
export function renderTemplate(
  template: PromptTemplate,
  vars: Readonly<Record<string, string>>,
): string {
  return renderPromptTemplate(template.template, vars).trim()
}
