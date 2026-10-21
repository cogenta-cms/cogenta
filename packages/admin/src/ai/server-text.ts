import type { TFunction } from 'i18next'
import { ApiError } from '../api/http.js'

/**
 * Words the server writes in English — an error, a progress line, a design
 * direction — put into the reader's language.
 *
 * The server states *what* happened with a stable code (errors) or in a
 * sentence built from fixed templates (progress lines, notes). The admin owns
 * the reader's language, so it maps those back to its own translations. Every
 * lookup falls back to the server's own wording: a code or a sentence this
 * file has never met is shown as served, never hidden or replaced by a guess.
 */

export interface AiErrorDescription {
  readonly message: string
  readonly hint?: string
}

/**
 * Turns a caught value into text a person reads. A code with a translation
 * (`aiErrors.<CODE>`) is worded here; any other server error keeps the
 * server's message and hint, and a non-API failure uses `fallback`.
 */
export function describeAiError(caught: unknown, t: TFunction, fallback: string): AiErrorDescription {
  if (!(caught instanceof ApiError)) return { message: fallback }
  return describeAiFailure(caught, t)
}

/**
 * The same for a failure that did not travel as an HTTP error — a background
 * job that ended `failed` carries its code, message and hint in its record.
 * Without a code there is nothing to translate, so the fallback is shown.
 */
export function describeAiFailure(
  failure: {
    readonly code?: string
    readonly message: string
    readonly hint?: string | undefined
  },
  t: TFunction,
  fallback?: string,
): AiErrorDescription {
  if (failure.code === undefined) {
    return fallback === undefined
      ? { message: failure.message, ...(failure.hint === undefined ? {} : { hint: failure.hint }) }
      : { message: fallback }
  }
  const message = t(`aiErrors.${failure.code}.message`, { defaultValue: '' })
  if (message === '') {
    return { message: failure.message, ...(failure.hint === undefined ? {} : { hint: failure.hint }) }
  }
  const hint = t(`aiErrors.${failure.code}.hint`, { defaultValue: '' })
  return { message, ...(hint === '' ? {} : { hint }) }
}

/** `describeAiError` flattened to one string, for screens that keep a single error line. */
export function describeAiErrorLine(caught: unknown, t: TFunction, fallback: string): string {
  const { message, hint } = describeAiError(caught, t, fallback)
  return hint === undefined ? message : `${message} ${hint}`
}

interface Rule {
  readonly pattern: RegExp
  readonly key: string
  /** Names the capture groups, in order, as interpolation variables. */
  readonly vars?: readonly string[]
}

function applyRules(
  message: string,
  rules: readonly Rule[],
  namespace: string,
  t: TFunction,
  mapVar?: (name: string, value: string) => string,
): string {
  for (const rule of rules) {
    const match = rule.pattern.exec(message)
    if (match === null) continue
    const values: Record<string, string> = {}
    rule.vars?.forEach((name, index) => {
      const value = match[index + 1] ?? ''
      values[name] = mapVar === undefined ? value : mapVar(name, value)
    })
    const text = t(`${namespace}.${rule.key}`, { ...values, defaultValue: '' })
    if (text !== '') return text
  }
  return message
}

const PROGRESS_RULES: readonly Rule[] = [
  { pattern: /^Deciding whether this request needs a custom layout…?$/u, key: 'classify' },
  {
    pattern: /^Could not classify the request \(.*\) — defaulting to tokens only\.?$/u,
    key: 'classifyFailed',
  },
  { pattern: /^Custom layout needed: (.*)$/su, key: 'layoutNeeded', vars: ['reason'] },
  { pattern: /^Tokens are enough: (.*)$/su, key: 'tokensEnough', vars: ['reason'] },
  { pattern: /^Choosing a base theme…?$/u, key: 'chooseBase' },
  {
    pattern: /^Base theme chosen: (\S+)(?: \((.*)\))?$/su,
    key: 'baseChosen',
    vars: ['theme', 'reason'],
  },
  { pattern: /^Writing a custom layout into sandbox "(.*)"…?$/u, key: 'writeLayout', vars: ['id'] },
  { pattern: /^Generating "(.*)"…?$/u, key: 'generating', vars: ['label'] },
  {
    pattern: /^"(.*)" done \((\d+) attempts?\)\.?$/u,
    key: 'directionDone',
    vars: ['label', 'attempts'],
  },
  { pattern: /^"(.*)" failed: (.*)$/su, key: 'directionFailed', vars: ['label', 'reason'] },
  { pattern: /^Thinking…?$/u, key: 'thinking' },
  { pattern: /^Thinking… \(step (\d+)\)$/u, key: 'thinkingStep', vars: ['step'] },
  { pattern: /^Calling tool "(.*)"…?$/u, key: 'callingTool', vars: ['tool'] },
  { pattern: /^Tool "(.*)" finished\.?$/u, key: 'toolFinished', vars: ['tool'] },
  { pattern: /^Tool "(.*)" failed: (.*)$/su, key: 'toolFailed', vars: ['tool', 'reason'] },
  {
    pattern: /^Retrying after a provider error \(attempt (\d+)\/(\d+)\): (.*)$/su,
    key: 'retrying',
    vars: ['attempt', 'max', 'reason'],
  },
]

