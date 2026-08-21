import { CogentaError } from '@cogenta/core'
import type { ChannelIdentity, NotificationChannelMessage } from '../adapter.js'
import { REPORT_SCREEN_BUDGET_CHARS } from '../formats/budget.js'
import { buildNotification } from '../formats/notification.js'
import type { ChatHandler } from '../inbound/router.js'

/**
 * L22 task 2 — "conversation avec le superagent (ou un sous-agent nommé
 * explicitement) depuis un canal lié." The one rule this whole module exists
 * to keep, worded in the lot doc as "jamais un accès qui dépasse les
 * permissions du compte lié" : `@cogenta/agents`' `AgentRunner.run()` always
 * executes tool calls as a fixed `actor: {roles: ['admin', 'agent']}`
 * (`orchestrator.ts`'s `actorFor` — every run, whoever triggered it, gets
 * the same tool-level access; the *agent's own* declared `tools` list and
 * autonomy level are what actually bound a run, not the caller). Because
 * that is the one access boundary that exists today, the only honest way to
 * keep a channel from ever granting *more* than the linked account's own
 * standing (`## La règle de sécurité centrale`) is to require the identity
 * hold, at the Cogenta-account level, the same role `/api/agents/:name/run`
 * itself already requires — `admin` (`agents-router.ts`'s `requireAdmin`).
 * A linked non-admin account is refused before the runner is ever called,
 * exactly like it would be refused calling the HTTP route directly.
 *
 * Structural, and deliberately the *simple* three-argument shape
 * `@cogenta/api`'s own `AgentRunnerLike` (`agents-router.ts`) declares —
 * never `@cogenta/agents`' raw `AgentRunner['run'](name, {instruction, …})`
 * options-object form. Every caller in L22 task 2's surface (this bridge,
 * the admin's floating chat widget, `POST /api/agents/:name/run` itself)
 * therefore shares one request shape, not two.
 */
export interface AgentRunnerLike {
  run(
    name: string,
    instruction: string,
    trigger?: string,
  ): Promise<{ readonly finalText: string | null }>
}

/** Structural mirror of `@cogenta/agents`' `AgentRegistryLike.get`, narrowed to the one thing this bridge needs: does a name exist at all, so an unknown `@mention` gets a clear reply instead of `AGENT_UNKNOWN` bubbling out of the runner. */
export interface AgentLookupLike {
  has(name: string): boolean
}

export interface AgentChatBridgeOptions {
  readonly runner: AgentRunnerLike
  readonly agents: AgentLookupLike
  /** The agent a plain message (no `@Name:` prefix) talks to — normally `SUPERAGENT_NAME` from `@cogenta/agents`. */
  readonly defaultAgentName: string
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  /** How this bridge replies — the channel of origin, since `route()` itself never sends anything (see `inbound/router.ts`'s `RouteResult`; same convention as `approvals/commands.ts`'s `reply`). */
  readonly reply: (identity: ChannelIdentity, message: NotificationChannelMessage) => Promise<void>
  readonly channelName: string
  /** Defaults to `['admin']` — see the module doc comment for why this is not configurable to something looser without also loosening what `AgentRunner.run()` itself grants. */
  readonly requiredRoles?: readonly string[]
}

const MENTION = /^@([^:]+):\s*([\s\S]*)$/u

function resolveTarget(
  text: string,
  defaultAgentName: string,
  agents: AgentLookupLike,
): { readonly agentName: string; readonly message: string; readonly unknownMention?: string } {
  const match = MENTION.exec(text.trim())
  if (match === null) return { agentName: defaultAgentName, message: text.trim() }
  const [, rawName, rawRest] = match
  const name = (rawName ?? '').trim()
  const rest = (rawRest ?? '').trim()
  if (name.length === 0 || !agents.has(name)) {
    return { agentName: defaultAgentName, message: rest, unknownMention: name }
  }
  return { agentName: name, message: rest }
}

/**
 * A chat answer is conversational, potentially long and multi-line — neither
 * fits `NotificationChannelMessage` unmodified (`buildNotification` refuses
 * more than one line, "Une ligne" being the whole point of that level) nor
 * `ReportChannelMessage` (needs a title and at least one key figure, which a
 * free-text answer has neither of). Rather than stretch either type to a
 * shape its own validation says it is not, this flattens to one line and
 * truncates to the same screen budget `buildReport` enforces elsewhere
 * (`REPORT_SCREEN_BUDGET_CHARS`) — the closest honest fit among the three
 * existing levels, not a fourth level invented for this one call site.
 */
export function formatChatReply(text: string): NotificationChannelMessage {
  const flattened = text.replace(/\s*\n+\s*/gu, ' ').trim()
  const body = flattened.length === 0 ? '(no response)' : flattened
  const truncated =
    body.length > REPORT_SCREEN_BUDGET_CHARS
      ? `${body.slice(0, REPORT_SCREEN_BUDGET_CHARS - 1).trimEnd()}…`
      : body
  return buildNotification(truncated)
}

/**
 * Builds the `chat` fallback `createCommandRouter` accepts — the same
 * `{requiredRoles, handler}` shape `CommandRouterOptions.chat` declares, so
 * wiring this in is `createCommandRouter({ getUserRoles, chat: createAgentChatBridge(...) })`
 * and nothing more.
 */
export function createAgentChatBridge(options: AgentChatBridgeOptions): {
  readonly requiredRoles: readonly string[]
  readonly handler: ChatHandler
} {
  const requiredRoles = options.requiredRoles ?? ['admin']

  return {
    requiredRoles,
    async handler({ identity, text }) {
      const { agentName, message, unknownMention } = resolveTarget(
        text,
        options.defaultAgentName,
        options.agents,
      )

      if (unknownMention !== undefined) {
        await options.reply(
          identity,
          formatChatReply(
            `Unknown agent "${unknownMention}" — talking to ${options.defaultAgentName} instead. Use "@Agent Name: message" with a name from the admin's Agents screen.`,
          ),
        )
      }

      if (message.length === 0) {
        await options.reply(
          identity,
          formatChatReply(
            'Send a message after the agent name, e.g. "hello" or "@Agent Name: hello".',
          ),
        )
        return
      }

      try {
        const summary = await options.runner.run(
          agentName,
          message,
          `channel:${options.channelName}`,
        )
        await options.reply(identity, formatChatReply(summary.finalText ?? '(no response)'))
      } catch (error) {
        const errorText =
          error instanceof CogentaError
            ? error.message
            : 'The agent could not complete this request.'
        await options.reply(identity, formatChatReply(errorText))
      }
    },
  }
}
