export type {
  AlertChannelMessage,
  ChannelAction,
  ChannelAdapter,
  ChannelIdentity,
  ChannelKeyFigure,
  ChannelMessage,
  ChannelMessageSection,
  ChannelSeverity,
  ChannelTarget,
  InboundCommand,
  InboundHandler,
  MessageId,
  NotificationChannelMessage,
  ReportChannelMessage,
} from './adapter.js'
export type {
  AuthorizationResult,
  AuthorizedResult,
  ForbiddenResult,
  UnlinkedResult,
} from './inbound/authorize.js'
export { authorizeInboundCommand } from './inbound/authorize.js'
export type {
  CommandHandler,
  CommandHandlerInput,
  CommandRouter,
  CommandRouterOptions,
  ParsedCommand,
  RegisteredCommand,
  RouteResult,
} from './inbound/router.js'
export { createCommandRouter, parseCommand } from './inbound/router.js'
export { generateLinkCode, hashLinkCode, normalizeCode } from './linking/codes.js'
export type { ChannelLinkStore, GeneratedLinkCode, LinkedChannel } from './linking/store.js'
export { createChannelLinkStore } from './linking/store.js'
export { ensureChannelTables, LINKING_TABLES } from './linking/tables.js'
export type {
  TelegramAdapter,
  TelegramAdapterOptions,
  TelegramLinkProof,
} from './providers/telegram/adapter.js'
export { createTelegramAdapter } from './providers/telegram/adapter.js'
export type {
  TelegramCallbackQuery,
  TelegramClient,
  TelegramClientConfig,
  TelegramEditMessageParams,
  TelegramIncomingMessage,
  TelegramInlineButton,
  TelegramMessage,
  TelegramReplyMarkup,
  TelegramSendMessageParams,
  TelegramUpdate,
  TelegramUser,
} from './providers/telegram/client.js'
export { createTelegramClient } from './providers/telegram/client.js'
export type { TelegramInboundDeps } from './providers/telegram/inbound.js'
export { createTelegramInboundHandler } from './providers/telegram/inbound.js'
export type { RenderedTelegramMessage } from './providers/telegram/render.js'
export { escapeMarkdownV2, renderTelegramMessage } from './providers/telegram/render.js'
export type { ChannelRegistry } from './registry.js'
export { createChannelRegistry } from './registry.js'