/** A progress line of a long job (theme generation, an agent run), in the reader's language. */
export function localizeProgress(message: string, t: TFunction): string {
  return applyRules(message, PROGRESS_RULES, 'aiProgress', t, (name, value) => {
    // A tool is named the way a person reads it, never by its identifier.
    if (name === 'tool') return toolName(value, t)
    if (name === 'label') return designDirection(value, t).label
    // `@cogenta/theme-canonical` → "Canonical": the package name is not for readers.
    if (name === 'theme') {
      const bare = value.replace(/^@[^/]+\/(theme-)?/u, '')
      return bare.charAt(0).toUpperCase() + bare.slice(1)
    }
    return value
  })
}

const PLAN_NOTE_RULES: readonly Rule[] = [
  {
    pattern:
      /^The document rules out (.+?): “(.*)”\. The proposed “(.+?)” (collection|taxonomy) was removed from the plan\.$/su,
    key: 'removedSection',
    vars: ['topic', 'quote', 'name', 'kind'],
  },
  {
    pattern:
      /^The document rules out (.+?): “(.*)”\. The proposed page “(.*)” was removed from the plan\.$/su,
    key: 'removedPage',
    vars: ['topic', 'quote', 'name'],
  },
  {
    pattern:
      /^The document limits the site to (.+?): “(.*)”\. (.+?) (?:was|were) removed from the plan\.$/su,
    key: 'removedLocales',
    vars: ['locales', 'quote', 'dropped'],
  },
  {
    pattern: /^The "(.*)" design was not offered: (.*)\.$/su,
    key: 'designNotOffered',
    vars: ['label'],
  },
  {
    pattern: /^A collection named "(.*)" was not proposed: (.*)\.$/su,
    key: 'collectionNotProposed',
    vars: ['name'],
  },
  {
    pattern: /^A demonstration entry for "(.*)" was dropped: (.*)\.$/su,
    key: 'demoDropped',
    vars: ['collection'],
  },
  { pattern: /^No demonstration content was proposed: (.*)\.$/su, key: 'noDemo' },
]

/** A warning or removal note the planner wrote, in the reader's language. */
export function localizePlanNote(text: string, t: TFunction): string {
  return applyRules(text, PLAN_NOTE_RULES, 'aiPlanNotes', t)
}

/** The report lines of an applied plan, from their stable codes. */
export function planFollowUp(key: string, count: number | undefined, t: TFunction): string {
  return t(`sitePlanReport.followUp.${key}`, { count: count ?? 0, defaultValue: '' })
}

export function planSkipReason(key: string | undefined, served: string, t: TFunction): string {
  if (key === undefined) return served
  const text = t(`sitePlanReport.skipped.${key}`, { defaultValue: '' })
  return text === '' ? served : text
}

const ASSIST_NOTE_RULES: readonly Rule[] = [
  {
    pattern: /^Suggested translation into (.+?)\.$/u,
    key: 'translation',
    vars: ['locale'],
  },
  {
    pattern: /^Written from the text around the image, not from the image itself/u,
    key: 'altText',
  },
]

/** The one-line note an assistant suggestion carries, in the reader's language. */
export function localizeAssistNote(note: string, t: TFunction): string {
  return applyRules(note, ASSIST_NOTE_RULES, 'aiAssistNotes', t)
}

/**
 * The name of a Cogenta tool as a person reads it (`content.list` → "Lister
 * les contenus"). A tool this admin has no word for — one a plugin or an MCP
 * connection brings — keeps its identifier.
 */
export function toolName(tool: string, t: TFunction): string {
  return t(`aiTools.${tool.replaceAll('.', '_')}`, { defaultValue: tool })
}

/** A built-in agent's name in the reader's language; a custom agent keeps the name it was given. */
export function agentDisplayName(name: string, builtin: boolean | undefined, t: TFunction): string {
  if (builtin !== true) return name
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return t(`aiAgentNames.${key}`, { defaultValue: name })
}

/** The five design directions of a site plan or theme proposal, by the label they ship with. */
export function designDirection(
  label: string,
  t: TFunction,
): { readonly label: string; readonly description: string | undefined } {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  const translated = t(`aiDesignDirections.${key}.label`, { defaultValue: '' })
  if (translated === '') return { label, description: undefined }
  return { label: translated, description: t(`aiDesignDirections.${key}.description`) }
}
