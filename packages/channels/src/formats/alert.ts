import { CogentaError } from '@cogenta/core'
import type { AlertChannelMessage, ChannelAction, ChannelSeverity } from '../adapter.js'

export interface BuildAlertInput {
  readonly title: string
  readonly severity: ChannelSeverity
  readonly context: string
  readonly expectedAction: string
  readonly adminUrl: string
  readonly actions?: readonly ChannelAction[]
}

function requireNonEmpty(field: string, value: string): void {
  if (value.trim().length > 0) return
  throw new CogentaError({
    code: 'CHANNEL_MESSAGE_INVALID',
    message: `An alert message's "${field}" cannot be empty.`,
    hint: '"Titre, gravité, une phrase de contexte, l\'action attendue, un lien vers l\'admin" are all required — fill in every field before dispatching.',
    details: { field },
  })
}

function requireUrl(field: string, value: string): void {
  try {
    const parsed = new URL(value)
    void parsed
  } catch (cause) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: `An alert message's "${field}" is not a valid URL: "${value}".`,
      hint: "Pass an absolute URL, e.g. the entry's real admin edit link.",
      details: { field, value },
      cause,
    })
  }
}

/**
 * "Alerte — quelque chose demande une action. Titre, gravité, une phrase de
 * contexte, l'action attendue, un lien vers l'admin." The one required
 * constructor for every alert this package (or an agent) dispatches — never
 * hand-assemble the discriminated union literal, so this validation cannot
 * be skipped by a new call site.
 */
export function buildAlert(input: BuildAlertInput): AlertChannelMessage {
  requireNonEmpty('title', input.title)
  requireNonEmpty('context', input.context)
  requireNonEmpty('expectedAction', input.expectedAction)
  requireUrl('adminUrl', input.adminUrl)

  return {
    level: 'alert',
    title: input.title,
    severity: input.severity,
    context: input.context,
    expectedAction: input.expectedAction,
    adminUrl: input.adminUrl,
    ...(input.actions === undefined ? {} : { actions: input.actions }),
  }
}
