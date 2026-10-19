import type { TFunction } from 'i18next'

/**
 * The assistant tools Cogenta itself ships. Their name and description are
 * interface text, translated like the rest of the admin; the server's English
 * `label`/`description` is only what a client without translations falls back
 * on. A tool a plugin or a third party provides keeps the words its author
 * wrote, since nobody here can translate them.
 */
export const BUILTIN_TOOLS: ReadonlySet<string> = new Set([
  'assist.rewrite',
  'assist.proofread',
  'assist.summarise',
  'assist.translate',
  'assist.meta_description',
  'assist.titles',
  'assist.tags',
  'assist.alt_text',
  'assist.generate_image',
  'assist.chat',
  'assist.classify',
  'assist.find_duplicates',
  'assist.moderate',
  'assist.faq_draft',
  'assist.schema_org_draft',
  'assist.generate_agent_identity',
])

interface ToolText {
  readonly tool: string
  readonly label: string
  readonly description: string
}

export function toolLabel(tool: Pick<ToolText, 'tool' | 'label'>, t: TFunction): string {
  return BUILTIN_TOOLS.has(tool.tool)
    ? t(`assistant.builtinTools.${tool.tool.slice('assist.'.length)}.label`)
    : tool.label
}

export function toolDescription(
  tool: Pick<ToolText, 'tool' | 'description'>,
  t: TFunction,
): string {
  return BUILTIN_TOOLS.has(tool.tool)
    ? t(`assistant.builtinTools.${tool.tool.slice('assist.'.length)}.description`)
    : tool.description
}
