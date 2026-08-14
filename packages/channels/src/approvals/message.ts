import type { ApprovalRequest } from '@cogenta/agents'
import type { AlertChannelMessage } from '../adapter.js'
import { buildAlert } from '../formats/alert.js'

export interface RenderApprovalMessageOptions {
  readonly adminUrl: string
  readonly approveToken: string
  readonly denyToken: string
}

/**
 * "Le canal reçoit un message avec le diff résumé et deux actions :
 * approuver, refuser." `input` is summarised rather than dumped — a
 * `Report`-level wall of JSON is exactly what `## Formats de message`'s
 * "jamais plus d'un écran sans repli" rule exists to prevent; the full
 * input lives at `adminUrl`. Built through `buildAlert` (L6 task 6) rather
 * than the literal, so this call site gets the same required-field
 * validation every other alert producer gets, for free.
 */
export function renderApprovalMessage(
  request: ApprovalRequest,
  options: RenderApprovalMessageOptions,
): AlertChannelMessage {
  return buildAlert({
    title: `Approbation requise : ${request.toolName}`,
    severity: 'warning',
    context: `L'agent "${request.agentName}" demande à exécuter "${request.toolName}" : ${summariseInput(request.input)}`,
    expectedAction: 'Approuver ou refuser cette action avant qu’elle ne s’exécute.',
    adminUrl: options.adminUrl,
    // `action.id` becomes the literal command text a button press routes as
    // (`providers/telegram/render.ts`'s `callback_data: action.id`) — so it
    // must be a full `CommandRouter`-parseable string, not the bare token.
    actions: [
      { id: `approve ${options.approveToken}`, label: 'Approuver' },
      { id: `deny ${options.denyToken}`, label: 'Refuser' },
    ],
  })
}

function summariseInput(input: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return '(aucun paramètre)'
  const summary = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${truncate(String(value))}`)
    .join(', ')
  return entries.length > 3 ? `${summary}, …` : summary
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}
