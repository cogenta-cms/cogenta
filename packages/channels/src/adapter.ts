/**
 * L6 — "Un message est décrit de façon abstraite — titre, sections, niveau
 * de sévérité, actions — et chaque adaptateur le rend selon ses capacités.
 * On n'écrit pas de Markdown Telegram dans le code métier." Three fixed
 * levels (`## Formats de message`), each a distinct shape rather than one
 * loose bag of optional fields, so a caller cannot accidentally send an
 * "Alerte" with no `expectedAction` or a one-line "Notification" carrying a
 * wall of text — the type itself enforces the lot's own formatting rules.
 */
export type ChannelSeverity = 'info' | 'warning' | 'critical'

/** A one-click action on a message (e.g. "Approuver"/"Refuser"). Resolving
 * what `id` means (a single-use approval token, later a lot task) is not
 * this layer's job — this is just the shape a `ChannelAdapter` renders as a
 * button (or, on a channel without `capabilities.buttons`, as a link). */
export interface ChannelAction {
  readonly id: string
  readonly label: string
}

export interface ChannelMessageSection {
  readonly heading?: string
  readonly body: string
}

export interface ChannelKeyFigure {
  readonly label: string
  readonly value: string
}

/** "Titre, gravité, une phrase de contexte, l'action attendue, un lien vers l'admin." */
export interface AlertChannelMessage {
  readonly level: 'alert'
  readonly title: string
  readonly severity: ChannelSeverity
  readonly context: string
  readonly expectedAction: string
  readonly adminUrl: string
  readonly actions?: readonly ChannelAction[]
}

/** "Structure fixe, chiffres clés en tête, détail ensuite, jamais plus d'un
 * écran sans repli." `moreUrl` is that repli (fallback) — the point past
 * which detail lives in the admin, not in the message itself. */
export interface ReportChannelMessage {
  readonly level: 'report'
  readonly title: string
  readonly keyFigures: readonly ChannelKeyFigure[]
  readonly sections: readonly ChannelMessageSection[]
  readonly moreUrl?: string
}

/** "Information sans action. Une ligne." No title, no sections, no actions —
 * the type has nowhere to put them, which is the point. */
export interface NotificationChannelMessage {
  readonly level: 'notification'
  readonly text: string
}

export type ChannelMessage = AlertChannelMessage | ReportChannelMessage | NotificationChannelMessage

/** Opaque handle to a sent message, returned by `send` and usable by `update`. */
export type MessageId = string

/** Where a message goes on a given channel — a platform-side chat/user/channel
 * identifier. Opaque to everything above the adapter: core logic never
 * inspects `id`, it only ever received it from `verifyIdentity`/linking. */
export interface ChannelTarget {
  readonly id: string
}

/**
 * A channel-side identity, always distinct from a Cogenta user account.
 *
 * `linkedUserId` is `null` until L6 task 2's linking flow verifies this
 * channel identity belongs to a real Cogenta user — "Une identité de canal
 * non liée à un compte est ignorée, sans réponse" (the security rule this
 * type exists to make representable, not yet enforced here). Nothing in
 * this package may treat a `null` `linkedUserId` as a real user's identity.
 */
export interface ChannelIdentity {
  readonly channelName: string
  readonly channelUserId: string
  readonly linkedUserId: string | null
}

/**
 * A raw inbound command, always carrying the `ChannelIdentity` it came
 * from — "Une commande entrante s'exécute avec les permissions de l'humain
 * identifié, jamais avec celles de l'agent." A later task's router is what
 * turns `identity.linkedUserId` into real permission checks; this shape
 * exists so that seam cannot be bypassed by construction — there is no way
 * to receive a command without also receiving who (if anyone) sent it.
 */
export interface InboundCommand {
  readonly text: string
  readonly identity: ChannelIdentity
}

export type InboundHandler = (command: InboundCommand) => Promise<void> | void

/**
 * One implementation per platform (Telegram, Slack, Discord, email,
 * webhook — L6 tasks 4/8/9/10/11). `update`/`onInbound` are optional
 * because not every channel supports editing a sent message or receiving
 * commands (`capabilities` says which); `send`/`verifyIdentity` are not
 * optional — every channel can at least deliver a message and check a
 * linking proof.
 */
export interface ChannelAdapter {
  readonly name: string
  readonly capabilities: {
    readonly richText: boolean
    readonly buttons: boolean
    readonly threads: boolean
    readonly attachments: boolean
    readonly inbound: boolean
  }
  send(target: ChannelTarget, message: ChannelMessage): Promise<MessageId>
  update?(id: MessageId, message: ChannelMessage): Promise<void>
  onInbound?(handler: InboundHandler): void
  verifyIdentity(proof: unknown): Promise<ChannelIdentity>
}
