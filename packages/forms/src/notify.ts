import {
  type AlertChannelMessage,
  type ChannelRegistry,
  createEmailAdapter,
  type EmailTransport,
} from '@cogenta/channels'
import { CogentaError, type RateLimitDriver } from '@cogenta/core'
import type { FormDefinition, FormNotifyChannel, FormSubmission } from './types.js'

/**
 * Notifications for a new submission — "réutiliser l'adaptateur e-mail
 * existant de `@cogenta/channels`, jamais un second transport" (ADR-0026).
 *
 * The message goes through the same `AlertChannelMessage` shape and
 * `createEmailAdapter` every other alert in this codebase already renders
 * through (fiche 16 task 5: "réutiliser les formats de message de
 * `@cogenta/channels`... plutôt qu'en inventant un message") — this file
 * never writes its own subject/body HTML, it only describes *what happened*
 * and lets the adapter decide how that becomes an e-mail.
 */

function fieldSummary(definition: FormDefinition, submission: FormSubmission): string {
  const lines = definition.fields
    .filter((field) => field.kind !== 'consent')
    .map((field) => {
      const value = submission.values[field.name]
      const text = Array.isArray(value) ? value.join(', ') : (value ?? '')
      return `${field.label}: ${text === '' ? '(empty)' : text}`
    })
  return lines.join('\n')
}

export function buildSubmissionAlert(
  definition: FormDefinition,
  submission: FormSubmission,
  adminUrl: string,
): AlertChannelMessage {
  return {
    level: 'alert',
    title: `New submission — ${definition.label}`,
    severity: 'info',
    // The submission's own field values, verbatim — this is external content
    // (R8), but the destination here is a rendered e-mail read by a human,
    // never an agent's prompt, so a plain, clearly-labelled dump is the
    // right shape rather than a structured `data` channel meant for a model.
    context: fieldSummary(definition, submission),
    expectedAction: 'Review the submission in the admin.',
    adminUrl,
  }
}

export interface NotifyNewSubmissionOptions {
  readonly transport: EmailTransport
  readonly definition: FormDefinition
  readonly submission: FormSubmission
  readonly adminUrl: string
}

/** Sends the "new submission" e-mail to every configured recipient. Never throws on a single bad address — logs are the caller's job, this returns what happened. */
export async function notifyNewSubmission(
  options: NotifyNewSubmissionOptions,
): Promise<{ readonly sent: readonly string[]; readonly failed: readonly string[] }> {
  if (options.definition.notifyEmails.length === 0) return { sent: [], failed: [] }

  const adapter = createEmailAdapter({ transport: options.transport })
  const message = buildSubmissionAlert(options.definition, options.submission, options.adminUrl)

  const sent: string[] = []
  const failed: string[] = []
  for (const email of options.definition.notifyEmails) {
    try {
      await adapter.send({ id: email }, message)
      sent.push(email)
    } catch {
      failed.push(email)
    }
  }
  return { sent, failed }
}

export interface NotifyChannelsOptions {
  readonly registry: ChannelRegistry
  readonly definition: FormDefinition
  readonly submission: FormSubmission
  readonly adminUrl: string
}

/**
 * Fiche 47 task 4 — the multi-channel half of a submission notification,
 * built the same way `notifyNewSubmission` builds the e-mail one: reusing
 * `buildSubmissionAlert` (never a second message shape) and the adapters
 * `@cogenta/channels` already has, never a new transport of this package's
 * own (R1/R9). A channel this form names but the site never configured (no
 * live adapter of that name in the registry), or a channel whose `send`
 * itself fails, is recorded as `failed` and every other configured channel
 * still gets tried — the same "never throws on one bad recipient" contract
 * `notifyNewSubmission` already holds for e-mail addresses.
 */
export async function notifyChannels(options: NotifyChannelsOptions): Promise<{
  readonly sent: readonly FormNotifyChannel[]
  readonly failed: readonly FormNotifyChannel[]
}> {
  if (options.definition.notifyChannels.length === 0) return { sent: [], failed: [] }

  const message = buildSubmissionAlert(options.definition, options.submission, options.adminUrl)
  const sent: FormNotifyChannel[] = []
  const failed: FormNotifyChannel[] = []

  for (const entry of options.definition.notifyChannels) {
    if (!options.registry.has(entry.channel)) {
      failed.push(entry)
      continue
    }
    try {
      await options.registry.get(entry.channel).send({ id: entry.target }, message)
      sent.push(entry)
    } catch {
      failed.push(entry)
    }
  }
  return { sent, failed }
}

const AUTORESPONDER_WINDOW_MS = 60 * 60 * 1000
const AUTORESPONDER_LIMIT_PER_WINDOW = 1

/**
 * The autoresponder — disabled by default, and rate-limited **per recipient
 * address** on top of the generic per-IP submission limiter, because the
 * address here was supplied by an anonymous visitor: without a hard cap this
 * is a script that makes the site's domain send mail to any inbox it likes,
 * on demand (fiche 16 § pièges: "l'accusé de réception est un relais de
 * spam potentiel").
 */
export interface SendAutoresponderOptions {
  readonly transport: EmailTransport
  readonly definition: FormDefinition
  readonly recipientEmail: string
  readonly rateLimit: RateLimitDriver
}

export async function sendAutoresponder(options: SendAutoresponderOptions): Promise<void> {
  const { definition } = options
  if (!definition.autoresponder.enabled) return

  const key = `forms:autoresponder:${definition.id}:${options.recipientEmail.toLowerCase()}`
  const result = await options.rateLimit.consume(key, {
    limit: AUTORESPONDER_LIMIT_PER_WINDOW,
    windowMs: AUTORESPONDER_WINDOW_MS,
  })
  if (!result.allowed) {
    throw new CogentaError({
      code: 'FORM_AUTORESPONDER_RATE_LIMITED',
      message: `An autoresponder was already sent to this address for "${definition.name}" recently.`,
      hint: 'This is a deliberate cap — it exists to stop this form from being used to relay mail to an arbitrary inbox.',
    })
  }

  const adapter = createEmailAdapter({ transport: options.transport })
  await adapter.send(
    { id: options.recipientEmail },
    {
      level: 'notification',
      text: options.definition.autoresponder.body ?? 'Thank you — we received your message.',
    },
  )
}
