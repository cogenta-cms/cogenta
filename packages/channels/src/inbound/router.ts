import { CogentaError } from '@cogenta/core'
import type { ChannelIdentity } from '../adapter.js'
import { authorizeInboundCommand } from './authorize.js'

/**
 * A structured inbound command, never free text handed to an agent —
 * "conversation libre avec un agent depuis le canal" is explicitly hors
 * périmètre (`## Hors périmètre`). `/approve 3f2c` parses to
 * `{name: 'approve', args: ['3f2c']}`.
 */
export interface ParsedCommand {
  readonly name: string
  readonly args: readonly string[]
}

/** Whitespace-separated; a leading `/` is optional and stripped if present. */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  const [rawName, ...args] = trimmed.split(/\s+/)
  if (rawName === undefined) return null
  const name = rawName.startsWith('/') ? rawName.slice(1) : rawName
  if (name.length === 0) return null
  return { name, args }
}

export interface CommandHandlerInput {
  readonly args: readonly string[]
  /** The identified human this command runs as — never the agent's identity. */
  readonly userId: string
  readonly identity: ChannelIdentity
}

export type CommandHandler = (input: CommandHandlerInput) => Promise<void> | void

export interface RegisteredCommand {
  readonly name: string
  /** Open role-name list, same convention as `CollectionDefinition.permissions` — empty means "any linked user". */
  readonly requiredRoles: readonly string[]
  readonly handler: CommandHandler
}

/**
 * What `route()` did with an inbound command, so a channel adapter knows
 * exactly whether — and what — to reply. `shouldReply: false` on an
 * unlinked identity is the one case a caller must be able to implement by
 * doing nothing; every other case is safe to surface to the sender.
 */
export type RouteResult =
  | { readonly kind: 'unlinked'; readonly shouldReply: false }
  | { readonly kind: 'forbidden'; readonly shouldReply: true; readonly userId: string }
  | { readonly kind: 'unrecognized'; readonly shouldReply: true; readonly commandName: string }
  | { readonly kind: 'invalid'; readonly shouldReply: false }
  | { readonly kind: 'handled'; readonly shouldReply: false; readonly userId: string }

export interface CommandRouter {
  register(command: RegisteredCommand): void
  route(text: string, identity: ChannelIdentity): Promise<RouteResult>
}

/**
 * A chat message's handler receives the raw, un-reparsed `text` in addition
 * to everything a structured command's handler gets — free conversation has
 * no `name`/`args` split to preserve, unlike `/approve 3f2c`.
 */
export type ChatHandler = (
  input: CommandHandlerInput & { readonly text: string },
) => Promise<void> | void

/**
 * L22 task 2's plug-in point for "conversation libre avec un agent depuis le
 * canal" — the exact capability L6's own header comment named as explicitly
 * out of scope for `CommandRouter` (see the top of this file). Rather than
 * bolting free text onto the structured-command mechanism (which would make
 * every first word a de-facto command name), a message that does not match
 * any *registered* command name falls through to this handler instead of
 * `{kind: 'unrecognized'}` — same authorization gate as a named command,
 * just evaluated against `requiredRoles` given here instead of a
 * per-command list, since there is no command name to look one up by.
 */
export interface CommandRouterOptions {
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  readonly chat?: {
    readonly requiredRoles: readonly string[]
    readonly handler: ChatHandler
  }
}

/**
 * The routing mechanism task 3 exists to build: parse → look up → the
 * security gate (`authorizeInboundCommand`) → invoke, with no path from a
 * raw inbound string to a handler call that skips authorization. The full
 * command vocabulary (an approval queue's `/approve`, `/deny`, ...) is a
 * later task's job — this is the mechanism they will register into.
 */
export function createCommandRouter(options: CommandRouterOptions): CommandRouter {
  const commands = new Map<string, RegisteredCommand>()

  return {
    register(command) {
      if (commands.has(command.name)) {
        throw new CogentaError({
          code: 'CHANNEL_COMMAND_DUPLICATE',
          message: `A command named "${command.name}" is already registered.`,
          hint: 'Command names must be unique across everything registered on this router.',
          details: { name: command.name },
        })
      }
      commands.set(command.name, command)
    },

    async route(text, identity) {
      // Checked before anything else, including whether the command even
      // exists: an unlinked identity gets silence no matter what it sends,
      // never even an "unknown command" reply — any reply at all would
      // confirm the bot's existence to a stranger.
      if (identity.linkedUserId === null) {
        return { kind: 'unlinked', shouldReply: false }
      }

      const parsed = parseCommand(text)
      if (parsed === null) return { kind: 'invalid', shouldReply: false }

      const command = commands.get(parsed.name)
      if (command === undefined) {
        if (options.chat !== undefined) {
          const decision = await authorizeInboundCommand(
            identity,
            options.chat.requiredRoles,
            options.getUserRoles,
          )
          if (!decision.ok) {
            if (decision.reason === 'unlinked') return { kind: 'unlinked', shouldReply: false }
            return { kind: 'forbidden', shouldReply: true, userId: decision.userId }
          }
          await options.chat.handler({
            args: parsed.args,
            userId: decision.userId,
            identity,
            text,
          })
          return { kind: 'handled', shouldReply: false, userId: decision.userId }
        }
        return { kind: 'unrecognized', shouldReply: true, commandName: parsed.name }
      }

      const decision = await authorizeInboundCommand(
        identity,
        command.requiredRoles,
        options.getUserRoles,
      )

      if (!decision.ok) {
        // decision.reason is always 'forbidden' here — the unlinked case was
        // already returned above, before authorizeInboundCommand was even
        // called — but the type doesn't know that, so narrow explicitly
        // rather than asserting it.
        if (decision.reason === 'unlinked') return { kind: 'unlinked', shouldReply: false }
        return { kind: 'forbidden', shouldReply: true, userId: decision.userId }
      }

      // The handler receives exactly the identified human's userId — never
      // `identity.channelUserId`, never anything parsed from `text`.
      await command.handler({ args: parsed.args, userId: decision.userId, identity })
      return { kind: 'handled', shouldReply: false, userId: decision.userId }
    },
  }
}
