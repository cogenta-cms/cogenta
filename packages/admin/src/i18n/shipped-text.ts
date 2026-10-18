import type { TFunction } from 'i18next'
import en from './locales/en.json'
import SHIPPED_AGENT_ROLES from './shipped-agent-roles.json'

/**
 * Words Cogenta ships as data — a built-in prompt's name and description, an
 * admin skin's description — reach the admin in English, from the server. They
 * are still Cogenta's own words, so the admin shows them in the reader's
 * language, but only while they are untouched: a site owner who rewrote a
 * description reads their own text, never a translation of the original.
 *
 * `key` is a path under `shippedText` in the locale files; the English file
 * holds the exact text the server ships, which is what "untouched" is checked
 * against.
 */
export function shippedText(key: string, served: string, t: TFunction): string {
  const shipped = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      (en as { shippedText: unknown }).shippedText,
    )
  return shipped === served ? t(`shippedText.${key}`) : served
}

/**
 * A built-in agent's role is written for the model — tool names, the
 * constraints it must keep — and it was the line shown under the agent's
 * name. While it is the role Cogenta shipped, the page shows a short summary
 * written for a person instead, in the reader's language; an edited role is
 * the owner's own words and is shown as they wrote it.
 */
export function agentSummary(name: string, role: string, t: TFunction): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return (SHIPPED_AGENT_ROLES as Record<string, string | undefined>)[key] === role
    ? t(`shippedText.agents.${key}.summary`)
    : role
}
