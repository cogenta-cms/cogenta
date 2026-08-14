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
export type { ApprovalCommandsOptions } from './approvals/commands.js'
export { createApprovalCommands } from './approvals/commands.js'
export type { DispatchApprovalOptions } from './approvals/dispatch.js'
export { dispatchApproval } from './approvals/dispatch.js'
export type { RenderApprovalMessageOptions } from './approvals/message.js'
export { renderApprovalMessage } from './approvals/message.js'
export {
  buildSignedApprovalLink,
  signApprovalLink,
  verifyApprovalLinkSignature,
} from './approvals/signed-link.js'
export type {
  ApprovalTokenOutcome,
  ApprovalTokenStore,
  ApprovalTokenStoreOptions,
  GeneratedApprovalToken,
} from './approvals/store.js'
export { createApprovalTokenStore } from './approvals/store.js'
export {
  APPROVAL_TOKEN_TTL_MS,
  generateApprovalToken,
  hashApprovalToken,
  normalizeApprovalToken,
} from './approvals/token.js'
export type { BuildAlertInput } from './formats/alert.js'
export { buildAlert } from './formats/alert.js'
export { REPORT_SCREEN_BUDGET_CHARS } from './formats/budget.js'
export { buildNotification } from './formats/notification.js'
export type { BuildReportInput } from './formats/report.js'
export { buildReport } from './formats/report.js'
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
  CreateNotificationDispatcherOptions,
  NotificationDispatcher,
  NotifyInput,
  NotifyOutcome,
} from './preferences/dispatcher.js'
export { createNotificationDispatcher } from './preferences/dispatcher.js'
export { isWithinQuietHours, minuteOfDayUtc } from './preferences/quiet-hours.js'
export type { PreferenceStore } from './preferences/store.js'
export { createPreferenceStore } from './preferences/store.js'
export { ensurePreferenceTables, PREFERENCE_TABLES } from './preferences/tables.js'
export type {
  ChannelEventType,
  ChannelPreferences,
  GroupingMode,
  QuietHours,
} from './preferences/types.js'
export {
  CHANNEL_EVENT_TYPES,
  DEFAULT_CHANNEL_PREFERENCES,
  SEVERITY_RANK,
} from './preferences/types.js'
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
