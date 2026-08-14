import type { ChatMessage } from '../providers/types.js'
import { CONSTITUTION_TEXT } from './constitution.js'

export interface SiteContext {
  readonly name: string
  readonly brand?: string
  readonly tone?: string
  readonly locales: readonly string[]
  readonly constraints?: readonly string[]
}

export interface AgentIdentity {
  readonly name: string
  readonly role: string
  readonly objectives: readonly string[]
  readonly style?: string
}

export interface TaskContext {
  readonly instruction: string
}

/**
 * One piece of untrusted content — a comment, an import, a fetched page
 * (R8: "Tout contenu externe... est balisé comme tel"). `source` is shown to
 * the model so it can reason about provenance, never to grant trust: it goes
 * through the same escaping as `content`.
 */
export interface DataItem {
  readonly source: string
  readonly content: string
}

export interface AssembleContextInput {
  readonly site: SiteContext
  readonly agent: AgentIdentity
  readonly task: TaskContext
  readonly data?: readonly DataItem[]
}

export interface AssembledContext {
  /** CONSTITUTION → SITE → AGENT → TASK, in that fixed order — this is `ChatRequest.system`. */
  readonly system: string
  /** DATA, one tagged message per item, appended after `system` — never merged into it. */
  readonly dataMessages: readonly ChatMessage[]
}

/**
 * Neutralises `<` and `>` so untrusted content can never introduce a tag of
 * its own — not just a fake `</data>` to escape early, but a fake `<task>`,
 * `<agent>`, or `<constitution>` too. Every real tag in the assembled
 * context comes from this module; after escaping, none can originate from
 * `content` or `source`.
 */
function escapeForTag(value: string): string {
  return value.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function tag(name: string, body: string, attrs?: Readonly<Record<string, string>>): string {
  const attrText =
    attrs === undefined
      ? ''
      : Object.entries(attrs)
          .map(([key, value]) => ` ${key}="${escapeForTag(value)}"`)
          .join('')
  return `<${name}${attrText}>\n${body}\n</${name}>`
}

function siteSection(site: SiteContext): string {
  const lines = [
    `Name: ${site.name}`,
    ...(site.brand === undefined ? [] : [`Brand: ${site.brand}`]),
    ...(site.tone === undefined ? [] : [`Tone: ${site.tone}`]),
    `Locales: ${site.locales.join(', ')}`,
    ...(site.constraints === undefined || site.constraints.length === 0
      ? []
      : [`Constraints:\n${site.constraints.map((c) => `- ${c}`).join('\n')}`]),
  ]
  return lines.join('\n')
}

function agentSection(agent: AgentIdentity): string {
  const lines = [
    `Name: ${agent.name}`,
    `Role: ${agent.role}`,
    `Objectives:\n${agent.objectives.map((o) => `- ${o}`).join('\n')}`,
    ...(agent.style === undefined ? [] : [`Style: ${agent.style}`]),
  ]
  return lines.join('\n')
}

/**
 * Assembles the fixed-order, explicitly-tagged context L4 requires. Callers
 * supply everything except the constitution — the one level with no
 * override path — and any external content, which is threaded through as
 * separate `dataMessages`, never concatenated into `system`, so it can never
 * be mistaken for part of the instruction stack even before escaping is
 * considered.
 */
export function assembleContext(input: AssembleContextInput): AssembledContext {
  const system = [
    tag('constitution', CONSTITUTION_TEXT),
    tag('site', siteSection(input.site)),
    tag('agent', agentSection(input.agent)),
    // Not escaped: unlike `data`, a task instruction is runtime-generated
    // (a trigger, an operator, a schedule), not external content — R8 only
    // requires balisage for content that entered from a comment, import, or
    // fetch, and escaping trusted text would just mangle a literal `<`/`>`
    // it legitimately needed to contain (code samples, JSX, comparisons).
    tag('task', input.task.instruction),
  ].join('\n\n')

  const dataMessages: ChatMessage[] = (input.data ?? []).map((item) => ({
    role: 'user',
    content: tag('data', escapeForTag(item.content), { source: item.source }),
  }))

  return { system, dataMessages }
}
