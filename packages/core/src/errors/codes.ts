/**
 * Every error Cogenta throws carries one of these codes. They are a public API:
 * callers branch on them, logs are aggregated by them, and translations key off
 * them. Adding a code is a minor version; changing the meaning of one is major.
 */
export const ERROR_CODES = [
  // Configuration
  'CONFIG_INVALID',
  'CONFIG_NOT_FOUND',
  'CONFIG_LOAD_FAILED',
  'CONFIG_SECRET_IN_FILE',

  // Drivers
  'DRIVER_UNKNOWN',
  'DRIVER_DUPLICATE',
  'DRIVER_UNAVAILABLE',
  'DRIVER_INIT_FAILED',

  // Data
  'DB_UNREACHABLE',
  'DB_DIALECT_UNSUPPORTED',
  'MIGRATION_FAILED',
  'MIGRATION_IRREVERSIBLE',
  'MIGRATION_LOCKED',
  'MIGRATION_CHECKSUM_MISMATCH',
  'MIGRATION_DESTRUCTIVE',

  // Content schema
  'SCHEMA_INVALID',

  // Content
  'CONTENT_NOT_FOUND',
  'CONTENT_INVALID',
  'CONTENT_CONFLICT',
  'CONTENT_SLUG_INVALID',
  'CONTENT_SLUG_TAKEN',
  'CONTENT_ROUTE_INVALID',
  'CONTENT_REDIRECT_LOOP',
  // The admin's redirect screen (audit follow-up to L10 task 2: the store and
  // its wiring into every public GET existed, but nothing ever let an editor
  // create or remove a row from a browser).
  'REDIRECT_UNKNOWN',
  'CONTENT_SCHEDULE_INVALID',
  'CONTENT_READ_ONLY',
  // Trash (`schema@2.0`, ADR-0022). `restrict` is no longer enforced only by
  // the foreign key: trashing is not a DELETE, so the database cannot refuse.
  'CONTENT_REFERENCED',
  'CONTENT_NOT_TRASHED',

  // Taxonomies (`schema@2.0`, ADR-0022)
  'TAXONOMY_UNKNOWN',
  'TAXONOMY_TERM_NOT_FOUND',
  'TAXONOMY_SLUG_TAKEN',
  'TAXONOMY_CYCLE',
  'TAXONOMY_TOO_DEEP',
  'TAXONOMY_NOT_HIERARCHICAL',
  'TAXONOMY_TERM_HAS_CHILDREN',

  // Menus (navigation)
  'MENU_UNKNOWN',
  'MENU_NAME_TAKEN',
  'MENU_ITEM_NOT_FOUND',
  'MENU_ITEM_INVALID',
  'MENU_CYCLE',

  // Blocks
  'BLOCK_UNKNOWN',
  'BLOCK_INVALID',
  'BLOCK_DEFINITION_INVALID',
  'BLOCK_MIGRATION_FAILED',

  // Rendering — skins. A skin is refused, never repaired: contract D freezes the
  // token set precisely so that a generated skin either passes or is rejected.
  'SKIN_TOKEN_MISSING',
  'SKIN_TOKEN_UNKNOWN',
  'SKIN_TOKEN_INVALID',
  'SKIN_CONTRAST_INSUFFICIENT',
  'SKIN_SCALE_NOT_MONOTONIC',
  'SKIN_MOTION_NOT_REDUCED',

  // Themes
  'THEME_NOT_FOUND',
  'THEME_INVALID',
  'THEME_BLOCK_MISSING',
  'THEME_IMPORT_FORBIDDEN',
  'THEME_SIGNATURE_INVALID',

  // Rendering — the content API a theme reads through (ADR-0016)
  'CONTENT_API_FAILED',

  // Rendering — in-process fallback `cogenta serve` uses until a real Astro
  // build exists (no image pipeline is wired into that fallback yet)
  'THEME_IMAGE_UNSUPPORTED',

  // Rendering — build targets. A target that cannot honour a declared runtime
  // need refuses the build; it never degrades silently (ADR-0004).
  'BUILD_TARGET_UNKNOWN',
  'BUILD_RUNTIME_UNSATISFIED',

  // Access
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'PREVIEW_TOKEN_INVALID',
  'PREVIEW_TOKEN_EXPIRED',
  'QUERY_INVALID',
  'REQUEST_BODY_TOO_LARGE',

  // Auth
  'AUTH_PASSWORD_INVALID',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOTP_INVALID',
  'AUTH_TOTP_REQUIRED',
  'AUTH_WEBAUTHN_FAILED',
  'AUTH_SESSION_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_RATE_LIMITED',
  'AUTH_MFA_REQUIRED',
  'AUTH_USER_EXISTS',
  'AUTH_USER_NOT_FOUND',
  'AUTH_ROLE_UNKNOWN',
  'AUDIT_CHAIN_BROKEN',
  // Auth — self-service password reset over HTTP (L11, forgot-password route)
  'AUTH_RESET_TOKEN_INVALID',

  // Auth — account lifecycle (fiche 17: invitations and anonymization)
  // The invitation reuses AUTH_RESET_TOKEN_INVALID for the token itself
  // (same primitive, same failure shape) — these four are the states around
  // it that a reset token was never asked to describe.
  'AUTH_INVITE_UNAVAILABLE',
  'AUTH_INVITE_INVALID_STATE',
  'AUTH_ACCOUNT_ANONYMIZED',
  'AUTH_ANONYMIZE_CONFIRMATION_MISMATCH',

  // API keys (L13 task 8: machine-to-machine bearer tokens)
  'API_KEY_INVALID',
  'API_KEY_REVOKED',
  'API_KEY_EXPIRED',
  'API_KEY_NOT_FOUND',

  // Media
  'MEDIA_NOT_FOUND',
  'MEDIA_INVALID',
  'MEDIA_TYPE_REJECTED',

  // Infrastructure
  'CACHE_FAILED',
  'QUEUE_FAILED',
  'STORAGE_FAILED',

  // Agents — LLM provider adapters (L4)
  'PROVIDER_UNKNOWN',
  'PROVIDER_REQUEST_FAILED',
  'PROVIDER_RESPONSE_INVALID',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',

  // Agents — tool registry (L4)
  'TOOL_DEFINITION_INVALID',
  'TOOL_DUPLICATE',
  'TOOL_UNKNOWN',
  'TOOL_INPUT_INVALID',
  'TOOL_OUTPUT_INVALID',
  'TOOL_CALL_REJECTED',

  // Agents — core tools (L4)
  'HTTP_FETCH_DOMAIN_DENIED',

  // Agents — autonomy and approval (L4)
  'APPROVAL_REQUEST_UNKNOWN',

  // Agents — reversibility (L4)
  'RECEIPT_UNKNOWN',
  'RECEIPT_ALREADY_REVERTED',
  'RECEIPT_NOT_REVERTIBLE',

  // Agents — sub-agents (L4)
  'AGENT_SUBAGENT_UNKNOWN',
  'AGENT_SUBAGENT_TOOLS_NOT_SUBSET',

  // Agents — skills (L4)
  'SKILL_UNKNOWN',
  'SKILL_DEFINITION_INVALID',

  // Agents — memory (L4)
  'AGENT_APPROVAL_NOT_DECIDED',

  // MCP client (L4)
  'MCP_CLIENT_REMOTE_ERROR',
  'MCP_CLIENT_TOOL_FAILED',

  // Agents — privacy (L4)
  'PRIVACY_NO_DATA_LEAVES_VIOLATION',

  // Agents — agent format and registry (L5)
  'AGENT_DEFINITION_INVALID',
  'AGENT_UNKNOWN',

  // Agents — evaluation (L5)
  'EVAL_THRESHOLD_NOT_MET',

  // Agents-builtin — security agent (L5)
  'SECURITY_OSV_QUERY_FAILED',
  'SECURITY_EPSS_QUERY_FAILED',
  'SECURITY_DEPENDENCY_NOT_FOUND',

  // Agents-builtin — performance agent (L5)
  'PERFORMANCE_CRUX_QUERY_FAILED',

  // create-cogenta — blueprints (L9)
  'BLUEPRINT_REGISTRY_CORRUPT',

  // create-cogenta — AI skin generation (L9)
  'SKIN_GENERATION_RESPONSE_NOT_JSON',

  // Import — WordPress WXR (L9)
  'IMPORT_WXR_PARSE_FAILED',
  'IMPORT_WXR_UNSAFE_DOCUMENT',

  // create-cogenta — playground reset (L9)
  'PLAYGROUND_BLUEPRINT_UNKNOWN',

  // Channels — adapter registry (L6)
  'CHANNEL_UNKNOWN',
  'CHANNEL_DUPLICATE',

  // Channels — identity linking (L6 task 2)
  'CHANNEL_LINK_CODE_INVALID',

  // Channels — inbound command routing (L6 task 3)
  'CHANNEL_COMMAND_DUPLICATE',

  // Channels — Telegram adapter (L6 task 4)
  'CHANNEL_TELEGRAM_API_ERROR',

  // Channels — message formats (L6 task 6)
  'CHANNEL_MESSAGE_INVALID',

  // Channels — notification preferences (L6 task 7)
  'CHANNEL_PREFERENCES_INVALID',

  // Channels — email adapter (L6 task 8)
  'CHANNEL_EMAIL_TRANSPORT_ERROR',
  'CHANNEL_EMAIL_INBOUND_UNSUPPORTED',

  // Channels — Slack adapter (L6 task 9)
  'CHANNEL_SLACK_API_ERROR',

  // Channels — Discord adapter (L6 task 10)
  'CHANNEL_DISCORD_API_ERROR',

  // Channels — generic signed webhook (L6 task 11)
  'CHANNEL_WEBHOOK_SIGNATURE_INVALID',
  'CHANNEL_WEBHOOK_EXPIRED',
  'CHANNEL_WEBHOOK_REPLAY_DETECTED',
  'CHANNEL_WEBHOOK_DELIVERY_FAILED',
  'CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED',

  // Plugins — manifest schema and validation (L7 task 1)
  'PLUGIN_MANIFEST_INVALID',

  // Plugins — resolution and loading (L7 task 2)
  'PLUGIN_SOURCE_NOT_FOUND',
  'PLUGIN_MANIFEST_FILE_NOT_FOUND',
  'PLUGIN_MANIFEST_LOAD_FAILED',
  'PLUGIN_MANIFEST_EXPORT_INVALID',

  // Plugins — isolated worker execution (L7 task 3)
  'PLUGIN_WORKER_TIMEOUT',
  'PLUGIN_WORKER_CRASHED',
  'PLUGIN_WORKER_RUNTIME_ERROR',

  // Plugins — capability-gated SDK (L7 task 4)
  'PLUGIN_CAPABILITY_REFUSED',

  // Plugins — resource limits, kill and disable (L7 task 6)
  'PLUGIN_DISABLED',

  // Plugins — signature and verification (L7 task 9)
  'PLUGIN_SIGNATURE_MISSING',
  'PLUGIN_SIGNATURE_INVALID',

  // Fleet — site-side telemetry emission (L8 task 2)
  'FLEET_TELEMETRY_FORBIDDEN_FIELD',

  // Fleet — rollout campaigns (L8 task 7)
  'FLEET_CAMPAIGN_NOT_FOUND',
  'FLEET_CAMPAIGN_STATE_CORRUPT',

  // Fleet — per-site rollback (L8 task 8)
  'FLEET_ROLLBACK_NO_PRIOR_VERSION',

  // Agents — document text extraction (L19 task 1)
  'DOCUMENT_FORMAT_UNSUPPORTED',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_EXTRACTION_FAILED',
  'DOCUMENT_NO_TEXT_LAYER',

  // Agents — AI-driven site planning (L19 tasks 2, 3, 4, 5)
  'SITE_BRIEF_RESPONSE_INVALID',
  'SITE_BRIEF_GENERATION_FAILED',
  'CONTENT_MODEL_PROPOSAL_INVALID',
  'CONTENT_MODEL_PROPOSAL_PERMISSIONS_UNSAFE',
  'SITE_PLAN_CONSTRAINT_VIOLATED',
  'SITE_PLAN_DECISION_MISSING',
  'SITE_PLAN_DECISION_UNKNOWN_ITEM',
  'SITE_PLAN_DRAFT_NOT_FOUND',
  'SITE_PLAN_NO_PROVIDER',
  'SKIN_CANDIDATES_INSUFFICIENT',

  // Commerce — money and currency (L15, contract E)
  'COMMERCE_AMOUNT_INVALID',
  'COMMERCE_CURRENCY_INVALID',
  'COMMERCE_CURRENCY_MISMATCH',

  // Commerce — catalogue and stock (L15 task 2)
  'COMMERCE_PRODUCT_INVALID',
  'COMMERCE_PRODUCT_NOT_FOUND',
  'COMMERCE_VARIANT_NOT_FOUND',
  'COMMERCE_SKU_TAKEN',
  'COMMERCE_OUT_OF_STOCK',

  // Commerce — cart and totals (L15 task 3)
  'COMMERCE_CART_NOT_FOUND',
  'COMMERCE_CART_CLOSED',
  'COMMERCE_CART_EMPTY',
  'COMMERCE_QUANTITY_INVALID',

  // Commerce — orders (L15 task 4)
  'COMMERCE_ORDER_NOT_FOUND',
  'COMMERCE_ORDER_TRANSITION_INVALID',

  // Commerce — payment drivers (L15 task 5)
  'COMMERCE_PAYMENT_NOT_FOUND',
  'COMMERCE_PAYMENT_FAILED',
  'COMMERCE_PAYMENT_UNSUPPORTED',
  'COMMERCE_PAYMENT_SIGNATURE_INVALID',
  'COMMERCE_REFUND_EXCEEDS_PAYMENT',

  // Commerce — tax and shipping (L15 task 6)
  'COMMERCE_TAX_RULE_INVALID',
  'COMMERCE_SHIPPING_METHOD_UNKNOWN',
  'COMMERCE_SHIPPING_UNAVAILABLE',

  // Commerce — coupons and promotions (L15 task 7)
  'COMMERCE_COUPON_NOT_FOUND',
  'COMMERCE_COUPON_INVALID',
  'COMMERCE_COUPON_EXHAUSTED',

  // Commerce — invoices (L15 task 8)
  'COMMERCE_INVOICE_NOT_FOUND',
  'COMMERCE_INVOICE_ALREADY_ISSUED',
  'COMMERCE_INVOICE_SEQUENCE_CONFLICT',

  // Commerce — subscriptions (L15 task 9)
  'COMMERCE_SUBSCRIPTION_NOT_FOUND',
  'COMMERCE_SUBSCRIPTION_INVALID',

  // Agents — vector store driver (L18 task 1/5)
  'VECTOR_DIMENSION_MISMATCH',
  'VECTOR_STORE_FAILED',

  // Agents — writing/assistant tools (L18 tasks 2-8)
  'ASSIST_UNAVAILABLE',
  'ASSIST_RESPONSE_INVALID',

  // Marketplace — catalog and one-click install (L17)
  'MARKETPLACE_ITEM_NOT_FOUND',
  'MARKETPLACE_KIND_UNSUPPORTED',
  'MARKETPLACE_ALREADY_INSTALLED',
  'MARKETPLACE_NOT_INSTALLED',
  'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',

  // Analytics — self-hosted, cookie-free page-view analytics (`@cogenta/analytics`)
  'ANALYTICS_SALT_UNAVAILABLE',

  // Catch-all, deliberately last and deliberately rare.
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
